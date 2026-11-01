import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface UsdtExchangeConfig {
  rate: number; // Kwanza por 1 USDT (ex: 1050)
  minPurchaseUsdt: number; // Mínimo de compra (ex: 10)
  maxPurchaseUsdt?: number; // Máximo opcional
  supportedNetworks: string[]; // ['TRC-20 (Tron)', 'BEP-20 (BNB Chain)']
  whatsappNumber: string; // Telefone com DDI para onde o aluno enviará o pedido
  isActive: boolean; // Se a venda está aberta ou pausada
  safetyInstructions: string; // Mensagem com regras e passos de segurança (editável pelo admin)
  updatedAt: string; // Data e hora ISO da última atualização da cotação
  updatedBy?: string; // Nome/email de quem atualizou
}

export const DEFAULT_USDT_CONFIG: UsdtExchangeConfig = {
  rate: 1050,
  minPurchaseUsdt: 10,
  maxPurchaseUsdt: 20000,
  supportedNetworks: ['TRC-20 (Tron)', 'BEP-20 (BNB Smart Chain)'],
  whatsappNumber: '244923456789',
  isActive: true,
  safetyInstructions: `📌 REGRAS E DIRETRIZES DE SEGURANÇA PARA COMPRA DE USDT:
1. Verifique sempre a data e a hora da cotação exibida no topo desta página antes de solicitar.
2. Digite a quantidade de USDT desejada no simulador e clique em "Solicitar Compra no WhatsApp".
3. Os pagamentos são aceitos exclusivamente via Transferência Bancária (IBAN) ou Multicaixa Express oficiais da Money Building.
4. Jamais envie pagamentos para contas bancárias não confirmadas pelo nosso WhatsApp oficial.
5. Após o envio e validação do comprovativo bancário, os seus USDT serão transferidos de forma imediata para a sua carteira informada (TRC-20 ou BEP-20).`,
  updatedAt: new Date().toISOString(),
  updatedBy: 'Administração Money Building'
};

const DOC_PATH = 'settings/usdt_exchange';

/**
 * Busca a configuração atual do câmbio USDT
 */
export async function getUsdtExchangeConfig(): Promise<UsdtExchangeConfig> {
  try {
    const docRef = doc(db, 'settings', 'usdt_exchange');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { ...DEFAULT_USDT_CONFIG, ...(snap.data() as UsdtExchangeConfig) };
    }
    return DEFAULT_USDT_CONFIG;
  } catch (err) {
    console.error('Erro ao buscar configuração de USDT:', err);
    return DEFAULT_USDT_CONFIG;
  }
}

/**
 * Escuta em tempo real as alterações da cotação e regras do USDT
 */
export function subscribeUsdtExchangeConfig(callback: (config: UsdtExchangeConfig) => void): () => void {
  const docRef = doc(db, 'settings', 'usdt_exchange');
  const unsubscribe = onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        callback({ ...DEFAULT_USDT_CONFIG, ...(snap.data() as UsdtExchangeConfig) });
      } else {
        callback(DEFAULT_USDT_CONFIG);
      }
    },
    (err) => {
      console.warn('Erro no snapshot do USDT Exchange, usando padrão:', err);
      callback(DEFAULT_USDT_CONFIG);
    }
  );

  return unsubscribe;
}

/**
 * Salva as alterações da cotação e regras feitas pelo Administrador
 */
export async function saveUsdtExchangeConfig(
  newConfig: Partial<UsdtExchangeConfig>,
  updatedBy: string = 'Administrador'
): Promise<void> {
  const docRef = doc(db, 'settings', 'usdt_exchange');
  const payload: UsdtExchangeConfig = {
    ...DEFAULT_USDT_CONFIG,
    ...newConfig,
    updatedAt: new Date().toISOString(),
    updatedBy
  };

  await setDoc(docRef, payload, { merge: true });
}

/**
 * Formata valor em Kwanzas com separador de milhares
 */
export function formatKz(amount: number): string {
  if (isNaN(amount)) return '0 Kz';
  return new Intl.NumberFormat('pt-AO', {
    maximumFractionDigits: 2
  }).format(amount) + ' Kz';
}

/**
 * Formata data e hora de forma elegante e humana em português
 */
export function formatPublicationDateTime(isoString?: string): string {
  if (!isoString) return 'Hoje';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date) + ' (WAT)';
  } catch {
    return isoString;
  }
}

/**
 * Gera o link direto para o WhatsApp oficial com o pedido formatado e os dados da conta do aluno
 */
export function buildUsdtWhatsAppLink(
  phone: string,
  usdtAmount: number,
  kwanzaTotal: number,
  rate: number,
  updatedAtText: string,
  studentName?: string,
  studentEmail?: string
): string {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const nameDisplay = studentName?.trim() || 'Estudante Registrado';
  const emailDisplay = studentEmail?.trim() || 'E-mail associado à conta';

  const message = `*SOLICITAÇÃO DE COMPRA DE USDT — MONEY BUILDING*

👤 *DADOS DA CONTA DO ALUNO:*
• *Nome:* ${nameDisplay}
• *E-mail Cadastrado:* ${emailDisplay}
• *Plataforma:* Money Building

📊 *DETALHES DO PEDIDO:*
• *Quantidade:* *${usdtAmount.toLocaleString('pt-PT')} USDT*
• *Cotação Oficial:* *1 USDT = ${formatKz(rate)}*
• *Total a Pagar:* *${formatKz(kwanzaTotal)}*
• *Cotação Atualizada em:* *${updatedAtText}*

💳 *COMO DESEJO CONCLUIR:*
Solicito as coordenadas bancárias oficiais (IBAN / Multicaixa Express) da Money Building para transferência do valor em Kwanza. Enviarei o comprovativo e minha carteira digital (TRC20 / BEP20) logo em seguida.`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
