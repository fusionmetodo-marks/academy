/**
 * Utilitários de mascaramento de dados sensíveis (PII)
 * Garante que apenas o Administrador Mestre ("Maestro") visualize informações completas.
 */

export function maskEmail(email?: string | null, isMaster: boolean = false): string {
  if (!email) return '---';
  if (isMaster) return email;

  const [username, domain] = email.split('@');
  if (!domain) return '***';

  const maskedUser = username.length <= 2 
    ? username[0] + '***'
    : username.slice(0, 2) + '*'.repeat(Math.max(3, username.length - 2));

  const domainParts = domain.split('.');
  const domainName = domainParts[0] || '';
  const domainExt = domainParts.slice(1).join('.');

  const maskedDomain = domainName.length <= 2
    ? '***'
    : domainName[0] + '***' + domainName.slice(-1);

  return `${maskedUser}@${maskedDomain}.${domainExt || 'com'}`;
}

export function maskPhone(phone?: string | null, isMaster: boolean = false, countryCode: string = '+244'): string {
  if (!phone) return 'Não informado';
  if (isMaster) return `${countryCode} ${phone}`.trim();

  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length <= 4) {
    return `${countryCode} **-**`;
  }

  // Exemplos: "+244 9** *** *89"
  const prefix = clean.slice(0, 1);
  const suffix = clean.slice(-2);
  const stars = '*'.repeat(Math.max(4, clean.length - 3));

  return `${countryCode} ${prefix}${stars.slice(0, 2)} ${stars.slice(2, 5)} *${suffix}`;
}

export function maskIban(iban?: string | null, isMaster: boolean = false): string {
  if (!iban) return 'Não configurado';
  if (isMaster) return iban;

  const clean = iban.replace(/\s+/g, '');
  if (clean.length < 8) return '**** ****';

  const start = clean.slice(0, 4);
  const end = clean.slice(-4);
  return `${start} **** **** **** **** ${end}`;
}
