import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  updatedAt?: string;
}

/**
 * Criptografa dados sensíveis (chaves de pagamento, tokens Wistia e segredos) no backend via AES-256-GCM.
 */
export async function encryptSecret(plaintext: any): Promise<EncryptedPayload> {
  const textToEncrypt = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
  try {
    const res = await fetch('/api/crypto/encrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plaintext: textToEncrypt })
    });
    if (!res.ok) {
      throw new Error('Falha na criptografia do servidor');
    }
    const data = await res.json();
    return {
      ciphertext: data.ciphertext,
      iv: data.iv,
      authTag: data.authTag,
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('Erro ao criptografar segredo:', err);
    throw err;
  }
}

/**
 * Descriptografa dados sensíveis armazenados no Firestore de forma segura através do proxy do backend.
 */
export async function decryptSecret(payload: EncryptedPayload): Promise<any> {
  if (!payload || !payload.ciphertext || !payload.iv || !payload.authTag) {
    return null;
  }
  try {
    const res = await fetch('/api/crypto/decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        authTag: payload.authTag
      })
    });
    if (!res.ok) {
      throw new Error('Falha na descriptografia do servidor');
    }
    const data = await res.json();
    try {
      return JSON.parse(data.decrypted);
    } catch {
      return data.decrypted;
    }
  } catch (err) {
    console.error('Erro ao descriptografar segredo:', err);
    return null;
  }
}

/**
 * Salva uma configuração sensível criptografada na coleção 'settings' do Firestore.
 */
export async function saveEncryptedSetting(settingKey: string, secretData: any): Promise<void> {
  const encryptedPayload = await encryptSecret(secretData);
  await setDoc(doc(db, 'settings', settingKey), encryptedPayload, { merge: true });
}

/**
 * Carrega e descriptografa uma configuração sensível da coleção 'settings' do Firestore.
 */
export async function loadEncryptedSetting(settingKey: string): Promise<any> {
  const snap = await getDoc(doc(db, 'settings', settingKey));
  if (!snap.exists()) return null;
  const data = snap.data() as EncryptedPayload;
  return await decryptSecret(data);
}
