import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const SHORT_MONTHS_PT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/**
 * Gera chave única YYYY-MM-DD no fuso horário local do utilizador para agrupamento por dia civil.
 */
export const getChatDayKey = (ms?: number | null): string => {
  if (!ms || Number.isNaN(ms)) return 'unknown';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Formata o rótulo do separador cronológico do chat:
 * - Hoje
 * - Ontem
 * - Anteontem
 * - Datas anteriores no formato curto: ex. "12 de nov de 2026"
 */
export const formatChatDateDividerLabel = (ms?: number | null): string => {
  if (!ms || Number.isNaN(ms)) return 'Data desconhecida';

  const msgDate = new Date(ms);
  const now = new Date();

  const msgMidnight = new Date(
    msgDate.getFullYear(),
    msgDate.getMonth(),
    msgDate.getDate()
  ).getTime();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();

  const diffDays = Math.round((todayMidnight - msgMidnight) / 86_400_000);

  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays === 2) return 'Anteontem';

  const day = msgDate.getDate();
  const month = SHORT_MONTHS_PT[msgDate.getMonth()] || 'jan';
  const year = msgDate.getFullYear();

  return `${day} de ${month} de ${year}`;
};

/**
 * Formata apenas hora:minuto (HH:mm) para exibição limpa dentro do balão da mensagem.
 */
export const formatMessageTimeOnly = (ms?: number | null): string => {
  if (!ms || Number.isNaN(ms)) return '';
  return new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
};

const FLOATING_ALERTS_EVENT = 'floating-chat-alerts-changed';

const getStorageKey = (userId?: string | null) =>
  `mb_floating_chat_alerts_${userId || 'default'}`;

export const getFloatingChatAlertsEnabled = (userId?: string | null): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
};

export const subscribeFloatingChatAlertsSetting = (
  userId: string | null | undefined,
  onChange: (enabled: boolean) => void
): (() => void) => {
  onChange(getFloatingChatAlertsEnabled(userId));

  const handleCustomEvent = (evt: Event) => {
    const custom = evt as CustomEvent<{ userId?: string | null; enabled: boolean }>;
    if (!custom.detail) return;
    if (!userId || !custom.detail.userId || custom.detail.userId === userId) {
      onChange(Boolean(custom.detail.enabled));
    }
  };

  const handleStorageEvent = (evt: StorageEvent) => {
    if (evt.key === getStorageKey(userId)) {
      onChange(evt.newValue !== 'false');
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(FLOATING_ALERTS_EVENT, handleCustomEvent as EventListener);
    window.addEventListener('storage', handleStorageEvent);
  }

  let unsubFirestore: (() => void) | null = null;
  if (userId && auth.currentUser) {
    unsubFirestore = onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (typeof data?.floatingChatAlertsEnabled === 'boolean') {
          const enabled = data.floatingChatAlertsEnabled;
          try {
            localStorage.setItem(getStorageKey(userId), String(enabled));
          } catch {
            // ignore storage errors
          }
          onChange(enabled);
        }
      },
      (err) => {
        console.warn('Aviso ao sincronizar preferência de alertas flutuantes:', err);
      }
    );
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(FLOATING_ALERTS_EVENT, handleCustomEvent as EventListener);
      window.removeEventListener('storage', handleStorageEvent);
    }
    if (unsubFirestore) unsubFirestore();
  };
};

export const setFloatingChatAlertsEnabled = async (
  userId: string | null | undefined,
  enabled: boolean
): Promise<void> => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getStorageKey(userId), String(enabled));
    } catch {
      // ignore storage errors
    }
    window.dispatchEvent(
      new CustomEvent(FLOATING_ALERTS_EVENT, {
        detail: { userId: userId || null, enabled },
      })
    );
  }

  if (userId && auth.currentUser?.uid === userId) {
    try {
      await updateDoc(doc(db, 'users', userId), {
        floatingChatAlertsEnabled: enabled,
      });
    } catch (err) {
      console.warn('Preferência salva localmente; aviso ao gravar no perfil:', err);
    }
  }
};
