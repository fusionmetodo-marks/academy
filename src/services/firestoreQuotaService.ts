import { doc, getDoc, getDocFromServer, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { setDailyReadAccessDisabledSync } from './firestoreReadGuardState';

export const FIRESTORE_SPARK_LIMITS = {
  readUnitsDaily: 50_000,
  realtimeUpdateUnitsDaily: 50_000,
  writeUnitsDaily: 40_000,
  eventUnitsDaily: 10_000,
  storedDataGiB: 1,
  egressMonthlyGiB: 10,
} as const;

export const FIRESTORE_BLAZE_PRICING = {
  readUnitsPerMillionUsd: 0.05,
  writeUnitsPerMillionUsd: 0.26,
  realtimeUnitsPerMillionUsd: 0.30,
  storagePerGiBMonthUsd: 0.15,
  egressPerGiBUsd: 0.12,
} as const;

export const FIREBASE_CONSOLE_UPGRADE_URL =
  'https://console.firebase.google.com/project/gen-lang-client-0254007569/firestore/databases/ai-studio-marksomonstroaca-a9cb74d8-6417-439c-9170-934008f6df29/data?openUpgradeDialog=true';

export const FIREBASE_CONSOLE_USAGE_URL =
  'https://console.firebase.google.com/project/gen-lang-client-0254007569/firestore/databases/ai-studio-marksomonstroaca-a9cb74d8-6417-439c-9170-934008f6df29/usage';

export const FIREBASE_CONSOLE_BILLING_URL =
  'https://console.firebase.google.com/project/gen-lang-client-0254007569/usage/details';

export const FIRESTORE_PRICING_DOCS_URL =
  'https://firebase.google.com/pricing#cloud-firestore';

export type QuotaEconomyMode = 'normal' | 'economic' | 'emergency';
export type FirebasePlanTier = 'spark' | 'blaze';

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
  // Sincronização Spark <-> Blaze & Orçamento Mensal (compartilhado via settings/firebaseBilling)
  planTier: FirebasePlanTier;
  blazeUpgradedAtIso: string | null;
  planUpdatedByEmail: string | null;
  lastTeamSyncAtMs: number | null;
  monthlyBudgetUsd: number;
  budgetAlertThresholdPct: number;
  monthlyReadUnitsOffset: number | null;
  monthlyWriteUnitsOffset: number | null;
  monthlyEgressGiB: number;
  storedDataGiB: number;
  dailyReadAccessDisabled: boolean;
}

export interface DailyQuotaHistoryEntry {
  cycleKey: string;
  label: string;
  reads: number;
  writes: number;
  savedByCache: number;
  exhausted: boolean;
}

export interface MonthlyQuotaRollup {
  monthKey: string;
  monthLabel: string;
  daysInMonth: number;
  recordedDaysCount: number;
  totalReadsRecorded: number;
  totalWritesRecorded: number;
  totalSavedByCache: number;
  effectiveMonthlyReads: number;
  effectiveMonthlyWrites: number;
  freeMonthlyReadsAllowance: number;
  freeMonthlyWritesAllowance: number;
  freeMonthlyRealtimeAllowance: number;
  billableExtraReads: number;
  billableExtraWrites: number;
  billableExtraStorageGiB: number;
  billableExtraEgressGiB: number;
  estimatedMonthlyCostUsd: number;
  dailySeriesInMonth: DailyQuotaHistoryEntry[];
}

