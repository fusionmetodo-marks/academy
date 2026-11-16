import { useCallback, useEffect, useRef, useState } from 'react';

export type SendSafetyStage =
  | 'idle'
  | 'queued'
  | 'pacing'
  | 'sending'
  | 'compensating'
  | 'cooldown'
  | 'sent'
  | 'blocked_duplicate'
  | 'error';

export interface SendSafetyStatus {
  stage: SendSafetyStage;
  waitMs?: number;
  attempt?: number;
  queuedCount?: number;
  detail?: string;
}

export const MESSAGE_SAFETY_CONFIG = {
  /** Atraso básico entre envios no mesmo canal para evitar colisão de escrita (ms) */
  BASE_SEND_DELAY_MS: 280,
  /** Jitter máximo aleatório para distribuir cargas simultâneas de múltiplos usuários (ms) */
  MAX_SEND_JITTER_MS: 140,
  /** Atraso básico entre mensagens individuais em envios em grupo (ms) */
  BULK_ITEM_DELAY_MS: 160,
  /** Atraso básico entre lotes de envio em grupo (ms) */
  BULK_BATCH_DELAY_MS: 520,
  /** Tempo mínimo de bloqueio pós-disparo contra cliques múltiplos (ms) */
  MULTI_CLICK_COOLDOWN_MS: 500,
  /** Janela de proteção contra reenvio idêntico acidental (ms) */
  DUPLICATE_TEXT_WINDOW_MS: 3200,
  /** Tempo base de compensação de segurança ao detectar contenção/erro transitório (ms) */
  BASE_COMPENSATION_MS: 750,
  /** Teto máximo de compensação por tentativa (ms) */
  MAX_COMPENSATION_MS: 6500,
  /** Quantidade máxima de tentativas automáticas com compensação */
  MAX_RETRIES: 3,
  /** Incremento adaptativo global quando há alta concorrência (ms) */
  ADAPTIVE_PRESSURE_STEP_MS: 350,
  /** Teto do atraso adaptativo de pressão global (ms) */
  ADAPTIVE_PRESSURE_MAX_MS: 2200,
} as const;

export const sleepMs = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.round(ms))));

export const computeJitter = (maxJitterMs: number = MESSAGE_SAFETY_CONFIG.MAX_SEND_JITTER_MS): number => {
  if (maxJitterMs <= 0) return 0;
  return Math.floor(Math.random() * maxJitterMs);
};

/**
 * Gera um ID determinístico compatível com isValidDocId das regras do Firestore (^[a-zA-Z0-9_\-]+$)
 * para garantir idempotência em retentativas de envio.
 */
let idSeqCounter = 0;
export const createIdempotentMessageId = (prefix: string = 'm'): string => {
  idSeqCounter = (idSeqCounter + 1) % 1679616;
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'm';
  const tsPart = Date.now().toString(36);
  const seqPart = idSeqCounter.toString(36).padStart(3, '0');
  const randPart = Math.random().toString(36).slice(2, 7);
  return `${cleanPrefix}_${tsPart}_${seqPart}_${randPart}`.slice(0, 120);
};

/**
 * Classifica se um erro é transitório / causado por concorrência ou limite de taxa
 * e elegível para tempo de compensação de segurança + nova tentativa.
 */
export const isTransientMessagingError = (err: any): boolean => {
  if (!err) return false;
  const code = String(err.code || '').toLowerCase();
  const status = Number(err.status || err.statusCode || 0);
  const msg = String(err.message || '').toLowerCase();

  if (
    code.includes('aborted') ||
    code.includes('resource-exhausted') ||
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    code.includes('internal') ||
    code.includes('cancelled') ||
    code.includes('unknown') ||
    code.includes('network')
  ) {
    return true;
  }

  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  if (
    msg.includes('too many requests') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('muitas requisições') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('contention') ||
    msg.includes('aborted') ||
    msg.includes('unavailable')
  ) {
    return true;
  }

  return false;
};

/**
 * Estado global compartilhado do ecossistema de envio:
 * - Fila serializada por canal (evita corrida de escrita no mesmo thread)
 * - Pressão adaptativa global (aumenta compensação automaticamente sob pico de tráfego)
 */
const channelQueues = new Map<string, Promise<unknown>>();
const channelLastSentAt = new Map<string, number>();
let globalAdaptivePressureMs = 0;

export const getAdaptiveSafetyPressureMs = (): number => globalAdaptivePressureMs;

export const registerContentionPressure = (multiplier: number = 1): number => {
  globalAdaptivePressureMs = Math.min(
    MESSAGE_SAFETY_CONFIG.ADAPTIVE_PRESSURE_MAX_MS,
    globalAdaptivePressureMs + Math.round(MESSAGE_SAFETY_CONFIG.ADAPTIVE_PRESSURE_STEP_MS * multiplier)
  );
  return globalAdaptivePressureMs;
};

export const relaxContentionPressure = (stepMs: number = 180): void => {
  globalAdaptivePressureMs = Math.max(0, globalAdaptivePressureMs - stepMs);
};

