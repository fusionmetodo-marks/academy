import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type ChristmasBonusStatus = 'draft' | 'scheduled' | 'live' | 'ended';
export type ChristmasBonusDayState = 'waiting' | 'live' | 'completed' | 'postponed';

export interface ChristmasBonusDay {
  dayNumber: number;
  dateLabel: string;
  timeLabel: string;
  sessionState: ChristmasBonusDayState;
  quickNotice: string;
  customRoomUrl: string;
}

export interface ChristmasBonusOperator {
  name: string;
  role: string;
}

export interface ChristmasBonusConfig {
  title: string;
  festiveTag: string;
  subtitle: string;
  description: string;
  status: ChristmasBonusStatus;
  startDate: string;
  endDate: string;
  liveTimeWat: string;
  liveRoomUrl: string;
  accessNotes: string;
  coverImageUrl: string;
  isCardVisible: boolean;
  operatorsTitle: string;
  operators: ChristmasBonusOperator[];
  days: ChristmasBonusDay[];
  updatedAt: string;
  updatedBy?: string;
}

export const LIVE_OPERATION_DAYS_COUNT = 45;
export const DEFAULT_LIVE_TIME_SHORT = '22:00 WAT';
export const DEFAULT_LIVE_TIME_FULL = '22:00 WAT (Horário de Angola)';

export const DEFAULT_CHRISTMAS_BONUS_DAYS: ChristmasBonusDay[] = Array.from(
  { length: LIVE_OPERATION_DAYS_COUNT },
  (_, index) => ({
    dayNumber: index + 1,
    dateLabel: 'Data a definir',
    timeLabel: DEFAULT_LIVE_TIME_SHORT,
    sessionState: 'waiting' as ChristmasBonusDayState,
    quickNotice: 'O link e os detalhes desta sessão serão atualizados pelo Marks antes da abertura da sala.',
    customRoomUrl: '',
  })
);

export const DEFAULT_CHRISTMAS_BONUS_OPERATORS_TITLE = 'Operações com comunidade de monstro';

export const DEFAULT_CHRISTMAS_BONUS_OPERATORS: ChristmasBonusOperator[] = [
  { name: 'Lúrio O Trader Monstro', role: 'Operador ao Vivo' },
  { name: 'Rich Mem o Monstro', role: 'Operador ao Vivo' },
  { name: 'Markes O Monstro', role: 'Operador ao Vivo' },
  { name: 'Entre outros Monstro', role: 'Operadores da Comunidade' },
];

export const DEFAULT_CHRISTMAS_BONUS_CONFIG: ChristmasBonusConfig = {
  title: '45 dias de operação ao vivo com a comunidade Monstros',
  festiveTag: 'Bônus de Boas Festas',
  subtitle: 'Operações ao vivo às 22h com Lúrio, Rich Mem, Markes e a comunidade de monstros',
  description:
    'Uma imersão especial dedicada aos estudantes da Money Building: 45 dias consecutivos de operação ao vivo às 22 horas com a comunidade Monstros no mercado, unindo disciplina e lucratividade.',
  status: 'draft',
  startDate: 'Datas a definir (45 Dias)',
  endDate: '45 Dias Consecutivos',
  liveTimeWat: DEFAULT_LIVE_TIME_FULL,
  liveRoomUrl: '',
  accessNotes:
    'Este evento especial é aberto a todos os estudantes da plataforma. Utilize gestão de risco responsável (1% a 2% por operação), entre na sala com 10 minutos de antecedência às 22h (WAT) e utilize apenas o link oficial publicado nesta página.',
  coverImageUrl: '',
  isCardVisible: true,
  operatorsTitle: DEFAULT_CHRISTMAS_BONUS_OPERATORS_TITLE,
  operators: DEFAULT_CHRISTMAS_BONUS_OPERATORS,
  days: DEFAULT_CHRISTMAS_BONUS_DAYS,
  updatedAt: new Date().toISOString(),
  updatedBy: 'Administração Money Building',
};

function sanitizeDayState(val: unknown): ChristmasBonusDayState {
  if (val === 'live' || val === 'completed' || val === 'postponed' || val === 'waiting') {
    return val;
  }
  return 'waiting';
}