const STORAGE_KEY = 'mb_firestore_quota_tracker_v1';
const HISTORY_STORAGE_KEY = 'mb_firestore_quota_history_v1';
const MAX_HISTORY_DAYS = 35;

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
    planTier: preservedControls?.planTier || 'spark',
    blazeUpgradedAtIso: preservedControls?.blazeUpgradedAtIso ?? null,
    planUpdatedByEmail: preservedControls?.planUpdatedByEmail ?? null,
    lastTeamSyncAtMs: preservedControls?.lastTeamSyncAtMs ?? null,
    monthlyBudgetUsd: preservedControls?.monthlyBudgetUsd ?? 25,
    budgetAlertThresholdPct: preservedControls?.budgetAlertThresholdPct ?? 80,
    monthlyReadUnitsOffset: preservedControls?.monthlyReadUnitsOffset ?? null,
    monthlyWriteUnitsOffset: preservedControls?.monthlyWriteUnitsOffset ?? null,
    monthlyEgressGiB: preservedControls?.monthlyEgressGiB ?? 0,
    storedDataGiB: preservedControls?.storedDataGiB ?? 0,
    dailyReadAccessDisabled: preservedControls?.dailyReadAccessDisabled ?? false,
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
    if (parsed.cycleKey !== currentCycle) {
      const fresh = createDefaultState(currentCycle, {
        economyMode: parsed.economyMode,
        pauseBackgroundSchedulers: parsed.pauseBackgroundSchedulers,
        warningThresholdPct: parsed.warningThresholdPct,
        planTier: parsed.planTier,
        blazeUpgradedAtIso: parsed.blazeUpgradedAtIso,
        planUpdatedByEmail: parsed.planUpdatedByEmail,
        lastTeamSyncAtMs: parsed.lastTeamSyncAtMs,
        monthlyBudgetUsd: parsed.monthlyBudgetUsd,
        budgetAlertThresholdPct: parsed.budgetAlertThresholdPct,
        monthlyReadUnitsOffset: parsed.monthlyReadUnitsOffset,
        monthlyWriteUnitsOffset: parsed.monthlyWriteUnitsOffset,
        monthlyEgressGiB: parsed.monthlyEgressGiB,
        storedDataGiB: parsed.storedDataGiB,
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      setDailyReadAccessDisabledSync(false);
      return fresh;
    }
    const merged = {
      ...createDefaultState(currentCycle),
      ...parsed,
      cycleKey: currentCycle,
      dailyReadAccessDisabled: Boolean(parsed.dailyReadAccessDisabled),
    };
    setDailyReadAccessDisabledSync(merged.dailyReadAccessDisabled);
    return merged;
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
  if (state.planTier === 'spark' && state.quotaExhaustedDetected && state.consoleReadsOffset === null) {
    return FIRESTORE_SPARK_LIMITS.readUnitsDaily;
  }
  if (state.consoleReadsOffset !== null) {
    return Math.max(0, state.consoleReadsOffset);
  }
  return Math.max(0, state.sessionReads);
}

function getEffectiveWritesFromState(state: FirestoreQuotaSnapshot): number {
  if (state.consoleWritesOffset !== null) {
    return Math.max(0, state.consoleWritesOffset);
  }
  return Math.max(0, state.sessionWrites);
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
    exhausted: state.planTier === 'spark' && Boolean(state.quotaExhaustedDetected),
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

function saveImmediateToStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryState));
    inMemoryHistory = syncHistoryWithState(inMemoryState);
  } catch {
    // ignore
  }
}