export interface ExecuteSafetyOptions {
  channelKey?: string;
  baseDelayMs?: number;
  maxRetries?: number;
  baseCompensationMs?: number;
  onStatus?: (status: SendSafetyStatus) => void;
}

/**
 * Executa uma operação de envio com:
 * 1) Atraso básico de espaçamento + jitter anti-colisão
 * 2) Retentativa automática com tempos de compensação exponenciais em caso de concorrência
 */
export async function executeWithSafetyCompensation<T>(
  operation: (attempt: number) => Promise<T>,
  options: ExecuteSafetyOptions = {}
): Promise<T> {
  const {
    channelKey = 'global',
    baseDelayMs = MESSAGE_SAFETY_CONFIG.BASE_SEND_DELAY_MS,
    maxRetries = MESSAGE_SAFETY_CONFIG.MAX_RETRIES,
    baseCompensationMs = MESSAGE_SAFETY_CONFIG.BASE_COMPENSATION_MS,
    onStatus,
  } = options;

  // 1. Atraso básico de envio + pressão adaptativa + jitter para evitar colisão simultânea
  const lastAt = channelLastSentAt.get(channelKey) || 0;
  const elapsed = Date.now() - lastAt;
  const requiredSpacing = baseDelayMs + globalAdaptivePressureMs + computeJitter();
  const initialWait = elapsed < requiredSpacing ? requiredSpacing - elapsed : computeJitter(75);

  if (initialWait > 30) {
    onStatus?.({
      stage: 'pacing',
      waitMs: initialWait,
      attempt: 0,
      detail: 'Aplicando intervalo básico de segurança...',
    });
    await sleepMs(initialWait);
  }

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      onStatus?.({
        stage: 'sending',
        attempt,
        detail: attempt > 0 ? `Reenviando com compensação (${attempt}/${maxRetries})...` : 'Enviando...',
      });

      const result = await operation(attempt);
      channelLastSentAt.set(channelKey, Date.now());
      relaxContentionPressure();
      onStatus?.({ stage: 'sent', attempt });
      return result;
    } catch (err: any) {
      lastError = err;
      const canRetry = attempt < maxRetries && isTransientMessagingError(err);
      if (!canRetry) {
        onStatus?.({ stage: 'error', attempt, detail: err?.message });
        throw err;
      }

      // 2. Tempo de compensação de segurança com backoff exponencial + jitter + pressão adaptativa
      const currentPressure = registerContentionPressure();
      const expDelay = Math.min(
        MESSAGE_SAFETY_CONFIG.MAX_COMPENSATION_MS,
        baseCompensationMs * Math.pow(2, attempt)
      );
      const compensationWait = Math.min(
        MESSAGE_SAFETY_CONFIG.MAX_COMPENSATION_MS + 1500,
        expDelay + currentPressure + computeJitter(260)
      );

      onStatus?.({
        stage: 'compensating',
        waitMs: compensationWait,
        attempt: attempt + 1,
        detail: `Alta demanda detectada. Aguardando compensação (${(compensationWait / 1000).toFixed(1)}s)...`,
      });

      await sleepMs(compensationWait);
    }
  }

  throw lastError;
}

/**
 * Enfileira envios no mesmo canal sequencialmente para impedir corrida de escrita
 * mesmo quando múltiplos cliques válidos ou fluxos ocorrem em sequência rápida.
 */
export function enqueueSafeChannelSend<T>(
  channelKey: string,
  operation: (attempt: number) => Promise<T>,
  options: ExecuteSafetyOptions = {}
): Promise<T> {
  const prevTail = channelQueues.get(channelKey) || Promise.resolve();

  const runTask = prevTail
    .catch(() => undefined)
    .then(() =>
      executeWithSafetyCompensation(operation, {
        ...options,
        channelKey,
      })
    );

  const settledTail = runTask.then(
    () => undefined,
    () => undefined
  );

  channelQueues.set(channelKey, settledTail);
  settledTail.finally(() => {
    if (channelQueues.get(channelKey) === settledTail) {
      channelQueues.delete(channelKey);
    }
  });

  return runTask;
}

/**
 * Fila dedicada e espaçada para disparos Push HTTP (/api/push/*),
 * evitando erro 429 quando muitos usuários ou envios em grupo acontecem juntos.
 */
let pushQueueTail: Promise<void> = Promise.resolve();
let lastPushRequestAt = 0;

export function enqueueSafePushDispatch(fn: () => Promise<void>): Promise<void> {
  const next = pushQueueTail
    .catch(() => undefined)
    .then(async () => {
      const elapsed = Date.now() - lastPushRequestAt;
      const spacing = 220 + Math.round(globalAdaptivePressureMs * 0.5) + computeJitter(90);
      if (elapsed < spacing) {
        await sleepMs(spacing - elapsed);
      }
      lastPushRequestAt = Date.now();
      await fn();
    });

  pushQueueTail = next.catch(() => undefined);
  return next;
}

