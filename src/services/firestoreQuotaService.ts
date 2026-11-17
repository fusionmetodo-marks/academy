import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase';

export const FIRESTORE_SPARK_LIMITS = {
  readUnitsDaily: 50_000,
  realtimeUpdateUnitsDaily: 50_000,
  writeUnitsDaily: 40_000,
  eventUnitsDaily: 10_000,
  storedDataGiB: 1,
  egressMonthlyGiB: 10,
} as const;

export const FIREBASE_CONSOLE_UPGRADE_URL =
  'https://console.firebase.google.com/project/gen-lang-client-0254007569/firestore/databases/ai-studio-marksomonstroaca-a9cb74d8-6417-439c-9170-934008f6df29/data?openUpgradeDialog=true';

export const FIREBASE_CONSOLE_USAGE_URL =
  'https://console.firebase.google.com/project/gen-lang-client-0254007569/firestore/databases/ai-studio-marksomonstroaca-a9cb74d8-6417-439c-9170-934008f6df29/usage';

export const FIRESTORE_PRICING_DOCS_URL =
  'https://firebase.google.com/pricing#cloud-firestore';

export type QuotaEconomyMode = 'normal' | 'economic' | 'emergency';

export interface FirestoreQuotaSnapshot {
  cycleKey: string;
  sessionReads: number;
  sessionWrites: number;
  savedReadsByCache: number;
  consoleReadsOffset: number | null;
  consoleWritesOffset: number | null;
  quotaExhaustedDetected: boolean;
  lastExhaustedAtMs: number | null;
  lastProbeStatus: 'unknown' | 'ok' | 'exhausted' | 'error';
  lastProbeMessage: string | null;
  lastProbeAtMs: number | null;
  economyMode: QuotaEconomyMode;
  pauseBackgroundSchedulers: boolean;
  warningThresholdPct: number;
}

export interface DailyQuotaHistoryEntry {
  cycleKey: string;
  label: string;
  reads: number;
  writes: number;
  savedByCache: number;
  exhausted: boolean;
}

const STORAGE_KEY = 'mb_firestore_quota_tracker_v1';
const HISTORY_STORAGE_KEY = 'mb_firestore_quota_history_v1';
const MAX_HISTORY_DAYS = 7;

