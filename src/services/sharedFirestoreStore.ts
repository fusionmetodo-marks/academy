import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import {
  getQuotaCacheMultiplier,
  isQuotaExhaustedError,
  markFirestoreQuotaExhausted,
  recordMeteredFirestoreReads,
  recordSavedCacheReads,
} from './firestoreQuotaService';
import {
  createSimulatedQuotaExceededError,
  isDailyReadAccessDisabledSync,
  subscribeReadAccessChanged,
} from './firestoreReadGuardState';
import { waitForInitialReadGuardSync } from './guardedFirestore';

/**
 * Tempo que um listener compartilhado permanece aquecido em memória após a troca de página
 * (evita reler toda a coleção ao navegar entre Dashboard, Diretório, Análise, Conteúdo e Mensagens).
 */
const COLLECTION_KEEP_ALIVE_MS = 5 * 60 * 1000; // 5 minutos

type UnsubscribeFn = () => void;

interface SharedCollectionChannel<T> {
  latestItems: T[] | null;
  latestSize: number;
  subscribers: Set<(items: T[], size: number) => void>;
  errorSubscribers: Set<(err: unknown) => void>;
  firestoreUnsub: UnsubscribeFn | null;
  teardownTimer: ReturnType<typeof setTimeout> | null;
}

function createSharedCollectionChannel<T>(
  collectionName: string,
  mapDocs: (snap: QuerySnapshot<DocumentData>) => T[]
) {
  const channel: SharedCollectionChannel<T> = {
    latestItems: null,
    latestSize: 0,
    subscribers: new Set(),
    errorSubscribers: new Set(),
    firestoreUnsub: null,
    teardownTimer: null,
  };

  let isFirstSnapshotForSession = true;

  const stopFirestoreListener = () => {
    if (channel.teardownTimer) {
      clearTimeout(channel.teardownTimer);
      channel.teardownTimer = null;
    }
    if (channel.firestoreUnsub) {
      channel.firestoreUnsub();
      channel.firestoreUnsub = null;
    }
    channel.latestItems = null;
    channel.latestSize = 0;
    isFirstSnapshotForSession = true;
  };

  const ensureStarted = () => {
    if (channel.teardownTimer) {
      clearTimeout(channel.teardownTimer);
      channel.teardownTimer = null;
    }
    if (channel.firestoreUnsub) return;

    isFirstSnapshotForSession = true;
    channel.firestoreUnsub = onSnapshot(
      collection(db, collectionName),
      (snap) => {
        if (isFirstSnapshotForSession) {
          recordMeteredFirestoreReads(Math.max(1, snap.size));
          isFirstSnapshotForSession = false;
        } else {
          const delta = snap.docChanges().length;
          if (delta > 0) recordMeteredFirestoreReads(delta);
        }

        const mapped = mapDocs(snap);
        channel.latestItems = mapped;
        channel.latestSize = snap.size;
        channel.subscribers.forEach((cb) => {
          try {
            cb(mapped, snap.size);
          } catch (cbErr) {
            console.warn(`Erro no callback compartilhado de ${collectionName}:`, cbErr);
          }
        });
      },
      (err) => {
        console.warn(`Erro no listener compartilhado de ${collectionName}:`, err);
        if (isQuotaExhaustedError(err)) {
          markFirestoreQuotaExhausted();
        }
        channel.errorSubscribers.forEach((errCb) => {
          try {
            errCb(err);
          } catch {
            // ignore
          }
        });
      }
    );
  };

  const subscribe = (
    onUpdate: (items: T[], size: number) => void,
    onError?: (err: unknown) => void
  ): UnsubscribeFn => {
    channel.subscribers.add(onUpdate);
    if (onError) channel.errorSubscribers.add(onError);

    if (!isDailyReadAccessDisabledSync() && channel.latestItems !== null) {
      recordSavedCacheReads(Math.max(1, channel.latestSize));
      try {
        onUpdate(channel.latestItems, channel.latestSize);
      } catch (cbErr) {
        console.warn(`Erro ao entregar cache inicial de ${collectionName}:`, cbErr);
      }
    }

    ensureStarted();

    return () => {
      channel.subscribers.delete(onUpdate);
      if (onError) channel.errorSubscribers.delete(onError);

      if (channel.subscribers.size === 0 && !channel.teardownTimer) {
        channel.teardownTimer = setTimeout(() => {
          if (channel.subscribers.size === 0) {
            stopFirestoreListener();
          }
        }, COLLECTION_KEEP_ALIVE_MS);
      }
    };
  };

  const restartIfActive = () => {
    if (channel.subscribers.size > 0) {
      ensureStarted();
    }
  };

  const clearAndNotifyBlocked = (err: unknown) => {
    stopFirestoreListener();
    channel.subscribers.forEach((cb) => {
      try {
        cb([], 0);
      } catch {
        // ignore
      }
    });
    channel.errorSubscribers.forEach((errCb) => {
      try {
        errCb(err);
      } catch {
        // ignore
      }
    });
  };

  return {
    subscribe,
    clear: stopFirestoreListener,
    clearAndNotifyBlocked,
    restartIfActive,
    getLatest: () => channel.latestItems,
  };
}

