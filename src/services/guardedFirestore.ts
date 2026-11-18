import * as rawFirestore from 'firebase/firestore';
import {
  createSimulatedQuotaExceededError,
  isDailyReadAccessDisabledSync,
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

export const getDoc: typeof rawFirestore.getDoc = ((...args: any[]) => {
  if (isDailyReadAccessDisabledSync()) {
    return Promise.reject(createSimulatedQuotaExceededError());
  }
  return (rawFirestore.getDoc as any)(...args);
}) as typeof rawFirestore.getDoc;

export const getDocFromServer: typeof rawFirestore.getDocFromServer = ((...args: any[]) => {
  if (isDailyReadAccessDisabledSync()) {
    return Promise.reject(createSimulatedQuotaExceededError());
  }
  return (rawFirestore.getDocFromServer as any)(...args);
}) as typeof rawFirestore.getDocFromServer;

export const getDocFromCache: typeof rawFirestore.getDocFromCache = ((...args: any[]) => {
  if (isDailyReadAccessDisabledSync()) {
    return Promise.reject(createSimulatedQuotaExceededError());
  }
  return (rawFirestore.getDocFromCache as any)(...args);
}) as typeof rawFirestore.getDocFromCache;

export const getDocs: typeof rawFirestore.getDocs = ((...args: any[]) => {
  if (isDailyReadAccessDisabledSync()) {
    return Promise.reject(createSimulatedQuotaExceededError());
  }
  return (rawFirestore.getDocs as any)(...args);
}) as typeof rawFirestore.getDocs;

export const getDocsFromServer: typeof rawFirestore.getDocsFromServer = ((...args: any[]) => {
  if (isDailyReadAccessDisabledSync()) {
    return Promise.reject(createSimulatedQuotaExceededError());
  }
  return (rawFirestore.getDocsFromServer as any)(...args);
}) as typeof rawFirestore.getDocsFromServer;

export const getDocsFromCache: typeof rawFirestore.getDocsFromCache = ((...args: any[]) => {
  if (isDailyReadAccessDisabledSync()) {
    return Promise.reject(createSimulatedQuotaExceededError());
  }
  return (rawFirestore.getDocsFromCache as any)(...args);
}) as typeof rawFirestore.getDocsFromCache;

export const getCountFromServer: typeof rawFirestore.getCountFromServer = ((...args: any[]) => {
  if (isDailyReadAccessDisabledSync()) {
    return Promise.reject(createSimulatedQuotaExceededError());
  }
  return (rawFirestore.getCountFromServer as any)(...args);
}) as typeof rawFirestore.getCountFromServer;

export const runTransaction: typeof rawFirestore.runTransaction = ((...args: any[]) => {
  if (isDailyReadAccessDisabledSync()) {
    return Promise.reject(createSimulatedQuotaExceededError());
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

    // first is SnapshotListenOptions
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

  if (isDailyReadAccessDisabledSync()) {
    stopRealListenerAndEmitError();
  } else {
    startRealListener();
  }

  const unsubGuard = subscribeReadAccessChanged((disabled) => {
    if (isUnsubscribed) return;
    if (disabled) {
      stopRealListenerAndEmitError();
    } else {
      startRealListener();
    }
  });

  return () => {
    isUnsubscribed = true;
    unsubGuard();
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