function upgradeLegacyCopy(raw?: Partial<ChristmasBonusConfig> | null): Partial<ChristmasBonusConfig> {
  if (!raw) return {};
  const next: Partial<ChristmasBonusConfig> = { ...raw };

  if (typeof next.title === 'string') {
    const trimmed = next.title.trim();
    if (/^7\s+dias\s+de\s+opera[cç][aã]o\s+ao\s+vivo/i.test(trimmed)) {
      next.title = trimmed.replace(/^7\s+dias/i, '45 dias');
    }
  }

  if (typeof next.subtitle === 'string') {
    const trimmed = next.subtitle.trim();
    if (trimmed === 'Sete dias de operação ao vivo com Marks, o Monstro') {
      next.subtitle = '45 dias de operação ao vivo às 22h com Marks, o Monstro';
    } else if (trimmed === 'Operações ao vivo com Lúrio, Rich Mem, Markes e a comunidade de monstros') {
      next.subtitle = DEFAULT_CHRISTMAS_BONUS_CONFIG.subtitle;
    }
  }

  if (typeof next.description === 'string') {
    const trimmed = next.description.trim();
    if (
      trimmed ===
      'Uma imersão especial dedicada aos estudantes da Money Building: sete dias consecutivos de operação ao vivo com a comunidade Monstros no mercado, unindo disciplina e lucratividade.'
    ) {
      next.description = DEFAULT_CHRISTMAS_BONUS_CONFIG.description;
    }
  }

  if (typeof next.startDate === 'string' && next.startDate.trim() === 'Datas a definir (Dezembro)') {
    next.startDate = DEFAULT_CHRISTMAS_BONUS_CONFIG.startDate;
  }

  if (typeof next.endDate === 'string' && /^7\s+dias\s+consecutivos$/i.test(next.endDate.trim())) {
    next.endDate = DEFAULT_CHRISTMAS_BONUS_CONFIG.endDate;
  }

  if (typeof next.liveTimeWat === 'string') {
    const trimmedTime = next.liveTimeWat.trim();
    if (trimmedTime === '20:00 WAT (Horário de Angola)' || trimmedTime === '20:00 WAT') {
      next.liveTimeWat = DEFAULT_LIVE_TIME_FULL;
    }
  }

  return next;
}

function mergeConfig(raw?: Partial<ChristmasBonusConfig> | null): ChristmasBonusConfig {
  const normalizedRaw = upgradeLegacyCopy(raw);
  const existingDays = Array.isArray(normalizedRaw?.days) ? normalizedRaw.days : [];

  const days = DEFAULT_CHRISTMAS_BONUS_DAYS.map((defaultDay, idx) => {
    const d: any = existingDays[idx];
    if (!d) {
      return { ...defaultDay };
    }
    const rawTime = typeof d?.timeLabel === 'string' ? d.timeLabel.trim() : '';
    const resolvedTime =
      !rawTime || rawTime === '20:00 WAT'
        ? DEFAULT_LIVE_TIME_SHORT
        : rawTime;

    return {
      dayNumber: idx + 1,
      dateLabel:
        typeof d?.dateLabel === 'string' && d.dateLabel.trim()
          ? d.dateLabel
          : defaultDay.dateLabel,
      timeLabel: resolvedTime,
      sessionState: sanitizeDayState(d?.sessionState),
      quickNotice:
        typeof d?.quickNotice === 'string'
          ? d.quickNotice
          : defaultDay.quickNotice,
      customRoomUrl: typeof d?.customRoomUrl === 'string' ? d.customRoomUrl : '',
    };
  });

  const operators =
    Array.isArray(normalizedRaw?.operators) && normalizedRaw.operators.length > 0
      ? normalizedRaw.operators
          .map((op: any) => ({
            name: typeof op?.name === 'string' ? op.name.trim() : '',
            role: typeof op?.role === 'string' && op.role.trim() ? op.role.trim() : 'Operador ao Vivo',
          }))
          .filter((op) => op.name.length > 0)
      : DEFAULT_CHRISTMAS_BONUS_OPERATORS.map((o) => ({ ...o }));

  const resolvedOperators =
    operators.length > 0 ? operators : DEFAULT_CHRISTMAS_BONUS_OPERATORS.map((o) => ({ ...o }));

  const operatorsTitle =
    typeof normalizedRaw?.operatorsTitle === 'string' && normalizedRaw.operatorsTitle.trim()
      ? normalizedRaw.operatorsTitle.trim()
      : DEFAULT_CHRISTMAS_BONUS_OPERATORS_TITLE;

  return {
    ...DEFAULT_CHRISTMAS_BONUS_CONFIG,
    ...normalizedRaw,
    isCardVisible: typeof normalizedRaw?.isCardVisible === 'boolean' ? normalizedRaw.isCardVisible : true,
    operatorsTitle,
    operators: resolvedOperators,
    days,
  };
}

