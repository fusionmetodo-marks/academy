export const DEFAULT_ACADEMY_LOGO = 'https://i.postimg.cc/LXt95dqk/rt.png';
export const DEFAULT_CFA_LOGO = DEFAULT_ACADEMY_LOGO;

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
