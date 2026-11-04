const { test } = require('node:test');
const assert = require('node:assert/strict');

// Verify that the farmHandlers module exports channels for all accounting operations
// that the preload bridge exposes. This is a regression test for the missing
// accounting IPC bridge that caused the Accounting page to crash in Electron mode.

const farmHandlersSrc = require('fs').readFileSync(
  require('path').join(__dirname, '..', 'src', 'ipc', 'farmHandlers.js'),
  'utf8',
);

const preloadSrc = require('fs').readFileSync(
  require('path').join(__dirname, '..', 'src', 'preload.js'),
  'utf8',
);

const REQUIRED_CHANNELS = [
  'accounting:accounts',
  'accounting:createAccount',
  'accounting:journals',
  'accounting:createJournal',
  'accounting:reverseJournal',
  'accounting:ledger',
  'accounting:trialBalance',
  'accounting:profitLoss',
  'accounting:balanceSheet',
  'accounting:fiscalPeriods',
  'accounting:createFiscalPeriod',
  'accounting:closeFiscalPeriod',
  'accounting:openingBalances',
  'accounting:setOpeningBalance',
  'treasury:cashboxes',
];

test('farmHandlers registers all required IPC channels', () => {
  for (const channel of REQUIRED_CHANNELS) {
    assert.ok(
      farmHandlersSrc.includes(`'${channel}'`),
      `farmHandlers.js is missing channel: ${channel}`,
    );
  }
});

test('preload exposes all required IPC channels to the renderer', () => {
  for (const channel of REQUIRED_CHANNELS) {
    assert.ok(
      preloadSrc.includes(`'${channel}'`),
      `preload.js is missing channel: ${channel}`,
    );
  }
});

test('preload exposes accounting namespace with all methods', () => {
  assert.ok(preloadSrc.includes('accounting:'), 'preload must expose accounting namespace');
  const methods = ['accounts', 'createAccount', 'journals', 'createJournal', 'reverseJournal', 'ledger', 'trialBalance', 'profitLoss', 'balanceSheet'];
  for (const method of methods) {
    assert.ok(
      preloadSrc.includes(`${method}:`),
      `preload.js is missing accounting method: ${method}`,
    );
  }
});

test('preload exposes treasury.cashboxes', () => {
  assert.ok(
    preloadSrc.includes('cashboxes:'),
    'preload.js must expose treasury.cashboxes',
  );
});