export function getPacificQuotaCycleKey(date: Date = new Date()): string {
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

export interface ResetCountdownInfo {
  resetDate: Date;
  cycleKey: string;
  angolaFull: string;
  angolaDate: string;
  angolaTime: string;
  portugalTime: string;
  brazilTime: string;
  pacificTime: string;
  remainingMs: number;
  remainingFormatted: string;
}

export function getNextFirestoreResetInfo(now: Date = new Date()): ResetCountdownInfo {
  const cycleKey = getPacificQuotaCycleKey(now);
  const [yStr, mStr, dStr] = cycleKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  // Candidato inicial às 08:00 UTC do dia seguinte em Los Angeles (PST = UTC-8, PDT = UTC-7)
  let candidateUtcMs = Date.UTC(y, m - 1, d + 1, 8, 0, 0, 0);

  try {
    const laParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(candidateUtcMs));

    const hr = Number(laParts.find((p) => p.type === 'hour')?.value || '0') % 24;
    const min = Number(laParts.find((p) => p.type === 'minute')?.value || '0');
    const offsetMinutes = hr * 60 + min;
    if (offsetMinutes > 0 && offsetMinutes <= 180) {
      candidateUtcMs -= offsetMinutes * 60_000;
    } else if (offsetMinutes >= 1200) {
      candidateUtcMs += (1440 - offsetMinutes) * 60_000;
    }
  } catch {
    // Fallback para UTC-8 (PST)
  }

  const resetDate = new Date(candidateUtcMs);
  const remainingMs = Math.max(0, candidateUtcMs - now.getTime());

  const totalSec = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const remainingFormatted = `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;

  const fmtFull = (tz: string) =>
    new Intl.DateTimeFormat('pt-AO', {
      timeZone: tz,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(resetDate);

  const fmtDate = (tz: string) =>
    new Intl.DateTimeFormat('pt-AO', {
      timeZone: tz,
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(resetDate);

  const fmtTime = (tz: string) =>
    new Intl.DateTimeFormat('pt-AO', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    }).format(resetDate);

  return {
    resetDate,
    cycleKey,
    angolaFull: fmtFull('Africa/Luanda'),
    angolaDate: fmtDate('Africa/Luanda'),
    angolaTime: fmtTime('Africa/Luanda'),
    portugalTime: fmtTime('Europe/Lisbon'),
    brazilTime: fmtTime('America/Sao_Paulo'),
    pacificTime: fmtTime('America/Los_Angeles'),
    remainingMs,
    remainingFormatted,
  };
}

function createDefaultState(cycleKey: string, preservedControls?: Partial<FirestoreQuotaSnapshot>): FirestoreQuotaSnapshot {
  return {
    cycleKey,
    sessionReads: 0,
    sessionWrites: 0,
    savedReadsByCache: 0,
    consoleReadsOffset: null,
    consoleWritesOffset: null,
    quotaExhaustedDetected: false,
    lastExhaustedAtMs: null,
    lastProbeStatus: 'unknown',
    lastProbeMessage: null,
    lastProbeAtMs: null,
    economyMode: preservedControls?.economyMode || 'normal',
    pauseBackgroundSchedulers: preservedControls?.pauseBackgroundSchedulers ?? false,
    warningThresholdPct: preservedControls?.warningThresholdPct ?? 80,
  };
}

function loadStateFromStorage(): FirestoreQuotaSnapshot {
  const currentCycle = getPacificQuotaCycleKey();
  if (typeof localStorage === 'undefined') {
    return createDefaultState(currentCycle);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState(currentCycle);
    const parsed = JSON.parse(raw) as Partial<FirestoreQuotaSnapshot>;
    // Ao virar o dia no Pacífico, zera contadores diários mas mantém preferências de proteção
    if (parsed.cycleKey !== currentCycle) {
      const fresh = createDefaultState(currentCycle, {
        economyMode: parsed.economyMode,
        pauseBackgroundSchedulers: parsed.pauseBackgroundSchedulers,
        warningThresholdPct: parsed.warningThresholdPct,
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return {
      ...createDefaultState(currentCycle),
      ...parsed,
      cycleKey: currentCycle,
    };
  } catch {
    return createDefaultState(currentCycle);
  }
}

function formatCycleLabel(cycleKey: string): string {
  const parts = cycleKey.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return cycleKey;
}

function getEffectiveReadsFromState(state: FirestoreQuotaSnapshot): number {
  if (state.quotaExhaustedDetected && state.consoleReadsOffset === null) {
    return FIRESTORE_SPARK_LIMITS.readUnitsDaily;
  }
  if (state.consoleReadsOffset !== null) {
    return Math.min(
      FIRESTORE_SPARK_LIMITS.readUnitsDaily,
      Math.max(0, state.consoleReadsOffset)
    );
  }
  return Math.min(FIRESTORE_SPARK_LIMITS.readUnitsDaily, state.sessionReads);
}

function getEffectiveWritesFromState(state: FirestoreQuotaSnapshot): number {
  if (state.consoleWritesOffset !== null) {
    return Math.min(
      FIRESTORE_SPARK_LIMITS.writeUnitsDaily,
      Math.max(0, state.consoleWritesOffset)
    );
  }
  return Math.min(FIRESTORE_SPARK_LIMITS.writeUnitsDaily, state.sessionWrites);
}

function loadHistoryFromStorage(): DailyQuotaHistoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.cycleKey === 'string')
      .slice(-MAX_HISTORY_DAYS);
  } catch {
    return [];
  }
}

function syncHistoryWithState(state: FirestoreQuotaSnapshot): DailyQuotaHistoryEntry[] {
  const list = loadHistoryFromStorage();
  const entry: DailyQuotaHistoryEntry = {
    cycleKey: state.cycleKey,
    label: formatCycleLabel(state.cycleKey),
    reads: getEffectiveReadsFromState(state),
    writes: getEffectiveWritesFromState(state),
    savedByCache: Math.max(0, state.savedReadsByCache),
    exhausted: Boolean(state.quotaExhaustedDetected),
  };

  const idx = list.findIndex((item) => item.cycleKey === state.cycleKey);
  if (idx >= 0) {
    list[idx] = entry;
  } else {
    list.push(entry);
  }

  const sorted = list
    .sort((a, b) => a.cycleKey.localeCompare(b.cycleKey))
    .slice(-MAX_HISTORY_DAYS);

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(sorted));
    } catch {
      // ignore
    }
  }
  return sorted;
}

let inMemoryState: FirestoreQuotaSnapshot = loadStateFromStorage();
let inMemoryHistory: DailyQuotaHistoryEntry[] = syncHistoryWithState(inMemoryState);
const listeners = new Set<(state: FirestoreQuotaSnapshot) => void>();
const historyListeners = new Set<(history: DailyQuotaHistoryEntry[]) => void>();
let persistScheduled = false;

function notifySubscribers() {
  inMemoryHistory = syncHistoryWithState(inMemoryState);
  const snapshot = { ...inMemoryState };
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      // ignore
    }
  });
  const historyCopy = inMemoryHistory.map((item) => ({ ...item }));
  historyListeners.forEach((cb) => {
    try {
      cb(historyCopy);
    } catch {
      // ignore
    }
  });
}

function schedulePersist() {
  if (typeof localStorage === 'undefined') return;
  if (persistScheduled) return;
  persistScheduled = true;
  setTimeout(() => {
    persistScheduled = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryState));
      inMemoryHistory = syncHistoryWithState(inMemoryState);
    } catch {
      // ignore quota error
    }
  }, 300);
}

function ensureCycleFresh() {
  const currentCycle = getPacificQuotaCycleKey();
  if (inMemoryState.cycleKey !== currentCycle) {
    inMemoryHistory = syncHistoryWithState(inMemoryState);
    inMemoryState = createDefaultState(currentCycle, {
      economyMode: inMemoryState.economyMode,
      pauseBackgroundSchedulers: inMemoryState.pauseBackgroundSchedulers,
      warningThresholdPct: inMemoryState.warningThresholdPct,
    });
    inMemoryHistory = syncHistoryWithState(inMemoryState);
    schedulePersist();
  }
}

export function getQuotaState(): FirestoreQuotaSnapshot {
  ensureCycleFresh();
  return { ...inMemoryState };
}

export function subscribeQuotaState(cb: (state: FirestoreQuotaSnapshot) => void): () => void {
  listeners.add(cb);
  cb(getQuotaState());
  return () => {
    listeners.delete(cb);
  };
}

export function getQuotaDailyHistory(): DailyQuotaHistoryEntry[] {
  ensureCycleFresh();
  return inMemoryHistory.map((item) => ({ ...item }));
}

export function subscribeQuotaHistory(cb: (history: DailyQuotaHistoryEntry[]) => void): () => void {
  historyListeners.add(cb);
  cb(getQuotaDailyHistory());
  return () => {
    historyListeners.delete(cb);
  };
}

export function recordMeteredFirestoreReads(count: number = 1) {
  if (!count || count <= 0) return;
  ensureCycleFresh();
  inMemoryState = {
    ...inMemoryState,
    sessionReads: inMemoryState.sessionReads + count,
  };
  schedulePersist();
  notifySubscribers();
}

export function recordMeteredFirestoreWrites(count: number = 1) {
  if (!count || count <= 0) return;
  ensureCycleFresh();
  inMemoryState = {
    ...inMemoryState,
    sessionWrites: inMemoryState.sessionWrites + count,
  };
  schedulePersist();
  notifySubscribers();
}

export function recordSavedCacheReads(count: number = 1) {
  if (!count || count <= 0) return;
  ensureCycleFresh();
  inMemoryState = {
    ...inMemoryState,
    savedReadsByCache: inMemoryState.savedReadsByCache + count,
  };
  schedulePersist();
  notifySubscribers();
}

export function isQuotaExhaustedError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  const code = String((err as any)?.code || '').toLowerCase();
  return (
    code.includes('resource-exhausted') ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota exceeded')
  );
}

export function markFirestoreQuotaExhausted(message?: string) {
  ensureCycleFresh();
  inMemoryState = {
    ...inMemoryState,
    quotaExhaustedDetected: true,
    lastExhaustedAtMs: Date.now(),
    lastProbeStatus: 'exhausted',
    lastProbeMessage: message || 'Limite diário de leituras gratuitas (50.000 unidades) atingido.',
    lastProbeAtMs: Date.now(),
  };
  schedulePersist();
  notifySubscribers();
}

export function updateQuotaControls(
  patch: Partial<
    Pick<
      FirestoreQuotaSnapshot,
      | 'economyMode'
      | 'pauseBackgroundSchedulers'
      | 'warningThresholdPct'
      | 'consoleReadsOffset'
      | 'consoleWritesOffset'
      | 'quotaExhaustedDetected'
    >
  >
) {
  ensureCycleFresh();
  inMemoryState = {
    ...inMemoryState,
    ...patch,
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryState));
    } catch {
      // ignore
    }
  }
  notifySubscribers();
}

export function resetLocalCycleCounters() {
  const currentCycle = getPacificQuotaCycleKey();
  inMemoryState = createDefaultState(currentCycle, {
    economyMode: inMemoryState.economyMode,
    pauseBackgroundSchedulers: inMemoryState.pauseBackgroundSchedulers,
    warningThresholdPct: inMemoryState.warningThresholdPct,
  });
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryState));
    } catch {
      // ignore
    }
  }
  notifySubscribers();
}

export function getQuotaCacheMultiplier(): number {
  const state = getQuotaState();
  if (state.economyMode === 'emergency') return 3;
  if (state.economyMode === 'economic') return 2;
  return 1;
}

export async function probeFirestoreQuotaAvailability(): Promise<{
  status: 'ok' | 'exhausted' | 'error';
  message: string;
}> {
  ensureCycleFresh();
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    recordMeteredFirestoreReads(1);
    inMemoryState = {
      ...inMemoryState,
      quotaExhaustedDetected: false,
      lastProbeStatus: 'ok',
      lastProbeMessage: 'Conexão direta ao Firestore liberada e operacional.',
      lastProbeAtMs: Date.now(),
    };
    schedulePersist();
    notifySubscribers();
    return {
      status: 'ok',
      message: 'Conexão direta ao Firestore liberada e operacional.',
    };
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      const msg = 'Cota diária gratuita esgotada (429 RESOURCE_EXHAUSTED). Aguarde o reinício ou faça upgrade.';
      markFirestoreQuotaExhausted(msg);
      return { status: 'exhausted', message: msg };
    }
    const msg = String(err?.message || 'Não foi possível verificar o servidor no momento.');
    inMemoryState = {
      ...inMemoryState,
      lastProbeStatus: 'error',
      lastProbeMessage: msg,
      lastProbeAtMs: Date.now(),
    };
    schedulePersist();
    notifySubscribers();
    return { status: 'error', message: msg };
  }
}
