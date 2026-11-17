import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Gauge,
  PieChart as PieChartIcon,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
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
  FIREBASE_CONSOLE_UPGRADE_URL,
  FIREBASE_CONSOLE_USAGE_URL,
  FIRESTORE_PRICING_DOCS_URL,
  FIRESTORE_SPARK_LIMITS,
  FirestoreQuotaSnapshot,
  QuotaEconomyMode,
  getNextFirestoreResetInfo,
  getQuotaDailyHistory,
  getQuotaState,
  probeFirestoreQuotaAvailability,
  resetLocalCycleCounters,
  subscribeQuotaHistory,
  subscribeQuotaState,
  updateQuotaControls,
} from '../services/firestoreQuotaService';

interface FirestoreQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const FirestoreQuotaModal: React.FC<FirestoreQuotaModalProps> = ({
  isOpen,
  onClose,
  onNotify,
}) => {
  const [quotaState, setQuotaState] = useState<FirestoreQuotaSnapshot>(() => getQuotaState());
  const [dailyHistory, setDailyHistory] = useState<DailyQuotaHistoryEntry[]>(() => getQuotaDailyHistory());
  const [resetInfo, setResetInfo] = useState(() => getNextFirestoreResetInfo());
  const [isProbing, setIsProbing] = useState(false);

  const [readsInput, setReadsInput] = useState<string>(
    quotaState.consoleReadsOffset !== null ? String(quotaState.consoleReadsOffset) : ''
  );
  const [writesInput, setWritesInput] = useState<string>(
    quotaState.consoleWritesOffset !== null ? String(quotaState.consoleWritesOffset) : ''
  );

  useEffect(() => {
    const unsub = subscribeQuotaState((next) => {
      setQuotaState(next);
    });
    const unsubHistory = subscribeQuotaHistory((hist) => {
      setDailyHistory(hist);
    });
    return () => {
      unsub();
      unsubHistory();
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
  }, [quotaState.consoleReadsOffset, quotaState.consoleWritesOffset]);

  const effectiveReadsUsed = useMemo(() => {
    if (quotaState.quotaExhaustedDetected && quotaState.consoleReadsOffset === null) {
      return FIRESTORE_SPARK_LIMITS.readUnitsDaily;
    }
    if (quotaState.consoleReadsOffset !== null) {
      return Math.min(
        FIRESTORE_SPARK_LIMITS.readUnitsDaily,
        Math.max(0, quotaState.consoleReadsOffset)
      );
    }
    return Math.min(FIRESTORE_SPARK_LIMITS.readUnitsDaily, quotaState.sessionReads);
  }, [quotaState]);

  const readsRemaining = Math.max(0, FIRESTORE_SPARK_LIMITS.readUnitsDaily - effectiveReadsUsed);
  const readsPct = Math.min(
    100,
    Math.round((effectiveReadsUsed / FIRESTORE_SPARK_LIMITS.readUnitsDaily) * 1000) / 10
  );

  const effectiveWritesUsed = useMemo(() => {
    if (quotaState.consoleWritesOffset !== null) {
      return Math.min(
        FIRESTORE_SPARK_LIMITS.writeUnitsDaily,
        Math.max(0, quotaState.consoleWritesOffset)
      );
    }
    return Math.min(FIRESTORE_SPARK_LIMITS.writeUnitsDaily, quotaState.sessionWrites);
  }, [quotaState]);

  const writesRemaining = Math.max(0, FIRESTORE_SPARK_LIMITS.writeUnitsDaily - effectiveWritesUsed);
  const writesPct = Math.min(
    100,
    Math.round((effectiveWritesUsed / FIRESTORE_SPARK_LIMITS.writeUnitsDaily) * 1000) / 10
  );

  const isWarningOrHigh =
    quotaState.quotaExhaustedDetected || readsPct >= quotaState.warningThresholdPct;

  const donutData = useMemo(() => {
    const items = [
      {
        name: quotaState.consoleReadsOffset !== null ? 'Leituras Usadas (Calibrado)' : 'Leituras Consumidas',
        value: effectiveReadsUsed,
        color: quotaState.quotaExhaustedDetected
          ? '#ef4444'
          : readsPct >= quotaState.warningThresholdPct
          ? '#f59e0b'
          : '#e9c349',
      },
      {
        name: 'Cota Disponível Hoje',
        value: readsRemaining,
        color: '#10b981',
      },
    ];
    if (effectiveReadsUsed === 0 && readsRemaining === 0) {
      return [{ name: 'Cota Disponível Hoje', value: FIRESTORE_SPARK_LIMITS.readUnitsDaily, color: '#10b981' }];
    }
    return items.filter((d) => d.value > 0);
  }, [effectiveReadsUsed, readsRemaining, quotaState.consoleReadsOffset, quotaState.quotaExhaustedDetected, readsPct, quotaState.warningThresholdPct]);

  const barChartData = useMemo(() => {
    return dailyHistory.map((item) => {
      const isCurrent = item.cycleKey === resetInfo.cycleKey;
      const resolvedReads = isCurrent ? effectiveReadsUsed : item.reads;
      return {
        label: isCurrent ? `${item.label} (Hoje)` : item.label,
        leituras: resolvedReads,
        poupadas: item.savedByCache,
        exhausted: isCurrent ? quotaState.quotaExhaustedDetected : item.exhausted,
      };
    });
  }, [dailyHistory, resetInfo.cycleKey, effectiveReadsUsed, quotaState.quotaExhaustedDetected]);

  const maxBarReads = useMemo(
    () => Math.max(0, ...barChartData.map((d) => d.leituras)),
    [barChartData]
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

  const handleApplyCalibration = (e: React.FormEvent) => {
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

    updateQuotaControls({
      consoleReadsOffset: parsedReads,
      consoleWritesOffset: parsedWrites,
      quotaExhaustedDetected:
        parsedReads !== null && parsedReads >= FIRESTORE_SPARK_LIMITS.readUnitsDaily
          ? true
          : parsedReads !== null && parsedReads < FIRESTORE_SPARK_LIMITS.readUnitsDaily
          ? false
          : quotaState.quotaExhaustedDetected,
    });
    onNotify?.('Contagem de cotas sincronizada neste painel.', 'success');
  };

  const handleModeChange = (mode: QuotaEconomyMode) => {
    updateQuotaControls({
      economyMode: mode,
      pauseBackgroundSchedulers: mode === 'emergency' ? true : quotaState.pauseBackgroundSchedulers,
    });
    const labels: Record<QuotaEconomyMode, string> = {
      normal: 'Modo Padrão (Tempo Real Otimizado) ativado.',
      economic: 'Modo Econômico ativado: cache em memória ampliado em 2x.',
      emergency: 'Modo Emergência ativado: cache 3x e agendadores em segundo plano pausados.',
    };
    onNotify?.(labels[mode], 'info');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[#181818] border border-outline-variant/20 rounded-2xl max-w-4xl w-full p-5 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 my-auto max-h-[92vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 pb-5 mb-6 border-b border-outline-variant/10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/15 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/30 shrink-0">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#e9c349] block">
                Plano Gratuito Spark • Firestore Enterprise
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white font-headline">
                Controle de Cotas Gratuitas
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">
                Acompanhe limites diários, consumo, economia de cache e horário exato de reinício em Angola.
              </p>
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

        {/* Banner de Estado + Contagem Regressiva de Angola */}
        <div
          className={`rounded-2xl p-5 mb-6 border ${
            quotaState.quotaExhaustedDetected
              ? 'bg-red-950/35 border-red-500/40'
              : isWarningOrHigh
              ? 'bg-amber-950/30 border-amber-500/40'
              : 'bg-emerald-950/25 border-emerald-500/30'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                {quotaState.quotaExhaustedDetected ? (
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                )}
                <span className="text-sm font-extrabold text-white">
                  {quotaState.quotaExhaustedDetected
                    ? 'Cota Diária de Leituras Esgotada (429 RESOURCE_EXHAUSTED)'
                    : quotaState.lastProbeStatus === 'ok'
                    ? 'Banco Operacional — Dentro da Cota Gratuita'
                    : 'Monitoramento Local de Cotas Ativo'}
                </span>
              </div>
              <p className="text-xs text-stone-300 leading-relaxed max-w-2xl">
                {quotaState.lastProbeMessage ||
                  'As cotas do plano Spark zeram automaticamente todos os dias à meia-noite do servidor do Firebase (Horário do Pacífico).'}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleProbe}
                  disabled={isProbing}
                  className="px-3.5 py-2 rounded-xl bg-black/50 hover:bg-black/80 border border-outline-variant/20 text-xs font-bold text-white flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#e9c349] ${isProbing ? 'animate-spin' : ''}`} />
                  {isProbing ? 'Verificando Servidor...' : 'Testar Disponibilidade Agora'}
                </button>
                <a
                  href={FIREBASE_CONSOLE_USAGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-black/50 hover:bg-black/80 border border-outline-variant/20 text-xs font-bold text-[#e9c349] flex items-center gap-1.5 transition-colors"
                >
                  <span>Ver Gráfico Oficial no Firebase</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Relógio de Reinício Angola */}
            <div className="bg-black/55 border border-[#e9c349]/25 rounded-2xl p-4 min-w-[260px] shrink-0">
              <div className="flex items-center gap-2 text-[#e9c349] text-[10px] uppercase tracking-widest font-bold mb-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Próximo Reinício (Angola • WAT)</span>
              </div>
              <div className="font-mono text-2xl sm:text-3xl font-black text-white tracking-tight">
                {resetInfo.remainingFormatted}
              </div>
              <p className="text-xs text-[#e9c349] font-bold mt-1">
                {resetInfo.angolaDate} às {resetInfo.angolaTime}
              </p>
              <div className="mt-2.5 pt-2 border-t border-white/10 grid grid-cols-3 gap-1.5 text-[10px] text-stone-400 font-mono">
                <div>
                  <span className="block text-stone-500">Lisboa</span>
                  <span className="text-stone-200 font-bold">{resetInfo.portugalTime}</span>
                </div>
                <div>
                  <span className="block text-stone-500">Brasília</span>
                  <span className="text-stone-200 font-bold">{resetInfo.brazilTime}</span>
                </div>
                <div>
                  <span className="block text-stone-500">Servidor PT</span>
                  <span className="text-stone-200 font-bold">{resetInfo.pacificTime}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Medidores Principais de Cota */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          {/* Leituras Diárias */}
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#e9c349]" />
                <h4 className="text-sm font-bold text-white">Leituras Diárias (Read Units)</h4>
              </div>
              <span className="font-mono text-xs font-extrabold text-[#e9c349]">
                {readsPct.toFixed(1)}%
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-black/70 overflow-hidden border border-white/5">
              <div
                className={`h-full transition-all duration-500 ${
                  readsPct >= 95
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
                <span className="text-[10px] text-stone-400 block">Limite Gratuito</span>
                <span className="font-mono font-bold text-white">
                  {FIRESTORE_SPARK_LIMITS.readUnitsDaily.toLocaleString('pt-AO')}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                <span className="text-[10px] text-stone-400 block">
                  {quotaState.consoleReadsOffset !== null ? 'Usado (Calibrado)' : 'Usado (Sessão)'}
                </span>
                <span className="font-mono font-bold text-amber-300">
                  {effectiveReadsUsed.toLocaleString('pt-AO')}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                <span className="text-[10px] text-stone-400 block">Falta Disponível</span>
                <span
                  className={`font-mono font-bold ${
                    readsRemaining === 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {readsRemaining.toLocaleString('pt-AO')}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-stone-400 pt-1">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Leituras poupadas hoje pelo cache compartilhado:
              </span>
              <span className="font-mono font-bold text-emerald-400">
                +{quotaState.savedReadsByCache.toLocaleString('pt-AO')}
              </span>
            </div>
          </div>

          {/* Gravações Diárias & Demais Limites */}
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h4 className="text-sm font-bold text-white">Gravações Diárias (Write Units)</h4>
              </div>
              <span className="font-mono text-xs font-extrabold text-cyan-400">
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
                <span className="text-[10px] text-stone-400 block">Limite Gratuito</span>
                <span className="font-mono font-bold text-white">
                  {FIRESTORE_SPARK_LIMITS.writeUnitsDaily.toLocaleString('pt-AO')}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                <span className="text-[10px] text-stone-400 block">
                  {quotaState.consoleWritesOffset !== null ? 'Usado (Calibrado)' : 'Usado (Sessão)'}
                </span>
                <span className="font-mono font-bold text-cyan-300">
                  {effectiveWritesUsed.toLocaleString('pt-AO')}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                <span className="text-[10px] text-stone-400 block">Falta Disponível</span>
                <span className="font-mono font-bold text-emerald-400">
                  {writesRemaining.toLocaleString('pt-AO')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/5 text-[10px] text-stone-400">
              <div>
                <span className="block text-stone-500">Tempo Real / dia</span>
                <span className="font-mono font-bold text-stone-200">
                  {FIRESTORE_SPARK_LIMITS.realtimeUpdateUnitsDaily.toLocaleString('pt-AO')} un.
                </span>
              </div>
              <div>
                <span className="block text-stone-500">Armazenamento</span>
                <span className="font-mono font-bold text-stone-200">
                  {FIRESTORE_SPARK_LIMITS.storedDataGiB} GiB grátis
                </span>
              </div>
              <div>
                <span className="block text-stone-500">Tráfego Saída/mês</span>
                <span className="font-mono font-bold text-stone-200">
                  {FIRESTORE_SPARK_LIMITS.egressMonthlyGiB} GiB grátis
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Visualização Gráfica Recharts: Rosca de Distribuição + Barras de Tendência Diária */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
          {/* Gráfico de Rosca: Distribuição da Cota de Leituras Hoje */}
          <div className="lg:col-span-5 p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-[#e9c349]" />
                <h4 className="text-sm font-bold text-white">Distribuição de Leituras Hoje</h4>
              </div>
              <span className="text-[10px] font-mono text-stone-400">
                50.000 un.
              </span>
            </div>

            <div className="relative h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={82}
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
                <span className="font-mono text-xl font-black text-white">
                  {readsPct.toFixed(1)}%
                </span>
                <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold">
                  consumido
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[11px]">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-sm shrink-0 ${
                    quotaState.quotaExhaustedDetected
                      ? 'bg-red-500'
                      : readsPct >= quotaState.warningThresholdPct
                      ? 'bg-amber-500'
                      : 'bg-[#e9c349]'
                  }`}
                />
                <div className="min-w-0">
                  <span className="block text-[10px] text-stone-400 truncate">Usado hoje</span>
                  <span className="font-mono font-bold text-white">
                    {effectiveReadsUsed.toLocaleString('pt-AO')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <span className="block text-[10px] text-stone-400 truncate">Falta disponível</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {readsRemaining.toLocaleString('pt-AO')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Gráfico de Barras: Tendência Diária de Consumo vs Economia de Cache */}
          <div className="lg:col-span-7 p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#e9c349]" />
                <h4 className="text-sm font-bold text-white">Tendência Diária de Leituras (Ciclos)</h4>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-stone-400">
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

            <div className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
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
                      v >= 1000 ? `${(Number(v) / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v)
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
                        value: 'Limite 50k',
                        position: 'insideTopRight',
                        fill: '#f87171',
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Bar dataKey="leituras" name="leituras" radius={[6, 6, 0, 0]} maxBarSize={42}>
                    {barChartData.map((entry, idx) => (
                      <Cell
                        key={`cell-bar-${idx}`}
                        fill={entry.exhausted ? '#ef4444' : '#e9c349'}
                      />
                    ))}
                  </Bar>
                  <Bar dataKey="poupadas" name="poupadas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="text-[10px] text-stone-500 pt-2 border-t border-white/5">
              Registo automático dos últimos {barChartData.length} {barChartData.length === 1 ? 'ciclo diário' : 'ciclos diários'} neste navegador (máx. 7 dias) comparado às leituras poupadas pelo cache. Limite diário gratuito: 50.000 unidades.
            </p>
          </div>
        </div>

        {/* Controles de Economia & Calibragem */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          {/* Modo de Economia Ativo */}
          <div className="p-5 rounded-2xl bg-black/40 border border-outline-variant/15 space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#e9c349]" />
              <h4 className="text-sm font-bold text-white">Controle de Consumo do Painel</h4>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed">
              Ajuste o nível de retenção de cache e tarefas automáticas para proteger a cota diária em horários de maior movimento.
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
          </div>

          {/* Calibragem Manual com Firebase Console */}
          <form
            onSubmit={handleApplyCalibration}
            className="p-5 rounded-2xl bg-black/40 border border-outline-variant/15 flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#e9c349]" />
                <h4 className="text-sm font-bold text-white">Sincronizar Consumo Total do Projeto</h4>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                O navegador mede automaticamente o consumo local desta sessão. Para acompanhar o total somado de todos os alunos (visto no Firebase Console), informe abaixo o valor atual de hoje:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                    Leituras vistas no Console (Hoje)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={FIRESTORE_SPARK_LIMITS.readUnitsDaily * 10}
                    value={readsInput}
                    onChange={(e) => setReadsInput(e.target.value)}
                    placeholder={`Ex: ${quotaState.sessionReads}`}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white font-mono text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">
                    Gravações vistas no Console (Hoje)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={FIRESTORE_SPARK_LIMITS.writeUnitsDaily * 10}
                    value={writesInput}
                    onChange={(e) => setWritesInput(e.target.value)}
                    placeholder={`Ex: ${quotaState.sessionWrites}`}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-[#e9c349] rounded-xl py-2.5 px-3 text-white font-mono text-xs outline-none"
                  />
                </div>
              </div>

              <p className="text-[10px] text-stone-500">
                Ciclo atual do Pacífico: <span className="font-mono text-stone-300">{resetInfo.cycleKey}</span> • Os contadores zeram automaticamente na virada para {resetInfo.angolaTime} WAT.
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
                Aplicar Calibragem
              </button>
            </div>
          </form>
        </div>

        {/* Rodapé de Ações Oficiais Firebase */}
        <div className="pt-4 border-t border-outline-variant/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <a
              href={FIRESTORE_PRICING_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-400 hover:text-[#e9c349] flex items-center gap-1.5 transition-colors"
            >
              <span>Limites Oficiais Spark (Enterprise)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={FIREBASE_CONSOLE_UPGRADE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#e9c349] hover:underline font-bold flex items-center gap-1.5"
            >
              <span>Fazer Upgrade do Plano (Blaze) no Console</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-surface-container-highest hover:bg-surface-bright text-white text-xs font-bold transition-colors cursor-pointer self-end sm:self-auto"
          >
            Fechar Painel
          </button>
        </div>
      </div>
    </div>
  );
};