export async function fetchWithRateCompensation(
  url: string,
  init: RequestInit,
  maxRetries: number = 2
): Promise<Response | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || res.status === 503) {
        registerContentionPressure(1.2);
        if (attempt < maxRetries) {
          const retryAfterHeader = Number(res.headers.get('Retry-After') || 0);
          const waitMs =
            retryAfterHeader > 0
              ? Math.min(10000, retryAfterHeader * 1000 + computeJitter(200))
              : Math.min(6000, 900 * Math.pow(2, attempt) + computeJitter(300));
          await sleepMs(waitMs);
          continue;
        }
      }
      if (res.ok) {
        relaxContentionPressure(100);
      }
      return res;
    } catch {
      if (attempt < maxRetries) {
        await sleepMs(650 * (attempt + 1) + computeJitter(200));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Guardião síncrono contra cliques duplos, múltiplos cliques e reenvios idênticos.
 * Funciona de forma síncrona via refs (sem depender de re-render do React).
 */
export interface SafeSubmitAcquireResult {
  allowed: boolean;
  reason?: 'in_flight' | 'cooldown' | 'duplicate';
  remainingMs?: number;
  idempotencyKey?: string;
  release?: (succeeded: boolean, sentText?: string) => void;
}

export function useSafeSubmitGuard(options?: {
  cooldownMs?: number;
  duplicateWindowMs?: number;
}) {
  const cooldownMs = options?.cooldownMs ?? MESSAGE_SAFETY_CONFIG.MULTI_CLICK_COOLDOWN_MS;
  const duplicateWindowMs =
    options?.duplicateWindowMs ?? MESSAGE_SAFETY_CONFIG.DUPLICATE_TEXT_WINDOW_MS;

  const isLockedRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const lastSentMapRef = useRef<Map<string, number>>(new Map());
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isLocked, setIsLocked] = useState(false);
  const [inCooldown, setInCooldown] = useState(false);
  const [safetyStatus, setSafetyStatus] = useState<SendSafetyStatus>({ stage: 'idle' });

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  const acquire = useCallback(
    (channelKey: string, rawText: string, prefix: string = 'm'): SafeSubmitAcquireResult => {
      const now = Date.now();
      const normalizedText = rawText.trim().replace(/\s+/g, ' ');
      if (!normalizedText) {
        return { allowed: false, reason: 'in_flight', remainingMs: 0 };
      }

      // 1. Bloqueio síncrono imediato de cliques duplos / envio em curso
      if (isLockedRef.current) {
        return { allowed: false, reason: 'in_flight', remainingMs: cooldownMs };
      }

      // 2. Bloqueio de múltiplos cliques no intervalo de cooldown
      if (now < cooldownUntilRef.current) {
        const remainingMs = cooldownUntilRef.current - now;
        setSafetyStatus({
          stage: 'cooldown',
          waitMs: remainingMs,
          detail: 'Proteção contra múltiplos cliques ativa. Aguarde um instante.',
        });
        return { allowed: false, reason: 'cooldown', remainingMs };
      }

      // 3. Bloqueio contra reenvio idêntico acidental na janela de deduplicação
      const payloadKey = `${channelKey}::${normalizedText}`;
      const lastSameAt = lastSentMapRef.current.get(payloadKey) || 0;
      if (now - lastSameAt < duplicateWindowMs) {
        const remainingMs = duplicateWindowMs - (now - lastSameAt);
        setSafetyStatus({
          stage: 'blocked_duplicate',
          waitMs: remainingMs,
          detail: 'Mensagem idêntica já enviada há instantes.',
        });
        return { allowed: false, reason: 'duplicate', remainingMs };
      }

      isLockedRef.current = true;
      setIsLocked(true);
      setSafetyStatus({ stage: 'sending', detail: 'Validando envio seguro...' });

      const idempotencyKey = createIdempotentMessageId(prefix);
      let released = false;

      const release = (succeeded: boolean, sentText?: string) => {
        if (released) return;
        released = true;

        const finishNow = Date.now();
        isLockedRef.current = false;
        setIsLocked(false);

        if (succeeded) {
          const cleanSent = (sentText ?? normalizedText).trim().replace(/\s+/g, ' ');
          lastSentMapRef.current.set(`${channelKey}::${cleanSent}`, finishNow);
          if (lastSentMapRef.current.size > 40) {
            const firstKey = lastSentMapRef.current.keys().next().value;
            if (firstKey) lastSentMapRef.current.delete(firstKey);
          }
        }

        cooldownUntilRef.current = finishNow + cooldownMs;
        setInCooldown(true);
        if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = setTimeout(() => {
          setInCooldown(false);
          setSafetyStatus((prev) =>
            prev.stage === 'sent' || prev.stage === 'cooldown' || prev.stage === 'blocked_duplicate'
              ? { stage: 'idle' }
              : prev
          );
        }, cooldownMs);
      };

      return {
        allowed: true,
        idempotencyKey,
        release,
      };
    },
    [cooldownMs, duplicateWindowMs]
  );

  return {
    acquire,
    isLocked,
    inCooldown,
    isBusy: isLocked || inCooldown,
    safetyStatus,
    setSafetyStatus,
  };
}
