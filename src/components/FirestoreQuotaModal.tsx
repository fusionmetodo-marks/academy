import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  DollarSign,
  ExternalLink,
  Gauge,
  HardDrive,
  PieChart as PieChartIcon,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  DailyQuotaHistoryEntry,
  FIREBASE_CONSOLE_BILLING_URL,
  FIREBASE_CONSOLE_UPGRADE_URL,
  FIREBASE_CONSOLE_USAGE_URL,
  FIRESTORE_BLAZE_PRICING,
  FIRESTORE_PRICING_DOCS_URL,
  FIRESTORE_SPARK_LIMITS,
  FirebasePlanTier,
  FirestoreQuotaSnapshot,
  QuotaEconomyMode,
  getMonthlyQuotaRollup,
  getNextFirestoreResetInfo,
  getQuotaDailyHistory,
  getQuotaState,
  probeFirestoreQuotaAvailability,
  resetLocalCycleCounters,
  saveTeamBillingConfigToFirestore,
  setDailyReadAccessDisabled,
  subscribeQuotaHistory,
  subscribeQuotaState,
  subscribeTeamBillingSync,
  switchPlanTierAndSync,
  updateQuotaControls,
} from '../services/firestoreQuotaService';

interface FirestoreQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (msg: string, type?: 'success' | 'info' | 'error') => void;
  mode?: 'page' | 'modal';
}