function schedulePersist() {
  if (typeof localStorage === 'undefined') return;
  if (persistScheduled) return;
  persistScheduled = true;
  setTimeout(() => {
    persistScheduled = false;
    saveImmediateToStorage();
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
      planTier: inMemoryState.planTier,
      blazeUpgradedAtIso: inMemoryState.blazeUpgradedAtIso,
      planUpdatedByEmail: inMemoryState.planUpdatedByEmail,
      lastTeamSyncAtMs: inMemoryState.lastTeamSyncAtMs,
      monthlyBudgetUsd: inMemoryState.monthlyBudgetUsd,
      budgetAlertThresholdPct: inMemoryState.budgetAlertThresholdPct,
      monthlyReadUnitsOffset: inMemoryState.monthlyReadUnitsOffset,
      monthlyWriteUnitsOffset: inMemoryState.monthlyWriteUnitsOffset,
      monthlyEgressGiB: inMemoryState.monthlyEgressGiB,
      storedDataGiB: inMemoryState.storedDataGiB,
      dailyReadAccessDisabled: false,
    });
    setDailyReadAccessDisabledSync(false);
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

export function getQuotaDailyHistory(limitDays: number = 7): DailyQuotaHistoryEntry[] {
  ensureCycleFresh();
  return inMemoryHistory.slice(-limitDays).map((item) => ({ ...item }));
}

export function subscribeQuotaHistory(cb: (history: DailyQuotaHistoryEntry[]) => void): () => void {
  historyListeners.add(cb);
  cb(getQuotaDailyHistory(35));
  return () => {
    historyListeners.delete(cb);
  };
}

export function getMonthlyQuotaRollup(targetMonthKey?: string): MonthlyQuotaRollup {
  ensureCycleFresh();
  const state = getQuotaState();
  const monthKey = targetMonthKey || state.cycleKey.slice(0, 7);
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  let monthLabel = monthKey;
  try {
    const raw = new Intl.DateTimeFormat('pt-AO', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(Date.UTC(year, month - 1, 15)));
    monthLabel = raw.charAt(0).toUpperCase() + raw.slice(1);
  } catch {
    monthLabel = monthKey;
  }

  const dailySeriesInMonth = inMemoryHistory
    .filter((entry) => entry.cycleKey.startsWith(monthKey))
    .map((entry) => {
      if (entry.cycleKey === state.cycleKey) {
        return {
          ...entry,
          reads: getEffectiveReadsFromState(state),
          writes: getEffectiveWritesFromState(state),
          savedByCache: state.savedReadsByCache,
          exhausted: state.planTier === 'spark' && state.quotaExhaustedDetected,
        };
      }
      return { ...entry };
    })
    .sort((a, b) => a.cycleKey.localeCompare(b.cycleKey));

  const totalReadsRecorded = dailySeriesInMonth.reduce((acc, d) => acc + d.reads, 0);
  const totalWritesRecorded = dailySeriesInMonth.reduce((acc, d) => acc + d.writes, 0);
  const totalSavedByCache = dailySeriesInMonth.reduce((acc, d) => acc + d.savedByCache, 0);

  const effectiveMonthlyReads =
    state.monthlyReadUnitsOffset !== null
      ? Math.max(totalReadsRecorded, state.monthlyReadUnitsOffset)
      : totalReadsRecorded;
  const effectiveMonthlyWrites =
    state.monthlyWriteUnitsOffset !== null
      ? Math.max(totalWritesRecorded, state.monthlyWriteUnitsOffset)
      : totalWritesRecorded;

  const freeMonthlyReadsAllowance = FIRESTORE_SPARK_LIMITS.readUnitsDaily * daysInMonth;
  const freeMonthlyWritesAllowance = FIRESTORE_SPARK_LIMITS.writeUnitsDaily * daysInMonth;
  const freeMonthlyRealtimeAllowance = FIRESTORE_SPARK_LIMITS.realtimeUpdateUnitsDaily * daysInMonth;

  const billableExtraReads = Math.max(0, effectiveMonthlyReads - freeMonthlyReadsAllowance);
  const billableExtraWrites = Math.max(0, effectiveMonthlyWrites - freeMonthlyWritesAllowance);
  const billableExtraStorageGiB = Math.max(0, state.storedDataGiB - FIRESTORE_SPARK_LIMITS.storedDataGiB);
  const billableExtraEgressGiB = Math.max(0, state.monthlyEgressGiB - FIRESTORE_SPARK_LIMITS.egressMonthlyGiB);

  const estimatedMonthlyCostUsd =
    (billableExtraReads / 1_000_000) * FIRESTORE_BLAZE_PRICING.readUnitsPerMillionUsd +
    (billableExtraWrites / 1_000_000) * FIRESTORE_BLAZE_PRICING.writeUnitsPerMillionUsd +
    billableExtraStorageGiB * FIRESTORE_BLAZE_PRICING.storagePerGiBMonthUsd +
    billableExtraEgressGiB * FIRESTORE_BLAZE_PRICING.egressPerGiBUsd;

  return {
    monthKey,
    monthLabel,
    daysInMonth,
    recordedDaysCount: dailySeriesInMonth.length,
    totalReadsRecorded,
    totalWritesRecorded,
    totalSavedByCache,
    effectiveMonthlyReads,
    effectiveMonthlyWrites,
    freeMonthlyReadsAllowance,
    freeMonthlyWritesAllowance,
    freeMonthlyRealtimeAllowance,
    billableExtraReads,
    billableExtraWrites,
    billableExtraStorageGiB,
    billableExtraEgressGiB,
    estimatedMonthlyCostUsd,
    dailySeriesInMonth,
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
      | 'planTier'
      | 'blazeUpgradedAtIso'
      | 'planUpdatedByEmail'
      | 'monthlyBudgetUsd'
      | 'budgetAlertThresholdPct'
      | 'monthlyReadUnitsOffset'
      | 'monthlyWriteUnitsOffset'
      | 'monthlyEgressGiB'
      | 'storedDataGiB'
    >
  >
) {
  ensureCycleFresh();
  inMemoryState = {
    ...inMemoryState,
    ...patch,
  };
  saveImmediateToStorage();
  notifySubscribers();
}

export function setDailyReadAccessDisabled(disabled: boolean) {
  ensureCycleFresh();
  const nextDisabled = Boolean(disabled);
  const now = Date.now();
  inMemoryState = {
    ...inMemoryState,
    dailyReadAccessDisabled: nextDisabled,
    quotaExhaustedDetected: nextDisabled ? true : false,
    lastExhaustedAtMs: nextDisabled ? now : inMemoryState.lastExhaustedAtMs,
    lastProbeStatus: nextDisabled ? 'exhausted' : 'unknown',
    lastProbeMessage: nextDisabled
      ? 'Acesso de leitura diário desligado manualmente (simulação de cota diária atingida).'
      : 'Acesso de leitura diário religado. Leituras no Firestore restauradas.',
    lastProbeAtMs: now,
  };
  saveImmediateToStorage();
  setDailyReadAccessDisabledSync(nextDisabled);
  notifySubscribers();
}

export function resetLocalCycleCounters() {
  const currentCycle = getPacificQuotaCycleKey();
  inMemoryState = createDefaultState(currentCycle, {
    economyMode: inMemoryState.economyMode,
    pauseBackgroundSchedulers: inMemoryState.pauseBackgroundSchedulers,
    warningThresholdPct: inMemoryState.warningThresholdPct,
    planTier: inMemoryState.planTier,
    blazeUpgradedAtIso: inMemoryState.blazeUpgradedAtIso,
    planUpdatedByEmail: inMemoryState.planUpdatedByEmail,
    lastTeamSyncAtMs: inMemoryState.lastTeamSyncAtMs,
    monthlyBudgetUsd: inMemoryState.monthlyBudgetUsd,
    budgetAlertThresholdPct: inMemoryState.budgetAlertThresholdPct,
    monthlyReadUnitsOffset: inMemoryState.monthlyReadUnitsOffset,
    monthlyWriteUnitsOffset: inMemoryState.monthlyWriteUnitsOffset,
    monthlyEgressGiB: inMemoryState.monthlyEgressGiB,
    storedDataGiB: inMemoryState.storedDataGiB,
    dailyReadAccessDisabled: inMemoryState.dailyReadAccessDisabled,
    quotaExhaustedDetected: inMemoryState.dailyReadAccessDisabled ? true : false,
  });
  saveImmediateToStorage();
  notifySubscribers();
}

export function getQuotaCacheMultiplier(): number {
  const state = getQuotaState();
  if (state.economyMode === 'emergency') return 3;
  if (state.economyMode === 'economic') return 2;
  return 1;
}

function applyRemoteBillingDoc(data: Record<string, any> | null | undefined) {
  if (!data) return;
  ensureCycleFresh();
  const currentCycle = getPacificQuotaCycleKey();
  const nextPatch: Partial<FirestoreQuotaSnapshot> = {
    lastTeamSyncAtMs: Date.now(),
  };

  if (data.planTier === 'spark' || data.planTier === 'blaze') {
    nextPatch.planTier = data.planTier;
    if (data.planTier === 'blaze' && !inMemoryState.dailyReadAccessDisabled) {
      nextPatch.quotaExhaustedDetected = false;
    }
  }
  if (typeof data.blazeUpgradedAtIso === 'string' || data.blazeUpgradedAtIso === null) {
    nextPatch.blazeUpgradedAtIso = data.blazeUpgradedAtIso;
  }
  if (typeof data.planUpdatedByEmail === 'string' || data.planUpdatedByEmail === null) {
    nextPatch.planUpdatedByEmail = data.planUpdatedByEmail;
  }
  if (typeof data.monthlyBudgetUsd === 'number' && !Number.isNaN(data.monthlyBudgetUsd)) {
    nextPatch.monthlyBudgetUsd = Math.max(1, data.monthlyBudgetUsd);
  }
  if (typeof data.budgetAlertThresholdPct === 'number' && !Number.isNaN(data.budgetAlertThresholdPct)) {
    nextPatch.budgetAlertThresholdPct = Math.min(100, Math.max(10, data.budgetAlertThresholdPct));
  }
  if (typeof data.monthlyReadUnitsOffset === 'number' || data.monthlyReadUnitsOffset === null) {
    nextPatch.monthlyReadUnitsOffset = data.monthlyReadUnitsOffset;
  }
  if (typeof data.monthlyWriteUnitsOffset === 'number' || data.monthlyWriteUnitsOffset === null) {
    nextPatch.monthlyWriteUnitsOffset = data.monthlyWriteUnitsOffset;
  }
  if (typeof data.monthlyEgressGiB === 'number' && !Number.isNaN(data.monthlyEgressGiB)) {
    nextPatch.monthlyEgressGiB = Math.max(0, data.monthlyEgressGiB);
  }
  if (typeof data.storedDataGiB === 'number' && !Number.isNaN(data.storedDataGiB)) {
    nextPatch.storedDataGiB = Math.max(0, data.storedDataGiB);
  }
  if (data.dailyCycleKey === currentCycle) {
    if (typeof data.dailyConsoleReadsOffset === 'number' || data.dailyConsoleReadsOffset === null) {
      nextPatch.consoleReadsOffset = data.dailyConsoleReadsOffset;
    }
    if (typeof data.dailyConsoleWritesOffset === 'number' || data.dailyConsoleWritesOffset === null) {
      nextPatch.consoleWritesOffset = data.dailyConsoleWritesOffset;
    }
  }

  inMemoryState = {
    ...inMemoryState,
    ...nextPatch,
  };
  saveImmediateToStorage();
  notifySubscribers();
}

export async function syncTeamBillingFromFirestore(): Promise<boolean> {
  if (!auth.currentUser) return false;
  try {
    const snap = await getDoc(doc(db, 'settings', 'firebaseBilling'));
    recordMeteredFirestoreReads(1);
    if (snap.exists()) {
      applyRemoteBillingDoc(snap.data());
    }
    return true;
  } catch (err) {
    if (isQuotaExhaustedError(err)) {
      markFirestoreQuotaExhausted();
    }
    return false;
  }
}

export function subscribeTeamBillingSync(): () => void {
  if (!auth.currentUser) return () => {};
  let first = true;
  const unsub = onSnapshot(
    doc(db, 'settings', 'firebaseBilling'),
    (snap) => {
      if (first) {
        recordMeteredFirestoreReads(1);
        first = false;
      }
      if (snap.exists()) {
        applyRemoteBillingDoc(snap.data());
      }
    },
    (err) => {
      if (isQuotaExhaustedError(err)) {
        markFirestoreQuotaExhausted();
      }
    }
  );
  return unsub;
}

export async function saveTeamBillingConfigToFirestore(
  patch: Partial<
    Pick<
      FirestoreQuotaSnapshot,
      | 'planTier'
      | 'blazeUpgradedAtIso'
      | 'planUpdatedByEmail'
      | 'monthlyBudgetUsd'
      | 'budgetAlertThresholdPct'
      | 'monthlyReadUnitsOffset'
      | 'monthlyWriteUnitsOffset'
      | 'monthlyEgressGiB'
      | 'storedDataGiB'
      | 'consoleReadsOffset'
      | 'consoleWritesOffset'
      | 'quotaExhaustedDetected'
    >
  >
): Promise<{ syncedToCloud: boolean; error?: string }> {
  const actorEmail = auth.currentUser?.email || patch.planUpdatedByEmail || inMemoryState.planUpdatedByEmail || null;
  updateQuotaControls({
    ...patch,
    planUpdatedByEmail: actorEmail,
  });

  if (!auth.currentUser) {
    return { syncedToCloud: false, error: 'Sessão não autenticada no servidor.' };
  }

  try {
    const current = getQuotaState();
    const payload = {
      planTier: current.planTier,
      blazeUpgradedAtIso: current.blazeUpgradedAtIso,
      planUpdatedByEmail: current.planUpdatedByEmail,
      monthlyBudgetUsd: current.monthlyBudgetUsd,
      budgetAlertThresholdPct: current.budgetAlertThresholdPct,
      monthlyReadUnitsOffset: current.monthlyReadUnitsOffset,
      monthlyWriteUnitsOffset: current.monthlyWriteUnitsOffset,
      monthlyEgressGiB: current.monthlyEgressGiB,
      storedDataGiB: current.storedDataGiB,
      dailyCycleKey: current.cycleKey,
      dailyConsoleReadsOffset: current.consoleReadsOffset,
      dailyConsoleWritesOffset: current.consoleWritesOffset,
      updatedAtIso: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'settings', 'firebaseBilling'), payload, { merge: true });
    recordMeteredFirestoreWrites(1);
    inMemoryState = {
      ...inMemoryState,
      lastTeamSyncAtMs: Date.now(),
    };
    saveImmediateToStorage();
    notifySubscribers();
    return { syncedToCloud: true };
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      markFirestoreQuotaExhausted();
      return {
        syncedToCloud: false,
        error: 'Salvo localmente neste navegador (servidor ainda bloqueado por 429).',
      };
    }
    return {
      syncedToCloud: false,
      error: String(err?.message || 'Erro ao sincronizar no Firestore.'),
    };
  }
}

