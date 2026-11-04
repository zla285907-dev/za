import { useEffect, useState, useCallback } from 'react';
import { getDb } from '@/db/db';
import { isElectronAvailable } from '@/lib/electronBridge';

interface UseDbInitResult {
  ready: boolean;
  error: string | null;
}

/** يقوم بتهيئة قاعدة البيانات عند بدء التشغيل */
export function useDbInit(): UseDbInitResult {
  const [ready, setReady] = useState(() => isElectronAvailable());
  const [error, setError] = useState<string | null>(null);

  const init = useCallback(async () => {
    if (isElectronAvailable()) return;
    try {
      await getDb();
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  return { ready, error };
}