export const FirestoreQuotaModal: React.FC<FirestoreQuotaModalProps> = ({
  isOpen,
  onClose,
  onNotify,
  mode = 'modal',
}) => {
  const [quotaState, setQuotaState] = useState<FirestoreQuotaSnapshot>(() => getQuotaState());
  const [dailyHistory, setDailyHistory] = useState<DailyQuotaHistoryEntry[]>(() =>
    getQuotaDailyHistory(35)
  );
  const [resetInfo, setResetInfo] = useState(() => getNextFirestoreResetInfo());
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');
  const [isProbing, setIsProbing] = useState(false);
  const [isSwitchingPlan, setIsSwitchingPlan] = useState(false);
  const [isSavingMonthly, setIsSavingMonthly] = useState(false);

  // Inputs de calibragem diária
  const [readsInput, setReadsInput] = useState<string>(
    quotaState.consoleReadsOffset !== null ? String(quotaState.consoleReadsOffset) : ''
  );
  const [writesInput, setWritesInput] = useState<string>(
    quotaState.consoleWritesOffset !== null ? String(quotaState.consoleWritesOffset) : ''
  );

  // Inputs mensais & orçamento Blaze
  const [budgetInput, setBudgetInput] = useState<string>(String(quotaState.monthlyBudgetUsd));
  const [alertPctInput, setAlertPctInput] = useState<string>(
    String(quotaState.budgetAlertThresholdPct)
  );
  const [monthlyReadsInput, setMonthlyReadsInput] = useState<string>(
    quotaState.monthlyReadUnitsOffset !== null ? String(quotaState.monthlyReadUnitsOffset) : ''
  );
  const [monthlyWritesInput, setMonthlyWritesInput] = useState<string>(
    quotaState.monthlyWriteUnitsOffset !== null ? String(quotaState.monthlyWriteUnitsOffset) : ''
  );
  const [egressInput, setEgressInput] = useState<string>(String(quotaState.monthlyEgressGiB || 0));
  const [storageInput, setStorageInput] = useState<string>(String(quotaState.storedDataGiB || 0));

  useEffect(() => {
    const unsub = subscribeQuotaState((next) => {
      setQuotaState(next);
    });
    const unsubHistory = subscribeQuotaHistory((hist) => {
      setDailyHistory(hist);
    });
    const unsubTeam = subscribeTeamBillingSync();
    return () => {
      unsub();
      unsubHistory();
      unsubTeam();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setResetInfo(getNextFirestoreResetInfo());
    const interval = setInterval(() => {
      setResetInfo(getNextFirestoreResetInfo());
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    setReadsInput(
      quotaState.consoleReadsOffset !== null ? String(quotaState.consoleReadsOffset) : ''
    );
    setWritesInput(
      quotaState.consoleWritesOffset !== null ? String(quotaState.consoleWritesOffset) : ''
    );
    setBudgetInput(String(quotaState.monthlyBudgetUsd ?? 25));
    setAlertPctInput(String(quotaState.budgetAlertThresholdPct ?? 80));
    setMonthlyReadsInput(
      quotaState.monthlyReadUnitsOffset !== null ? String(quotaState.monthlyReadUnitsOffset) : ''
    );
    setMonthlyWritesInput(
      quotaState.monthlyWriteUnitsOffset !== null ? String(quotaState.monthlyWriteUnitsOffset) : ''
    );
    setEgressInput(String(quotaState.monthlyEgressGiB ?? 0));
    setStorageInput(String(quotaState.storedDataGiB ?? 0));
  }, [
    quotaState.consoleReadsOffset,
    quotaState.consoleWritesOffset,
    quotaState.monthlyBudgetUsd,
    quotaState.budgetAlertThresholdPct,
    quotaState.monthlyReadUnitsOffset,
    quotaState.monthlyWriteUnitsOffset,
    quotaState.monthlyEgressGiB,
    quotaState.storedDataGiB,
  ]);

  const isBlaze = quotaState.planTier === 'blaze';

  const effectiveReadsUsed = useMemo(() => {
    if (!isBlaze && quotaState.quotaExhaustedDetected && quotaState.consoleReadsOffset === null) {
      return FIRESTORE_SPARK_LIMITS.readUnitsDaily;
    }
    if (quotaState.consoleReadsOffset !== null) {
      return Math.max(0, quotaState.consoleReadsOffset);
    }
    return Math.max(0, quotaState.sessionReads);
  }, [quotaState, isBlaze]);

  const readsRemaining = Math.max(0, FIRESTORE_SPARK_LIMITS.readUnitsDaily - effectiveReadsUsed);
  const readsPct = Math.min(
    100,
    Math.round((effectiveReadsUsed / FIRESTORE_SPARK_LIMITS.readUnitsDaily) * 1000) / 10
  );

  const effectiveWritesUsed = useMemo(() => {
    if (quotaState.consoleWritesOffset !== null) {
      return Math.max(0, quotaState.consoleWritesOffset);
    }
    return Math.max(0, quotaState.sessionWrites);
  }, [quotaState]);

  const writesRemaining = Math.max(0, FIRESTORE_SPARK_LIMITS.writeUnitsDaily - effectiveWritesUsed);
  const writesPct = Math.min(
    100,
    Math.round((effectiveWritesUsed / FIRESTORE_SPARK_LIMITS.writeUnitsDaily) * 1000) / 10
  );

  const isWarningOrHigh =
    (!isBlaze && quotaState.quotaExhaustedDetected) ||
    (!isBlaze && readsPct >= quotaState.warningThresholdPct);

  const monthlyRollup = useMemo(
    () => getMonthlyQuotaRollup(resetInfo.cycleKey.slice(0, 7)),
    [dailyHistory, quotaState, resetInfo.cycleKey]
  );

  const budgetPct = useMemo(() => {
    const cap = Math.max(1, quotaState.monthlyBudgetUsd || 25);
    return Math.min(100, Math.round((monthlyRollup.estimatedMonthlyCostUsd / cap) * 1000) / 10);
  }, [monthlyRollup.estimatedMonthlyCostUsd, quotaState.monthlyBudgetUsd]);

  const isBudgetAlertTriggered =
    isBlaze && budgetPct >= (quotaState.budgetAlertThresholdPct || 80);

  const donutData = useMemo(() => {
    if (effectiveReadsUsed >= FIRESTORE_SPARK_LIMITS.readUnitsDaily) {
      if (isBlaze) {
        const extra = effectiveReadsUsed - FIRESTORE_SPARK_LIMITS.readUnitsDaily;
        return [
          {
            name: 'Franquia Gratuita Diária (50k)',
            value: FIRESTORE_SPARK_LIMITS.readUnitsDaily,
            color: '#10b981',
          },
          {
            name: 'Excedente Blaze (Pago/uso)',
            value: Math.max(1, extra),
            color: '#38bdf8',
          },
        ];
      }
      return [
        {
          name: 'Cota Gratuita Consumida',
          value: FIRESTORE_SPARK_LIMITS.readUnitsDaily,
          color: '#ef4444',
        },
      ];
    }

    const items = [
      {
        name:
          quotaState.consoleReadsOffset !== null
            ? 'Leituras Usadas (Calibrado)'
            : 'Leituras Consumidas',
        value: effectiveReadsUsed,
        color:
          !isBlaze && quotaState.quotaExhaustedDetected
            ? '#ef4444'
            : !isBlaze && readsPct >= quotaState.warningThresholdPct
            ? '#f59e0b'
            : '#e9c349',
      },
      {
        name: 'Saldo Gratuito Hoje',
        value: readsRemaining,
        color: '#10b981',
      },
    ];
    return items.filter((d) => d.value > 0);
  }, [
    effectiveReadsUsed,
    readsRemaining,
    quotaState.consoleReadsOffset,
    quotaState.quotaExhaustedDetected,
    readsPct,
    quotaState.warningThresholdPct,
    isBlaze,
  ]);

  const barChartData7Days = useMemo(() => {
    return dailyHistory.slice(-7).map((item) => {
      const isCurrent = item.cycleKey === resetInfo.cycleKey;
      const resolvedReads = isCurrent ? effectiveReadsUsed : item.reads;
      return {
        label: isCurrent ? `${item.label} (Hoje)` : item.label,
        leituras: resolvedReads,
        poupadas: item.savedByCache,
        exhausted: isCurrent ? !isBlaze && quotaState.quotaExhaustedDetected : item.exhausted,
      };
    });
  }, [dailyHistory, resetInfo.cycleKey, effectiveReadsUsed, quotaState.quotaExhaustedDetected, isBlaze]);

  const monthlyBarChartData = useMemo(() => {
    return monthlyRollup.dailySeriesInMonth.map((item) => {
      const isCurrent = item.cycleKey === resetInfo.cycleKey;
      return {
        label: isCurrent ? `${item.label}*` : item.label,
        leituras: item.reads,
        gravações: item.writes,
        poupadas: item.savedByCache,
        exhausted: !isBlaze && item.exhausted,
      };
    });
  }, [monthlyRollup.dailySeriesInMonth, resetInfo.cycleKey, isBlaze]);

  const maxBarReads = useMemo(
    () => Math.max(0, ...barChartData7Days.map((d) => d.leituras)),
    [barChartData7Days]
  );

  if (!isOpen) return null;

  const handleProbe = async () => {
    if (isProbing) return;
    setIsProbing(true);
    try {
      const res = await probeFirestoreQuotaAvailability();
      onNotify?.(res.message, res.status === 'ok' ? 'success' : 'error');
    } finally {
      setIsProbing(false);
    }
  };

  const handlePlanTierSwitch = async (nextTier: FirebasePlanTier) => {
    if (isSwitchingPlan || nextTier === quotaState.planTier) return;
    setIsSwitchingPlan(true);
    try {
      const res = await switchPlanTierAndSync(nextTier);
      onNotify?.(res.message, res.probeStatus === 'exhausted' ? 'error' : 'success');
    } finally {
      setIsSwitchingPlan(false);
    }
  };

  const handleApplyDailyCalibration = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedReads = readsInput.trim() === '' ? null : Math.max(0, Number(readsInput));
    const parsedWrites = writesInput.trim() === '' ? null : Math.max(0, Number(writesInput));

    if (
      (parsedReads !== null && Number.isNaN(parsedReads)) ||
      (parsedWrites !== null && Number.isNaN(parsedWrites))
    ) {
      onNotify?.('Informe apenas números válidos para calibragem.', 'error');
      return;
    }

    const res = await saveTeamBillingConfigToFirestore({
      consoleReadsOffset: parsedReads,
      consoleWritesOffset: parsedWrites,
      quotaExhaustedDetected:
        !isBlaze && parsedReads !== null && parsedReads >= FIRESTORE_SPARK_LIMITS.readUnitsDaily
          ? true
          : parsedReads !== null && parsedReads < FIRESTORE_SPARK_LIMITS.readUnitsDaily
          ? false
          : quotaState.quotaExhaustedDetected,
    });

    onNotify?.(
      res.syncedToCloud
        ? 'Contagem diária calibrada e sincronizada para toda a equipe.'
        : 'Contagem diária atualizada neste dispositivo.',
      'success'
    );
  };

  const handleSaveMonthlyControls = async (e: React.FormEvent) => {
    e.preventDefault();
    const budget = Math.max(1, Number(budgetInput || 25));
    const alertPct = Math.min(100, Math.max(10, Number(alertPctInput || 80)));
    const mReads =
      monthlyReadsInput.trim() === '' ? null : Math.max(0, Number(monthlyReadsInput));
    const mWrites =
      monthlyWritesInput.trim() === '' ? null : Math.max(0, Number(monthlyWritesInput));
    const egress = Math.max(0, Number(egressInput || 0));
    const storage = Math.max(0, Number(storageInput || 0));

    if (
      Number.isNaN(budget) ||
      Number.isNaN(alertPct) ||
      (mReads !== null && Number.isNaN(mReads)) ||
      (mWrites !== null && Number.isNaN(mWrites)) ||
      Number.isNaN(egress) ||
      Number.isNaN(storage)
    ) {
      onNotify?.('Verifique os valores numéricos informados na aba mensal.', 'error');
      return;
    }

    setIsSavingMonthly(true);
    try {
      const res = await saveTeamBillingConfigToFirestore({
        monthlyBudgetUsd: budget,
        budgetAlertThresholdPct: alertPct,
        monthlyReadUnitsOffset: mReads,
        monthlyWriteUnitsOffset: mWrites,
        monthlyEgressGiB: egress,
        storedDataGiB: storage,
      });
      onNotify?.(
        res.syncedToCloud
          ? 'Teto Blaze, alerta e consumo mensal sincronizados para a equipe.'
          : res.error || 'Controles mensais salvos localmente.',
        res.syncedToCloud ? 'success' : 'info'
      );
    } finally {
      setIsSavingMonthly(false);
    }
  };

  const handleModeChange = (economyMode: QuotaEconomyMode) => {
    updateQuotaControls({
      economyMode,
      pauseBackgroundSchedulers:
        economyMode === 'emergency' ? true : quotaState.pauseBackgroundSchedulers,
    });
    const labels: Record<QuotaEconomyMode, string> = {
      normal: 'Modo Padrão (Tempo Real Otimizado) ativado.',
      economic: 'Modo Econômico ativado: cache em memória ampliado em 2x.',
      emergency: 'Modo Emergência ativado: cache 3x e agendadores em segundo plano pausados.',
    };
    onNotify?.(labels[economyMode], 'info');
  };

  const handleToggleDailyReadAccess = () => {
    const nextDisabled = !quotaState.dailyReadAccessDisabled;
    setDailyReadAccessDisabled(nextDisabled);
    if (nextDisabled) {
      onNotify?.(
        'Acesso de leitura diário desligado (simulação). Os dados não serão carregados até religar.',
        'info'
      );
    } else {
      onNotify?.(
        'Acesso de leitura diário religado. O carregamento de dados voltou ao normal.',
        'success'
      );
      probeFirestoreQuotaAvailability().catch(() => {});
    }
  };

  const monthlyReadsFreePct = Math.min(
    100,
    Math.round(
      (monthlyRollup.effectiveMonthlyReads / Math.max(1, monthlyRollup.freeMonthlyReadsAllowance)) *
        1000
    ) / 10
  );
  const monthlyWritesFreePct = Math.min(
    100,
    Math.round(
      (monthlyRollup.effectiveMonthlyWrites /
        Math.max(1, monthlyRollup.freeMonthlyWritesAllowance)) *
        1000
    ) / 10
  );
  const egressPct = Math.min(
    100,
    Math.round((quotaState.monthlyEgressGiB / FIRESTORE_SPARK_LIMITS.egressMonthlyGiB) * 1000) / 10
  );
  const storagePct = Math.min(
    100,
    Math.round((quotaState.storedDataGiB / FIRESTORE_SPARK_LIMITS.storedDataGiB) * 1000) / 10
  );

  const innerContent = (
    <div className="space-y-6">
      {/* Barra Superior de Navegação (Modo Página Full-Screen dentro da Área Principal) */}
      {mode === 'page' ? (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-outline-variant/10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              id="btn-back-from-quotas"
              onClick={onClose}
              className="px-3.5 py-2.5 rounded-xl bg-surface-container-highest hover:bg-[#e9c349] text-stone-200 hover:text-black text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar às Configurações</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-stone-400 truncate">
                <span>Configurações</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#e9c349] font-semibold">Cotas &amp; Plano Firestore</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white font-headline truncate">
                Monitoramento de Cotas e Plano Firebase
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleProbe}
              disabled={isProbing}
              className="px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/20 text-xs font-bold text-white flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#e9c349] ${isProbing ? 'animate-spin' : ''}`}
              />
              <span>{isProbing ? 'Verificando...' : 'Testar Servidor'}</span>
            </button>
            <a
              href={FIREBASE_CONSOLE_UPGRADE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black text-xs font-extrabold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <span>{isBlaze ? 'Faturamento no Console' : 'Fazer Upgrade (Blaze)'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-outline-variant/10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/15 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/30 shrink-0">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-[#e9c349] block">
                Plano {isBlaze ? 'Blaze (Pago conforme uso)' : 'Spark (Gratuito)'} · Firestore Enterprise
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white font-headline">
                Controle de Cotas e Plano Firebase
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar painel de cotas"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Faixa de Sintonização do Plano (Spark Gratuito <-> Blaze Pago) sincronizada para toda a equipe */}
      <section className="rounded-2xl p-5 sm:p-6 bg-surface-container-low border border-outline-variant/15">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2.5">
              {quotaState.dailyReadAccessDisabled ? (
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              ) : isBlaze ? (
                <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
              ) : quotaState.quotaExhaustedDetected ? (
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              )}
              <h3 className="text-base sm:text-lg font-extrabold text-white">
                {quotaState.dailyReadAccessDisabled
                  ? 'Leitura Diária Desligada (Simulação de Cota Esgotada)'
                  : isBlaze
                  ? 'Plano Pago Blaze Ativo — Sincronizado para toda a equipe'
                  : quotaState.quotaExhaustedDetected
                  ? 'Plano Spark Esgotado Hoje (429 RESOURCE_EXHAUSTED)'
                  : 'Plano Gratuito Spark Ativo — Monitoramento Operacional'}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
              <span>
                {isBlaze
                  ? 'Sem bloqueio de 50k/dia; mantém as mesmas franquias gratuitas antes de cobrar excedentes'
                  : 'Franquia fixa de 50.000 leituras/dia e 40.000 gravações/dia com reinício em Angola'}
              </span>
              {quotaState.planUpdatedByEmail && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-stone-300">
                    Sincronizado por {quotaState.planUpdatedByEmail}
                  </span>
                </>
              )}
            </div>

            {quotaState.lastProbeMessage && (
              <p className="text-xs text-stone-300 pt-0.5">{quotaState.lastProbeMessage}</p>
            )}
          </div>

          {/* Controles de Alternância Spark vs Blaze sincronizados no banco */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <div className="flex items-center p-1 rounded-xl bg-black/50 border border-white/10">
              <button
                type="button"
                disabled={isSwitchingPlan}
                onClick={() => handlePlanTierSwitch('spark')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  !isBlaze
                    ? 'bg-[#e9c349] text-black'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                Spark (Gratuito)
              </button>
              <button
                type="button"
                disabled={isSwitchingPlan}
                onClick={() => handlePlanTierSwitch('blaze')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  isBlaze
                    ? 'bg-sky-500 text-black'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                {isSwitchingPlan ? 'Sincronizando...' : 'Blaze (Pago / Mensal)'}
              </button>
            </div>

            <a
              href={FIREBASE_CONSOLE_USAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 rounded-xl bg-black/50 hover:bg-black/80 border border-outline-variant/20 text-xs font-bold text-[#e9c349] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <span>Uso no Console</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Abas Principais: Visão Diária vs Visão Mensal & Orçamento Blaze */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/10">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-container-lowest border border-outline-variant/15 w-fit">
          <button
            type="button"
            id="tab-quota-daily"
            onClick={() => setActiveTab('daily')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'daily'
                ? 'bg-[#e9c349] text-black'
                : 'text-stone-300 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Visão Diária &amp; Reinício Angola</span>
          </button>
          <button
            type="button"
            id="tab-quota-monthly"
            onClick={() => setActiveTab('monthly')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'monthly'
                ? 'bg-[#e9c349] text-black'
                : 'text-stone-300 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Visão Mensal &amp; Teto Blaze</span>
          </button>
        </div>

        <div className="text-xs text-stone-400 font-mono tabular-nums">
          Ciclo atual: {resetInfo.cycleKey} · Mês: {monthlyRollup.monthLabel}
        </div>
      </div>

      {/* ================================================================= */}
      {/* ABA 1: VISÃO DIÁRIA */}
      {/* ================================================================= */}
      {activeTab === 'daily' && (
        <div className="space-y-6">
          {/* Relógio de Reinício Angola + Medidores Diários */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Cartão Relógio Angola */}
            <div
              className={`xl:col-span-4 rounded-2xl p-5 border flex flex-col justify-between ${
                !isBlaze && quotaState.quotaExhaustedDetected
                  ? 'bg-red-950/30 border-red-500/40'
                  : isWarningOrHigh
                  ? 'bg-amber-950/25 border-amber-500/40'
                  : 'bg-surface-container-lowest border-outline-variant/15'
              }`}
            >
              <div>
                <div className="flex items-center gap-2 text-[#e9c349] text-xs font-bold mb-2">
                  <Clock className="w-4 h-4" />
                  <span>Próximo Reinício Diário (Angola · WAT)</span>
                </div>
                <div className="font-mono tabular-nums text-3xl font-black text-white tracking-tight">
                  {resetInfo.remainingFormatted}
                </div>
                <p className="text-xs text-[#e9c349] font-bold mt-1">
                  {resetInfo.angolaDate} às {resetInfo.angolaTime}
                </p>
                <p className="text-[11px] text-stone-400 mt-2 leading-relaxed">
                  {isBlaze
                    ? 'No plano Blaze não há paragem ao passar de 50k/dia, mas as franquias gratuitas diárias renovam neste horário.'
                    : 'As cotas gratuitas do plano Spark zeram automaticamente à meia-noite do Pacífico.'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-3 gap-2 text-[11px] text-stone-400 font-mono tabular-nums">
                <div>
                  <span className="block text-stone-500 text-[10px]">Lisboa</span>
                  <span className="text-stone-200 font-bold">{resetInfo.portugalTime}</span>
                </div>
                <div>
                  <span className="block text-stone-500 text-[10px]">Brasília</span>
                  <span className="text-stone-200 font-bold">{resetInfo.brazilTime}</span>
                </div>
                <div>
                  <span className="block text-stone-500 text-[10px]">Servidor PT</span>
                  <span className="text-stone-200 font-bold">{resetInfo.pacificTime}</span>
                </div>
              </div>
            </div>

            {/* Leituras Diárias */}
            <div className="xl:col-span-4 p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-[#e9c349]" />
                    <h4 className="text-sm font-bold text-white">Leituras Diárias</h4>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-extrabold text-[#e9c349]">
                    {readsPct.toFixed(1)}%
                  </span>
                </div>

                <div className="w-full h-3 rounded-full bg-black/70 overflow-hidden border border-white/5">
                  <div
                    className={`h-full transition-all duration-500 ${
                      isBlaze && effectiveReadsUsed > FIRESTORE_SPARK_LIMITS.readUnitsDaily
                        ? 'bg-sky-400'
                        : readsPct >= 95
                        ? 'bg-red-500'
                        : readsPct >= quotaState.warningThresholdPct
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.max(readsPct, effectiveReadsUsed > 0 ? 2 : 0)}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-stone-400 block">Franquia Dia</span>
                    <span className="font-mono tabular-nums font-bold text-white">
                      {FIRESTORE_SPARK_LIMITS.readUnitsDaily.toLocaleString('pt-AO')}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-stone-400 block">
                      {quotaState.consoleReadsOffset !== null ? 'Calibrado' : 'Sessão'}
                    </span>
                    <span className="font-mono tabular-nums font-bold text-amber-300">
                      {effectiveReadsUsed.toLocaleString('pt-AO')}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-stone-400 block">
                      {isBlaze && effectiveReadsUsed > FIRESTORE_SPARK_LIMITS.readUnitsDaily
                        ? 'Excedente'
                        : 'Falta Grátis'}
                    </span>
                    <span
                      className={`font-mono tabular-nums font-bold ${
                        isBlaze && effectiveReadsUsed > FIRESTORE_SPARK_LIMITS.readUnitsDaily
                          ? 'text-sky-400'
                          : readsRemaining === 0
                          ? 'text-red-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {isBlaze && effectiveReadsUsed > FIRESTORE_SPARK_LIMITS.readUnitsDaily
                        ? `+${(effectiveReadsUsed - FIRESTORE_SPARK_LIMITS.readUnitsDaily).toLocaleString('pt-AO')}`
                        : readsRemaining.toLocaleString('pt-AO')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-stone-400 pt-2 border-t border-white/5">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Poupadas pelo cache hoje
                </span>
                <span className="font-mono tabular-nums font-bold text-emerald-400">
                  +{quotaState.savedReadsByCache.toLocaleString('pt-AO')}
                </span>
              </div>
            </div>

            {/* Gravações Diárias & Demais Limites */}
            <div className="xl:col-span-4 p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-sm font-bold text-white">Gravações Diárias</h4>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-extrabold text-cyan-400">
                    {writesPct.toFixed(1)}%
                  </span>
                </div>

                <div className="w-full h-3 rounded-full bg-black/70 overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-cyan-400 transition-all duration-500"
                    style={{ width: `${Math.max(writesPct, effectiveWritesUsed > 0 ? 2 : 0)}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-stone-400 block">Franquia Dia</span>
                    <span className="font-mono tabular-nums font-bold text-white">
                      {FIRESTORE_SPARK_LIMITS.writeUnitsDaily.toLocaleString('pt-AO')}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-stone-400 block">
                      {quotaState.consoleWritesOffset !== null ? 'Calibrado' : 'Sessão'}
                    </span>
                    <span className="font-mono tabular-nums font-bold text-cyan-300">
                      {effectiveWritesUsed.toLocaleString('pt-AO')}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-stone-400 block">Falta Grátis</span>
                    <span className="font-mono tabular-nums font-bold text-emerald-400">
                      {writesRemaining.toLocaleString('pt-AO')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-[10px] text-stone-400">
                <div>
                  <span className="block text-stone-500">Tempo Real/dia</span>
                  <span className="font-mono tabular-nums font-bold text-stone-200">
                    {FIRESTORE_SPARK_LIMITS.realtimeUpdateUnitsDaily.toLocaleString('pt-AO')}
                  </span>
                </div>
                <div>
                  <span className="block text-stone-500">Eventos/dia</span>
                  <span className="font-mono tabular-nums font-bold text-stone-200">
                    {FIRESTORE_SPARK_LIMITS.eventUnitsDaily.toLocaleString('pt-AO')}
                  </span>
                </div>
                <div>
                  <span className="block text-stone-500">Saída Mês</span>
                  <span className="font-mono tabular-nums font-bold text-stone-200">
                    {FIRESTORE_SPARK_LIMITS.egressMonthlyGiB} GiB
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Gráficos Recharts: Rosca Diária + Barras 7 Ciclos */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-[#e9c349]" />
                  <h4 className="text-sm font-bold text-white">Distribuição de Leituras Hoje</h4>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-stone-400">
                  Franquia 50.000
                </span>
              </div>

              <div className="relative h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={donutData.length > 1 ? 3 : 0}
                      stroke="none"
                    >
                      {donutData.map((entry, idx) => (
                        <Cell key={`cell-donut-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: any) => [
                        `${Number(value || 0).toLocaleString('pt-AO')} leituras`,
                        '',
                      ]}
                      contentStyle={{
                        backgroundColor: '#121212',
                        border: '1px solid rgba(233,195,73,0.35)',
                        borderRadius: '10px',
                        fontSize: '12px',
                        color: '#fff',
                      }}
                      itemStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-mono tabular-nums text-xl font-black text-white">
                    {readsPct.toFixed(1)}%
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold">
                    da franquia
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-sm shrink-0 ${
                      !isBlaze && quotaState.quotaExhaustedDetected
                        ? 'bg-red-500'
                        : readsPct >= quotaState.warningThresholdPct
                        ? 'bg-amber-500'
                        : 'bg-[#e9c349]'
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="block text-[10px] text-stone-400 truncate">Usado hoje</span>
                    <span className="font-mono tabular-nums font-bold text-white">
                      {effectiveReadsUsed.toLocaleString('pt-AO')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-[10px] text-stone-400 truncate">Falta grátis</span>
                    <span className="font-mono tabular-nums font-bold text-emerald-400">
                      {readsRemaining.toLocaleString('pt-AO')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#e9c349]" />
                  <h4 className="text-sm font-bold text-white">
                    Tendência Diária de Leituras (Últimos 7 Ciclos)
                  </h4>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-stone-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#e9c349]" />
                    Leituras Reais
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                    Poupadas (Cache)
                  </span>
                </div>
              </div>

              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barChartData7Days}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.06)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#a8a29e', fontSize: 11 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#a8a29e', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        v >= 1000
                          ? `${(Number(v) / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`
                          : String(v)
                      }
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      formatter={(value: any, name: any) => [
                        `${Number(value || 0).toLocaleString('pt-AO')} un.`,
                        name === 'leituras' ? 'Leituras no Firestore' : 'Poupadas pelo Cache',
                      ]}
                      contentStyle={{
                        backgroundColor: '#121212',
                        border: '1px solid rgba(233,195,73,0.35)',
                        borderRadius: '10px',
                        fontSize: '12px',
                        color: '#fff',
                      }}
                    />
                    {maxBarReads >= 15_000 && (
                      <ReferenceLine
                        y={FIRESTORE_SPARK_LIMITS.readUnitsDaily}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{
                          value: 'Franquia 50k',
                          position: 'insideTopRight',
                          fill: '#f87171',
                          fontSize: 10,
                        }}
                      />
                    )}
                    <Bar dataKey="leituras" name="leituras" radius={[6, 6, 0, 0]} maxBarSize={42}>
                      {barChartData7Days.map((entry, idx) => (
                        <Cell
                          key={`cell-bar-${idx}`}
                          fill={entry.exhausted ? '#ef4444' : '#e9c349'}
                        />
                      ))}
                    </Bar>
                    <Bar
                      dataKey="poupadas"
                      name="poupadas"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={42}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <p className="text-[11px] text-stone-500 pt-2 border-t border-white/5">
                Histórico automático de {barChartData7Days.length}{' '}
                {barChartData7Days.length === 1 ? 'ciclo registrado' : 'ciclos registrados'} ·
                Franquia diária gratuita de 50.000 leituras.
              </p>
            </div>
          </div>

          {/* Controles de Economia & Calibragem Diária */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-5 rounded-2xl bg-black/40 border border-outline-variant/15 space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#e9c349]" />
                <h4 className="text-sm font-bold text-white">Controle de Consumo do Painel</h4>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                Ajuste a retenção de cache e tarefas em segundo plano para proteger a cota diária e manter os custos do Blaze sob controle.
              </p>

              <div className="space-y-2">
                {[
                  {
                    id: 'normal' as QuotaEconomyMode,
                    title: 'Padrão Otimizado (Cache 1x)',
                    desc: 'Cache compartilhado de 5 min entre abas e listeners multiplexados.',
                  },
                  {
                    id: 'economic' as QuotaEconomyMode,
                    title: 'Modo Econômico (Cache 2x)',
                    desc: 'Dobra a duração do cache local de documentos e configurações (até 30 min).',
                  },
                  {
                    id: 'emergency' as QuotaEconomyMode,
                    title: 'Modo Emergência (Cache 3x + Pausar Agendadores)',
                    desc: 'Reduz ao mínimo absoluto leituras automáticas e pausa lembretes em 2º plano.',
                  },
                ].map((opt) => {
                  const active = quotaState.economyMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleModeChange(opt.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        active
                          ? 'bg-[#e9c349]/15 border-[#e9c349] text-white'
                          : 'bg-surface-container-lowest border-outline-variant/15 text-stone-300 hover:border-outline-variant/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{opt.title}</span>
                        {active && (
                          <span className="text-[10px] font-extrabold uppercase text-[#e9c349]">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-400 mt-0.5">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>

              <label className="flex items-center justify-between gap-3 pt-2 border-t border-white/10 cursor-pointer">
                <span className="text-xs text-stone-300 font-semibold">
                  Pausar lembretes automáticos em segundo plano
                </span>
                <input
                  type="checkbox"
                  checked={quotaState.pauseBackgroundSchedulers}
                  onChange={(e) => {
                    updateQuotaControls({ pauseBackgroundSchedulers: e.target.checked });
                    onNotify?.(
                      e.target.checked
                        ? 'Agendadores automáticos pausados para economizar leituras.'
                        : 'Agendadores automáticos reativados.',
                      'info'
                    );
                  }}
                  className="w-4 h-4 accent-[#e9c349] cursor-pointer"
                />
              </label>

              <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/5">
                <div className="min-w-0">
                  <span className="block text-[11px] text-stone-400 font-medium">
                    Acesso de leitura diário (simulação)
                  </span>
                  <span className="block text-[10px] text-stone-500">
                    {quotaState.dailyReadAccessDisabled
                      ? 'Leituras bloqueadas · dados não carregam na plataforma'
                      : 'Desligue para simular o bloqueio de leitura por cota diária'}
                  </span>
                </div>
                <button
                  type="button"
                  id="btn-toggle-daily-read-access"
                  role="switch"
                  aria-checked={!quotaState.dailyReadAccessDisabled}
                  onClick={handleToggleDailyReadAccess}
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
                    quotaState.dailyReadAccessDisabled
                      ? 'bg-red-950/30 border-red-500/30 text-red-300 hover:bg-red-950/50'
                      : 'bg-surface-container-lowest border-outline-variant/20 text-stone-400 hover:text-stone-200 hover:border-outline-variant/40'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      quotaState.dailyReadAccessDisabled ? 'bg-red-400' : 'bg-emerald-400/80'
                    }`}
                  />
                  <span>{quotaState.dailyReadAccessDisabled ? 'Desligado' : 'Ligado'}</span>
                </button>
              </div>
            </div>

            <form
              onSubmit={handleApplyDailyCalibration}
              className="p-5 rounded-2xl bg-black/40 border border-outline-variant/15 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#e9c349]" />
                  <h4 className="text-sm font-bold text-white">
                    Calibrar Leituras Diárias com o Console
                  </h4>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">
                  O navegador mede as leituras desta sessão. Informe abaixo os números de hoje vistos no Firebase Console para sincronizar com toda a equipe administrativa.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                      Leituras Hoje (Console)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={FIRESTORE_SPARK_LIMITS.readUnitsDaily * 100}
                      value={readsInput}
                      onChange={(e) => setReadsInput(e.target.value)}
                      placeholder={`Sessão: ${quotaState.sessionReads}`}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white font-mono text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                      Gravações Hoje (Console)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={FIRESTORE_SPARK_LIMITS.writeUnitsDaily * 100}
                      value={writesInput}
                      onChange={(e) => setWritesInput(e.target.value)}
                      placeholder={`Sessão: ${quotaState.sessionWrites}`}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white font-mono text-xs outline-none"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-stone-500">
                  Ciclo atual: <span className="font-mono text-stone-300">{resetInfo.cycleKey}</span> · Reinício automático às {resetInfo.angolaTime} WAT.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    resetLocalCycleCounters();
                    setReadsInput('');
                    setWritesInput('');
                    onNotify?.('Contadores locais do ciclo atual zerados.', 'info');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-surface-container-highest hover:bg-surface-bright text-stone-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Zerar Medidor Local
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black text-xs font-extrabold transition-colors cursor-pointer"
                >
                  Salvar &amp; Sincronizar Hoje
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* ABA 2: VISÃO MENSAL, EGRESS, ARMAZENAMENTO & ORÇAMENTO BLAZE */}
      {/* ================================================================= */}
      {activeTab === 'monthly' && (
        <div className="space-y-6">
          {/* Alerta de Orçamento Mensal Blaze */}
          {isBudgetAlertTriggered && (
            <div className="rounded-2xl p-4 bg-amber-950/35 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Alerta de Orçamento Blaze Atingido ({budgetPct.toFixed(1)}% do teto)
                  </h4>
                  <p className="text-xs text-stone-300">
                    O gasto mensal estimado (${monthlyRollup.estimatedMonthlyCostUsd.toFixed(2)}) alcançou o limite de alerta configurado de {quotaState.budgetAlertThresholdPct}% sobre ${quotaState.monthlyBudgetUsd.toFixed(2)}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleModeChange('economic')}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-extrabold cursor-pointer whitespace-nowrap shrink-0"
              >
                Ativar Modo Econômico (2x)
              </button>
            </div>
          )}

          {/* 4 Cards de Cotas Mensais */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Leituras no Mês */}
            <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-[#e9c349]" />
                  Leituras ({monthlyRollup.monthLabel})
                </span>
                <span className="font-mono tabular-nums text-xs font-bold text-[#e9c349]">
                  {monthlyReadsFreePct.toFixed(1)}%
                </span>
              </div>
              <div className="font-mono tabular-nums text-2xl font-black text-white">
                {monthlyRollup.effectiveMonthlyReads.toLocaleString('pt-AO')}
              </div>
              <div className="w-full h-2.5 rounded-full bg-black/70 overflow-hidden">
                <div
                  className="h-full bg-[#e9c349] transition-all"
                  style={{
                    width: `${Math.max(
                      monthlyReadsFreePct,
                      monthlyRollup.effectiveMonthlyReads > 0 ? 3 : 0
                    )}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-stone-400 flex justify-between font-mono tabular-nums">
                <span>Franquia: {monthlyRollup.freeMonthlyReadsAllowance.toLocaleString('pt-AO')}</span>
                <span>{monthlyRollup.recordedDaysCount}d reg.</span>
              </div>
            </div>

            {/* Gravações no Mês */}
            <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Gravações no Mês
                </span>
                <span className="font-mono tabular-nums text-xs font-bold text-cyan-400">
                  {monthlyWritesFreePct.toFixed(1)}%
                </span>
              </div>
              <div className="font-mono tabular-nums text-2xl font-black text-white">
                {monthlyRollup.effectiveMonthlyWrites.toLocaleString('pt-AO')}
              </div>
              <div className="w-full h-2.5 rounded-full bg-black/70 overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all"
                  style={{
                    width: `${Math.max(
                      monthlyWritesFreePct,
                      monthlyRollup.effectiveMonthlyWrites > 0 ? 3 : 0
                    )}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-stone-400 flex justify-between font-mono tabular-nums">
                <span>Franquia: {monthlyRollup.freeMonthlyWritesAllowance.toLocaleString('pt-AO')}</span>
                <span>0,26 $/1M ext.</span>
              </div>
            </div>

            {/* Network Egress Mensal */}
            <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                  <Wifi className="w-4 h-4 text-emerald-400" />
                  Tráfego Saída (Egress)
                </span>
                <span className="font-mono tabular-nums text-xs font-bold text-emerald-400">
                  {egressPct.toFixed(1)}%
                </span>
              </div>
              <div className="font-mono tabular-nums text-2xl font-black text-white">
                {quotaState.monthlyEgressGiB.toFixed(2)} GiB
              </div>
              <div className="w-full h-2.5 rounded-full bg-black/70 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    egressPct >= 90 ? 'bg-red-500' : 'bg-emerald-400'
                  }`}
                  style={{
                    width: `${Math.max(egressPct, quotaState.monthlyEgressGiB > 0 ? 3 : 0)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-stone-400 flex justify-between font-mono tabular-nums">
                <span>Grátis: 10 GiB/mês</span>
                <span>0,12 $/GiB ext.</span>
              </div>
            </div>

            {/* Armazenamento */}
            <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-purple-400" />
                  Armazenamento Total
                </span>
                <span className="font-mono tabular-nums text-xs font-bold text-purple-400">
                  {storagePct.toFixed(1)}%
                </span>
              </div>
              <div className="font-mono tabular-nums text-2xl font-black text-white">
                {quotaState.storedDataGiB.toFixed(2)} GiB
              </div>
              <div className="w-full h-2.5 rounded-full bg-black/70 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    storagePct >= 90 ? 'bg-red-500' : 'bg-purple-400'
                  }`}
                  style={{
                    width: `${Math.max(storagePct, quotaState.storedDataGiB > 0 ? 3 : 0)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-stone-400 flex justify-between font-mono tabular-nums">
                <span>Grátis: 1,00 GiB</span>
                <span>0,15 $/GiB ext.</span>
              </div>
            </div>
          </div>

          {/* Gráfico Mensal Recharts + Simulador de Custo & Orçamento Blaze */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Gráfico de Barras Mensal */}
            <div className="lg:col-span-7 p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#e9c349]" />
                  <h4 className="text-sm font-bold text-white">
                    Consumo Acumulado no Mês ({monthlyRollup.monthLabel})
                  </h4>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-emerald-400 font-bold">
                  Cache poupou +{monthlyRollup.totalSavedByCache.toLocaleString('pt-AO')} no mês
                </span>
              </div>

              <div className="h-[240px] w-full">
                {monthlyBarChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-stone-400 text-center px-4">
                    Os ciclos diários deste mês aparecerão aqui automaticamente conforme o painel for utilizado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyBarChartData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.06)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#a8a29e', fontSize: 11 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#a8a29e', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) =>
                          v >= 1000
                            ? `${(Number(v) / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`
                            : String(v)
                        }
                      />
                      <RechartsTooltip
                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        formatter={(value: any, name: any) => [
                          `${Number(value || 0).toLocaleString('pt-AO')} un.`,
                          name === 'leituras'
                            ? 'Leituras Reais'
                            : name === 'gravações'
                            ? 'Gravações'
                            : 'Poupadas (Cache)',
                        ]}
                        contentStyle={{
                          backgroundColor: '#121212',
                          border: '1px solid rgba(233,195,73,0.35)',
                          borderRadius: '10px',
                          fontSize: '12px',
                          color: '#fff',
                        }}
                      />
                      <Bar dataKey="leituras" name="leituras" radius={[6, 6, 0, 0]} maxBarSize={36}>
                        {monthlyBarChartData.map((entry, idx) => (
                          <Cell
                            key={`cell-m-${idx}`}
                            fill={entry.exhausted ? '#ef4444' : '#e9c349'}
                          />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="poupadas"
                        name="poupadas"
                        fill="#10b981"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={36}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <p className="text-[11px] text-stone-500 pt-2 border-t border-white/5">
                Soma automática dos últimos {monthlyRollup.recordedDaysCount} dia(s) neste dispositivo. Use o formulário ao lado para alinhar o acumulado mensal exato com o Firebase Console.
              </p>
            </div>

            {/* Estimativa Blaze & Orçamento */}
            <div className="lg:col-span-5 p-5 rounded-2xl bg-black/40 border border-outline-variant/15 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-sky-400" />
                    <h4 className="text-sm font-bold text-white">Previsão Mensal Blaze (USD)</h4>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-extrabold text-sky-400">
                    ${monthlyRollup.estimatedMonthlyCostUsd.toFixed(2)} / ${quotaState.monthlyBudgetUsd.toFixed(2)}
                  </span>
                </div>

                <div className="w-full h-3 rounded-full bg-black/80 overflow-hidden border border-white/10">
                  <div
                    className={`h-full transition-all ${
                      budgetPct >= 100
                        ? 'bg-red-500'
                        : budgetPct >= quotaState.budgetAlertThresholdPct
                        ? 'bg-amber-400'
                        : 'bg-sky-400'
                    }`}
                    style={{
                      width: `${Math.max(
                        budgetPct,
                        monthlyRollup.estimatedMonthlyCostUsd > 0 ? 3 : 0
                      )}%`,
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs pt-1">
                  <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5">
                    <span className="text-[10px] text-stone-400 block">Gasto Estimado (Mês)</span>
                    <span className="font-mono tabular-nums font-black text-lg text-white">
                      ${monthlyRollup.estimatedMonthlyCostUsd.toFixed(2)}
                    </span>
                    <span className="block text-[10px] text-stone-500">
                      {monthlyRollup.estimatedMonthlyCostUsd === 0
                        ? '100% coberto na faixa grátis'
                        : 'Sobre excedentes Enterprise'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-container-lowest border border-white/5">
                    <span className="text-[10px] text-stone-400 block">Teto &amp; Alerta</span>
                    <span className="font-mono tabular-nums font-black text-lg text-[#e9c349]">
                      ${quotaState.monthlyBudgetUsd.toFixed(0)}
                    </span>
                    <span className="block text-[10px] text-stone-500">
                      Alerta aos {quotaState.budgetAlertThresholdPct}% de uso
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-stone-400 space-y-1 pt-1 border-t border-white/5">
                  <div className="flex justify-between font-mono tabular-nums">
                    <span>Leituras excedentes (~$0.05/1M):</span>
                    <span className="text-stone-200">
                      {monthlyRollup.billableExtraReads.toLocaleString('pt-AO')} un.
                    </span>
                  </div>
                  <div className="flex justify-between font-mono tabular-nums">
                    <span>Gravações excedentes (~$0.26/1M):</span>
                    <span className="text-stone-200">
                      {monthlyRollup.billableExtraWrites.toLocaleString('pt-AO')} un.
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                <a
                  href={FIREBASE_CONSOLE_BILLING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-sky-400 hover:underline flex items-center gap-1.5"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Gerir Faturamento &amp; Cartão no Console</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                {!isBlaze && (
                  <button
                    type="button"
                    disabled={isSwitchingPlan}
                    onClick={() => handlePlanTierSwitch('blaze')}
                    className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black text-xs font-extrabold cursor-pointer whitespace-nowrap"
                  >
                    Sincronizar Plano Blaze
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Formulário de Teto Blaze, Alerta & Calibragem Mensal Sincronizado */}
          <form
            onSubmit={handleSaveMonthlyControls}
            className="p-5 sm:p-6 rounded-2xl bg-black/40 border border-outline-variant/15 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#e9c349]" />
                  Configurar Teto Mensal, Alertas e Métricas Mensais do Console
                </h4>
                <p className="text-xs text-stone-400 mt-0.5">
                  Todos os valores salvos aqui ficam sincronizados no servidor para toda a equipe administrativa.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                  Teto Mensal (USD)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white font-mono text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                  Alerta (%)
                </label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={alertPctInput}
                  onChange={(e) => setAlertPctInput(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white font-mono text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                  Leituras Mês (Console)
                </label>
                <input
                  type="number"
                  min="0"
                  value={monthlyReadsInput}
                  onChange={(e) => setMonthlyReadsInput(e.target.value)}
                  placeholder={`${monthlyRollup.totalReadsRecorded}`}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white font-mono text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                  Gravações Mês (Console)
                </label>
                <input
                  type="number"
                  min="0"
                  value={monthlyWritesInput}
                  onChange={(e) => setMonthlyWritesInput(e.target.value)}
                  placeholder={`${monthlyRollup.totalWritesRecorded}`}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white font-mono text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                  Tráfego Saída (GiB)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={egressInput}
                  onChange={(e) => setEgressInput(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white font-mono text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                  Armazenamento (GiB)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={storageInput}
                  onChange={(e) => setStorageInput(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white font-mono text-xs outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-4 text-xs text-stone-400">
                <a
                  href={FIRESTORE_PRICING_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#e9c349] flex items-center gap-1.5 transition-colors"
                >
                  <span>Tabela Oficial Spark vs Blaze ({FIRESTORE_BLAZE_PRICING.readUnitsPerMillionUsd}$/1M leituras)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <button
                type="submit"
                disabled={isSavingMonthly}
                className="px-5 py-2.5 rounded-xl bg-[#e9c349] hover:bg-[#d4b03f] text-black text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                {isSavingMonthly ? 'Sincronizando...' : 'Salvar & Sincronizar Orçamento Mensal'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );

  if (mode === 'page') {
    return (
      <section className="w-full max-w-6xl mx-auto animate-in fade-in duration-200">
        {innerContent}
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[#181818] border border-outline-variant/20 rounded-2xl max-w-5xl w-full p-5 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 my-auto max-h-[92vh] overflow-y-auto">
        {innerContent}
      </div>
    </div>
  );
};