export async function switchPlanTierAndSync(
  nextTier: FirebasePlanTier
): Promise<{ syncedToCloud: boolean; probeStatus: 'ok' | 'exhausted' | 'error'; message: string }> {
  const nowIso = new Date().toISOString();
  const saveRes = await saveTeamBillingConfigToFirestore({
    planTier: nextTier,
    blazeUpgradedAtIso: nextTier === 'blaze' ? nowIso : null,
    quotaExhaustedDetected: nextTier === 'blaze' ? false : inMemoryState.quotaExhaustedDetected,
  });

  const probeRes = await probeFirestoreQuotaAvailability();

  if (nextTier === 'blaze') {
    if (probeRes.status === 'ok') {
      return {
        syncedToCloud: saveRes.syncedToCloud,
        probeStatus: 'ok',
        message: saveRes.syncedToCloud
          ? 'Plano Blaze sincronizado para toda a equipe e servidor confirmado online!'
          : 'Plano Blaze ativado localmente e servidor confirmado online!',
      };
    }
    return {
      syncedToCloud: saveRes.syncedToCloud,
      probeStatus: probeRes.status,
      message:
        'Plano Blaze marcado no painel. Se acabou de concluir o upgrade no Firebase Console, aguarde alguns segundos e clique em Testar Disponibilidade.',
    };
  }

  return {
    syncedToCloud: saveRes.syncedToCloud,
    probeStatus: probeRes.status,
    message: saveRes.syncedToCloud
      ? 'Modo de controle alternado para Plano Gratuito Spark e sincronizado para a equipe.'
      : 'Modo de controle alternado para Plano Gratuito Spark localmente.',
  };
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
      lastProbeMessage:
        inMemoryState.planTier === 'blaze'
          ? 'Conexão direta ao Firestore operacional em modo Plano Pago Blaze.'
          : 'Conexão direta ao Firestore liberada e operacional dentro da cota gratuita.',
      lastProbeAtMs: Date.now(),
    };
    schedulePersist();
    notifySubscribers();
    return {
      status: 'ok',
      message: inMemoryState.lastProbeMessage || 'Conexão direta ao Firestore liberada e operacional.',
    };
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      const msg =
        'Cota diária gratuita esgotada (429 RESOURCE_EXHAUSTED). Aguarde o reinício em Angola ou faça upgrade para o plano Blaze.';
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
