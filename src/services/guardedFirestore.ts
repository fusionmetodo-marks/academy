import * as rawFirestore from 'firebase/firestore';
import {
  createSimulatedQuotaExceededError,
  isDailyReadAccessDisabledSync,
  setDailyReadAccessDisabledSync,
  subscribeReadAccessChanged,
} from './firestoreReadGuardState';

export {
  Timestamp,
  FieldValue,
  GeoPoint,
  Bytes,
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  setLogLevel,
  doc,
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  limitToLast,
  startAt,
  startAfter,
  endAt,
  endBefore,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  deleteField,
  documentId,
  enableNetwork,
  disableNetwork,
  type DocumentData,
  type QuerySnapshot,
  type DocumentSnapshot,
  type DocumentReference,
  type CollectionReference,
  type Query,
  type Unsubscribe,
  type Firestore,
  type FirestoreError,
} from 'firebase/firestore';

let globalSyncStarted = false;
let initialSyncPromise: Promise<void> = Promise.resolve();

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

function parseRemoteReadDisabled(data: Record<string, any> | undefined): boolean {
  if (!data || data.dailyReadAccessDisabled !== true) return false;
  if (data.cycleKey && data.cycleKey !== getPacificCycleKey()) return false;
  return true;
}

export function initGlobalReadQuotaSync(db: rawFirestore.Firestore): void {
  if (globalSyncStarted || typeof window === 'undefined') return;
  globalSyncStarted = true;

  const controlRef = rawFirestore.doc(db, 'settings', 'readQuotaControl');

  const fetchInitial = async () => {
    try {
      const snap = await rawFirestore.getDocFromServer(controlRef);
      const disabled = snap.exists() ? parseRemoteReadDisabled(snap.data()) : false;
      setDailyReadAccessDisabledSync(disabled);
    } catch {
      // Offline, missing permissions, or real quota exceeded — fallback gracefully
    }
  };

  initialSyncPromise = Promise.race([
    fetchInitial(),
    new Promise<void>((resolve) => setTimeout(resolve, 1500)),
  ]);

  rawFirestore.onSnapshot(
    controlRef,
    (snap) => {
      if (snap.metadata?.fromCache) return;
      const disabled = snap.exists() ? parseRemoteReadDisabled(snap.data()) : false;
      setDailyReadAccessDisabledSync(disabled);
    },
    () => {
      // Ignore transient listener errors if offline or real 429 occurs
    }
  );
}

export async function waitForInitialReadGuardSync(): Promise<void> {
  await initialSyncPromise;
}

export const getDoc: typeof rawFirestore.getDoc = (async (...args: any[]) => {
  await initialSyncPromise;
  if (isDailyReadAccessDisabledSync()) {
    throw createSimulatedQuotaExceededError();
  }
  return (rawFirestore.getDoc as any)(...args);
}) as typeof rawFirestore.getDoc;

export const getDocFromServer: typeof rawFirestore.getDocFromServer = (async (...args: any[]) => {
  await initialSyncPromise;
  if (isDailyReadAccessDisabledSync()) {
    throw createSimulatedQuotaExceededError();
  }
  return (rawFirestore.getDocFromServer as any)(...args);
}) as typeof rawFirestore.getDocFromServer;

export const getDocFromCache: typeof rawFirestore.getDocFromCache = (async (...args: any[]) => {
  await initialSyncPromise;
  if (isDailyReadAccessDisabledSync()) {
    throw createSimulatedQuotaExceededError();
  }
  return (rawFirestore.getDocFromCache as any)(...args);
}) as typeof rawFirestore.getDocFromCache;

export const getDocs: typeof rawFirestore.getDocs = (async (...args: any[]) => {
  await initialSyncPromise;
  if (isDailyReadAccessDisabledSync()) {
    throw createSimulatedQuotaExceededError();
  }
  return (rawFirestore.getDocs as any)(...args);
}) as typeof rawFirestore.getDocs;

