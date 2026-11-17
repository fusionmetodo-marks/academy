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

export const DEFAULT_CHRISTMAS_BONUS_DAYS: ChristmasBonusDay[] = Array.from(
  { length: 7 },
  (_, index) => ({
    dayNumber: index + 1,
    dateLabel: 'Data a definir',
    timeLabel: '20:00 WAT',
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
  title: 'Bônus de Natal',
  festiveTag: 'Bônus de Boas Festas',
  subtitle: 'Sete dias de operação ao vivo com Marks, o Monstro',
  description:
    'Uma imersão especial de Boas Festas dedicada aos estudantes da Money Building: sete dias consecutivos operando ao vivo com o Marks no mercado, unindo espírito natalício, disciplina e lucratividade.',
  status: 'draft',
  startDate: 'Datas a definir (Dezembro)',
  endDate: '7 Dias Consecutivos',
  liveTimeWat: '20:00 WAT (Horário de Angola)',
  liveRoomUrl: '',
  accessNotes:
    'Este evento especial é aberto a todos os estudantes da plataforma. Utilize gestão de risco responsável (1% a 2% por operação), entre na sala com 10 minutos de antecedência e utilize apenas o link oficial publicado nesta página.',
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

function mergeConfig(raw?: Partial<ChristmasBonusConfig> | null): ChristmasBonusConfig {
  const days =
    Array.isArray(raw?.days) && raw!.days.length === 7
      ? raw!.days.map((d: any, idx) => ({
          dayNumber: idx + 1,
          dateLabel:
            typeof d?.dateLabel === 'string' && d.dateLabel.trim()
              ? d.dateLabel
              : DEFAULT_CHRISTMAS_BONUS_DAYS[idx].dateLabel,
          timeLabel:
            typeof d?.timeLabel === 'string' && d.timeLabel.trim()
              ? d.timeLabel
              : DEFAULT_CHRISTMAS_BONUS_DAYS[idx].timeLabel,
          sessionState: sanitizeDayState(d?.sessionState),
          quickNotice:
            typeof d?.quickNotice === 'string'
              ? d.quickNotice
              : DEFAULT_CHRISTMAS_BONUS_DAYS[idx].quickNotice,
          customRoomUrl: typeof d?.customRoomUrl === 'string' ? d.customRoomUrl : '',
        }))
      : DEFAULT_CHRISTMAS_BONUS_DAYS.map((d) => ({ ...d }));

  const operators =
    Array.isArray(raw?.operators) && raw!.operators.length > 0
      ? raw!.operators
          .map((op: any) => ({
            name: typeof op?.name === 'string' ? op.name.trim() : '',
            role: typeof op?.role === 'string' && op.role.trim() ? op.role.trim() : 'Operador ao Vivo',
          }))
          .filter((op) => op.name.length > 0)
      : DEFAULT_CHRISTMAS_BONUS_OPERATORS.map((o) => ({ ...o }));

  const resolvedOperators =
    operators.length > 0 ? operators : DEFAULT_CHRISTMAS_BONUS_OPERATORS.map((o) => ({ ...o }));

  const operatorsTitle =
    typeof raw?.operatorsTitle === 'string' && raw.operatorsTitle.trim()
      ? raw.operatorsTitle.trim()
      : DEFAULT_CHRISTMAS_BONUS_OPERATORS_TITLE;

  return {
    ...DEFAULT_CHRISTMAS_BONUS_CONFIG,
    ...(raw || {}),
    isCardVisible: typeof raw?.isCardVisible === 'boolean' ? raw.isCardVisible : true,
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
