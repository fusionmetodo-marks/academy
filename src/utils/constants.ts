export const DEFAULT_ACADEMY_LOGO = 'https://i.postimg.cc/LXt95dqk/rt.png';
export const DEFAULT_CFA_LOGO = DEFAULT_ACADEMY_LOGO;
export const DEFAULT_SUPPORT_WHATSAPP = '244954890702';

export const MASTER_ADMIN_EMAILS = [
  'fusionmetodo@gmail.com'
];

export const isMasterEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return MASTER_ADMIN_EMAILS.includes(clean);
};

export function getValidLogoUrl(url?: string): string {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return DEFAULT_ACADEMY_LOGO;
  }
  if (
    url.includes('googleusercontent.com') ||
    url.includes('aida-public') ||
    url.includes('SKLjyxVP') ||
    (url.includes('postimg.cc') && !url.includes('mDY7XpVF') && !url.includes('LXt95dqk'))
  ) {
    return DEFAULT_ACADEMY_LOGO;
  }
  return url;
}

export interface PaymentProofData {
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  courseTitle: string;
  formattedPrice: string;
  paymentMethod: string;
  referenceNumber?: string;
  whatsappNumber?: string;
}

export function buildPaymentProofWhatsAppMessage(data: PaymentProofData): string {
  const name = (data.studentName || '').trim() || 'Estudante';
  const email = (data.studentEmail || '').trim() || 'Não informado';
  const phone = (data.studentPhone || '').trim() || 'Não informado';
  const course = (data.courseTitle || '').trim() || 'Curso / Mentoria';
  const price = (data.formattedPrice || '').trim() || 'A confirmar';
  const method = (data.paymentMethod || '').trim() || 'Transferência';

  return `👋 *SOLICITAÇÃO DE VERIFICAÇÃO DE COMPROVATIVO*
*Plataforma Money Building*

Olá, equipe de Suporte! Acabei de realizar o pagamento para adesão e gostaria de solicitar a verificação do meu comprovativo em anexo para a liberação do acesso.

👤 *DADOS DO ESTUDANTE:*
• *Nome Completo:* ${name}
• *E-mail do Cadastro:* ${email}
• *Telefone Registrado:* ${phone}

📚 *DETALHES DO PEDIDO:*
• *Curso / Serviço:* ${course}
• *Valor:* ${price}
• *Método de Pagamento:* ${method}

📎 *Ação Necessária:*
Segue em anexo o meu comprovativo de pagamento para validação e liberação do acesso à minha conta na plataforma. Obrigado!`;
}

export function buildPaymentProofWhatsAppUrl(data: PaymentProofData): string {
  const targetNumber = (data.whatsappNumber || DEFAULT_SUPPORT_WHATSAPP).replace(/[^0-9]/g, '') || DEFAULT_SUPPORT_WHATSAPP;
  const message = buildPaymentProofWhatsAppMessage(data);
  return `https://wa.me/${targetNumber}?text=${encodeURIComponent(message)}`;
}