export const getDocsFromServer: typeof rawFirestore.getDocsFromServer = (async (...args: any[]) => {
  await initialSyncPromise;
  if (isDailyReadAccessDisabledSync()) {
    throw createSimulatedQuotaExceededError();
  }
  return (rawFirestore.getDocsFromServer as any)(...args);
}) as typeof rawFirestore.getDocsFromServer;

export const getDocsFromCache: typeof rawFirestore.getDocsFromCache = (async (...args: any[]) => {
  await initialSyncPromise;
  if (isDailyReadAccessDisabledSync()) {
    throw createSimulatedQuotaExceededError();
  }
  return (rawFirestore.getDocsFromCache as any)(...args);
}) as typeof rawFirestore.getDocsFromCache;

export const getCountFromServer: typeof rawFirestore.getCountFromServer = (async (...args: any[]) => {
  await initialSyncPromise;
  if (isDailyReadAccessDisabledSync()) {
    throw createSimulatedQuotaExceededError();
  }
  return (rawFirestore.getCountFromServer as any)(...args);
}) as typeof rawFirestore.getCountFromServer;

export const runTransaction: typeof rawFirestore.runTransaction = (async (...args: any[]) => {
  await initialSyncPromise;
  if (isDailyReadAccessDisabledSync()) {
    throw createSimulatedQuotaExceededError();
  }
  return (rawFirestore.runTransaction as any)(...args);
}) as typeof rawFirestore.runTransaction;

function extractOnSnapshotErrorCallback(rest: any[]): ((err: any) => void) | undefined {
  if (!rest || rest.length === 0) return undefined;
  const first = rest[0];

  if (typeof first === 'function') {
    return typeof rest[1] === 'function' ? rest[1] : undefined;
  }

  if (first && typeof first === 'object') {
    const isObserver =
      typeof first.next === 'function' ||
      typeof first.error === 'function' ||
      typeof first.complete === 'function';

    if (isObserver) {
      return typeof first.error === 'function' ? first.error.bind(first) : undefined;
    }

    const second = rest[1];
    if (typeof second === 'function') {
      return typeof rest[2] === 'function' ? rest[2] : undefined;
    }
    if (second && typeof second === 'object' && typeof second.error === 'function') {
      return second.error.bind(second);
    }
  }

  return undefined;
}

export const onSnapshot: typeof rawFirestore.onSnapshot = ((...allArgs: any[]) => {
  const [reference, ...rest] = allArgs;
  const onErrorCb = extractOnSnapshotErrorCallback(rest);

  let isUnsubscribed = false;
  let activeRealUnsub: (() => void) | null = null;
  let unsubGuard: (() => void) | null = null;

  const startRealListener = () => {
    if (isUnsubscribed || activeRealUnsub) return;
    activeRealUnsub = (rawFirestore.onSnapshot as any)(reference, ...rest);
  };

  const stopRealListenerAndEmitError = () => {
    if (activeRealUnsub) {
      try {
        activeRealUnsub();
      } catch {
        // ignore unsubscribe error
      }
      activeRealUnsub = null;
    }
    if (!isUnsubscribed && onErrorCb) {
      queueMicrotask(() => {
        if (!isUnsubscribed) {
          onErrorCb(createSimulatedQuotaExceededError());
        }
      });
    }
  };

  initialSyncPromise.then(() => {
    if (isUnsubscribed) return;

    if (isDailyReadAccessDisabledSync()) {
      stopRealListenerAndEmitError();
    } else {
      startRealListener();
    }

    unsubGuard = subscribeReadAccessChanged((disabled) => {
      if (isUnsubscribed) return;
      if (disabled) {
        stopRealListenerAndEmitError();
      } else {
        startRealListener();
      }
    });
  });

  return () => {
    isUnsubscribed = true;
    if (unsubGuard) {
      unsubGuard();
      unsubGuard = null;
    }
    if (activeRealUnsub) {
      try {
        activeRealUnsub();
      } catch {
        // ignore unsubscribe error
      }
      activeRealUnsub = null;
    }
  };
}) as typeof rawFirestore.onSnapshot;
