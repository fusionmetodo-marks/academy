export const FIRESTORE_READ_ACCESS_CHANGED_EVENT = 'firestore-read-access-changed';
const QUOTA_STORAGE_KEY = 'mb_firestore_quota_tracker_v1';

function getPacificCycleKey(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

function readInitialDisabledFlag(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { cycleKey?: string; dailyReadAccessDisabled?: boolean };
    if (parsed?.cycleKey && parsed.cycleKey !== getPacificCycleKey()) {
      return false;
    }
    return parsed?.dailyReadAccessDisabled === true;
  } catch {
    return false;
  }
}

let dailyReadAccessDisabledFlag: boolean = readInitialDisabledFlag();
const guardListeners = new Set<(disabled: boolean) => void>();

export function isDailyReadAccessDisabledSync(): boolean {
  return dailyReadAccessDisabledFlag;
}

export function setDailyReadAccessDisabledSync(disabled: boolean): void {
  const next = Boolean(disabled);
  const changed = dailyReadAccessDisabledFlag !== next;
  dailyReadAccessDisabledFlag = next;

  if (changed) {
    guardListeners.forEach((cb) => {
      try {
        cb(next);
      } catch {
        // ignore listener error
      }
    });

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent(FIRESTORE_READ_ACCESS_CHANGED_EVENT, {
            detail: { disabled: next },
          })
        );
      } catch {
        // ignore event dispatch error
      }
    }
  }
}

export function subscribeReadAccessChanged(cb: (disabled: boolean) => void): () => void {
  guardListeners.add(cb);
  return () => {
    guardListeners.delete(cb);
  };
}

export function createSimulatedQuotaExceededError(): Error & { code: string } {
  const err = new Error(
    'Quota exceeded: Acesso de leitura diário desligado (simulação de cota diária atingida).'
  ) as Error & { code: string };
  err.name = 'FirebaseError';
  err.code = 'resource-exhausted';
  return err;
}
