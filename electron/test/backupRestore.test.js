const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase, createBackup } = require('../src/db/database');
const { restoreBackup } = require('../src/services/backupService');
const { UserFacingError } = require('../src/errors');

function setup() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-restore-'));
  const database = openDatabase(userData);
  return { userData, database, cleanup: () => fs.rmSync(userData, { recursive: true, force: true }) };
}

test('a restore replaces the live database with the backup contents', async () => {
  const { database, cleanup } = setup();
  try {
    const backupPath = await createBackup(database.db, database.backupDir);
    database.db.exec('CREATE TABLE after_backup (id INTEGER)');
    await restoreBackup(database.db, {
      liveFilePath: database.filePath,
      backupDir: database.backupDir,
      backupFilePath: backupPath,
    });
    assert.equal(database.db.open, false);
    const reopened = openDatabase(path.dirname(path.dirname(database.filePath)));
    const marker = reopened.db.prepare("SELECT name FROM sqlite_master WHERE name = 'after_backup'").get();
    assert.equal(marker, undefined);
    assert.ok(reopened.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n > 0);
    reopened.db.close();
  } finally {
    cleanup();
  }
});

test('a corrupt backup is refused and the live database stays open and unchanged', async () => {
  const { database, cleanup } = setup();
  try {
    database.db.exec('CREATE TABLE keep_me (id INTEGER)');
    const corrupt = path.join(database.backupDir, 'farm-backup-corrupt.db');
    fs.writeFileSync(corrupt, 'not a sqlite file');
    await assert.rejects(
      restoreBackup(database.db, { liveFilePath: database.filePath, backupDir: database.backupDir, backupFilePath: corrupt }),
      (error) => error instanceof UserFacingError,
    );
    assert.equal(database.db.open, true);
    assert.ok(database.db.prepare("SELECT name FROM sqlite_master WHERE name = 'keep_me'").get());
    assert.equal(fs.existsSync(`${database.filePath}.restore-tmp`), false);
    database.db.close();
  } finally {
    cleanup();
  }
});

test('a backup file outside the backup folder is refused before anything changes', async () => {
  const { database, cleanup } = setup();
  try {
    const outside = path.join(os.tmpdir(), 'farm-backup-outside.db');
    fs.copyFileSync(database.filePath, outside);
    await assert.rejects(
      restoreBackup(database.db, { liveFilePath: database.filePath, backupDir: database.backupDir, backupFilePath: outside }),
      (error) => error instanceof UserFacingError,
    );
    assert.equal(database.db.open, true);
    fs.rmSync(outside, { force: true });
    database.db.close();
  } finally {
    cleanup();
  }
});