export function isChristmasBonusCardActive(config?: Partial<ChristmasBonusConfig> | null): boolean {
  if (!config) return true;
  if (config.isCardVisible === false) return false;
  if (config.status === 'ended') return false;
  return true;
}

export async function getChristmasBonusConfig(): Promise<ChristmasBonusConfig> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'christmas_bonus'));
    if (snap.exists()) {
      return mergeConfig(snap.data() as Partial<ChristmasBonusConfig>);
    }
    return DEFAULT_CHRISTMAS_BONUS_CONFIG;
  } catch (err) {
    console.warn('Erro ao buscar configuração do Bônus de Natal, usando padrão:', err);
    return DEFAULT_CHRISTMAS_BONUS_CONFIG;
  }
}

export function subscribeChristmasBonusConfig(
  callback: (config: ChristmasBonusConfig) => void
): () => void {
  const docRef = doc(db, 'settings', 'christmas_bonus');
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        callback(mergeConfig(snap.data() as Partial<ChristmasBonusConfig>));
      } else {
        callback(DEFAULT_CHRISTMAS_BONUS_CONFIG);
      }
    },
    (err) => {
      console.warn('Erro no listener do Bônus de Natal:', err);
      callback(DEFAULT_CHRISTMAS_BONUS_CONFIG);
    }
  );
}

export async function saveChristmasBonusConfig(
  newConfig: Partial<ChristmasBonusConfig>,
  updatedBy: string = 'Administrador'
): Promise<ChristmasBonusConfig> {
  const docRef = doc(db, 'settings', 'christmas_bonus');
  const payload = mergeConfig({
    ...newConfig,
    updatedAt: new Date().toISOString(),
    updatedBy,
  });
  await setDoc(docRef, payload, { merge: false });
  return payload;
}

export function getChristmasBonusStatusMeta(status: ChristmasBonusStatus): {
  label: string;
  shortLabel: string;
  accentClass: string;
} {
  switch (status) {
    case 'live':
      return {
        label: 'Ao Vivo Agora · Transmissão Liberada',
        shortLabel: 'Ao Vivo',
        accentClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
      };
    case 'scheduled':
      return {
        label: 'Agendado · Sala Preparada',
        shortLabel: 'Agendado',
        accentClass: 'bg-[#e9c349]/15 text-[#e9c349] border-[#e9c349]/35',
      };
    case 'ended':
      return {
        label: 'Edição Encerrada',
        shortLabel: 'Encerrado',
        accentClass: 'bg-stone-700/40 text-stone-300 border-stone-600/40',
      };
    case 'draft':
    default:
      return {
        label: 'Em Preparação · Aguardando Publicação',
        shortLabel: 'Em Preparação',
        accentClass: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
      };
  }
}

export function getChristmasBonusDayStateMeta(state: ChristmasBonusDayState): {
  label: string;
  badgeClass: string;
} {
  switch (state) {
    case 'live':
      return {
        label: 'Ao Vivo Agora',
        badgeClass: 'text-emerald-400',
      };
    case 'completed':
      return {
        label: 'Concluído',
        badgeClass: 'text-[#e9c349]',
      };
    case 'postponed':
      return {
        label: 'Adiado / Reagendado',
        badgeClass: 'text-rose-400',
      };
    case 'waiting':
    default:
      return {
        label: 'Aguardando',
        badgeClass: 'text-stone-300',
      };
  }
}