const mapRawDocs = (snap: QuerySnapshot<DocumentData>): any[] => {
  const list: any[] = [];
  snap.forEach((d) => {
    list.push({ id: d.id, ...d.data() });
  });
  return list;
};

const sharedUsersChannel = createSharedCollectionChannel<any>('users', mapRawDocs);
const sharedCoursesChannel = createSharedCollectionChannel<any>('courses', mapRawDocs);
const sharedTransactionsChannel = createSharedCollectionChannel<any>('transactions', mapRawDocs);

export const subscribeSharedUsers = sharedUsersChannel.subscribe;
export const subscribeSharedCourses = sharedCoursesChannel.subscribe;
export const subscribeSharedTransactions = sharedTransactionsChannel.subscribe;

// Cache em memória + deduplicação de leituras pontuais (settings, perfis, etc.)
interface DocCacheEntry<T> {
  exists: boolean;
  data: T | null;
  fetchedAt: number;
}

const docCache = new Map<string, DocCacheEntry<any>>();
const inflightDocRequests = new Map<string, Promise<DocCacheEntry<any>>>();

export async function getCachedDocument<T = Record<string, any>>(
  collectionName: string,
  docId: string,
  ttlMs: number = 15 * 60 * 1000
): Promise<T | null> {
  if (!collectionName || !docId) return null;
  await waitForInitialReadGuardSync();
  if (isDailyReadAccessDisabledSync()) {
    return null;
  }
  const cacheKey = `${collectionName}/${docId}`;
  const now = Date.now();
  const cached = docCache.get(cacheKey);
  const effectiveTtlMs = ttlMs * getQuotaCacheMultiplier();

  if (cached && now - cached.fetchedAt < effectiveTtlMs) {
    recordSavedCacheReads(1);
    return cached.exists ? (cached.data as T) : null;
  }

  const inflight = inflightDocRequests.get(cacheKey);
  if (inflight) {
    recordSavedCacheReads(1);
    const res = await inflight;
    return res.exists ? (res.data as T) : null;
  }

  const requestPromise = (async (): Promise<DocCacheEntry<any>> => {
    try {
      const snap = await getDoc(doc(db, collectionName, docId));
      recordMeteredFirestoreReads(1);
      const entry: DocCacheEntry<any> = {
        exists: snap.exists(),
        data: snap.exists() ? { id: snap.id, ...snap.data() } : null,
        fetchedAt: Date.now(),
      };
      docCache.set(cacheKey, entry);
      return entry;
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        markFirestoreQuotaExhausted();
      }
      if (isDailyReadAccessDisabledSync()) {
        return { exists: false, data: null, fetchedAt: 0 };
      }
      return cached || { exists: false, data: null, fetchedAt: 0 };
    } finally {
      inflightDocRequests.delete(cacheKey);
    }
  })();

  inflightDocRequests.set(cacheKey, requestPromise);
  const result = await requestPromise;
  return result.exists ? (result.data as T) : null;
}

export async function getCachedUserProfile(
  uid: string,
  ttlMs: number = 5 * 60 * 1000
): Promise<Record<string, any> | null> {
  if (!uid) return null;
  await waitForInitialReadGuardSync();
  if (isDailyReadAccessDisabledSync()) {
    return null;
  }
  const warmUsers = sharedUsersChannel.getLatest();
  if (warmUsers) {
    const found = warmUsers.find((u) => u.id === uid);
    if (found) {
      recordSavedCacheReads(1);
      return found;
    }
  }
  return getCachedDocument<Record<string, any>>('users', uid, ttlMs);
}

export function invalidateSharedDocCache(collectionName: string, docId: string): void {
  docCache.delete(`${collectionName}/${docId}`);
}

export function clearSharedFirestoreStore(): void {
  sharedUsersChannel.clear();
  sharedCoursesChannel.clear();
  sharedTransactionsChannel.clear();
  docCache.clear();
}

// Limpa caches admin ao encerrar sessão para não manter listeners indevidos abertos
if (typeof window !== 'undefined') {
  let prevUid: string | null = null;
  onAuthStateChanged(auth, (u) => {
    const nextUid = u?.uid || null;
    if (prevUid && !nextUid) {
      clearSharedFirestoreStore();
    }
    prevUid = nextUid;
  });
}

subscribeReadAccessChanged((disabled) => {
  if (disabled) {
    docCache.clear();
    const err = createSimulatedQuotaExceededError();
    [sharedUsersChannel, sharedCoursesChannel, sharedTransactionsChannel].forEach((ch) => {
      ch.clearAndNotifyBlocked(err);
    });
  } else {
    sharedUsersChannel.restartIfActive();
    sharedCoursesChannel.restartIfActive();
    sharedTransactionsChannel.restartIfActive();
  }
});
