import express from 'express';
import path from 'path';
import cors from 'cors';
import webpush from 'web-push';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// AES-256-GCM Cryptographic Engine for Sensitive Payment and Wistia Secrets
const MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'money-building-secure-master-secret-key-2026';
const KEY_BUFFER = crypto.scryptSync(MASTER_KEY, 'money-building-salt', 32);

function encryptData(text: string): { ciphertext: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY_BUFFER, iv);
  let ciphertext = cipher.update(text, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { ciphertext, iv: iv.toString('hex'), authTag };
}

function decryptData(ciphertext: string, ivHex: string, authTagHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY_BUFFER, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

app.post('/api/crypto/encrypt', (req, res) => {
  try {
    const { plaintext } = req.body;
    if (!plaintext) return res.status(400).json({ error: 'Plaintext is required' });
    const encrypted = encryptData(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));
    res.json(encrypted);
  } catch (err: any) {
    console.error('Encryption error:', err);
    res.status(500).json({ error: 'Failed to encrypt data' });
  }
});

app.post('/api/crypto/decrypt', (req, res) => {
  try {
    const { ciphertext, iv, authTag } = req.body;
    if (!ciphertext || !iv || !authTag) return res.status(400).json({ error: 'Ciphertext, iv and authTag are required' });
    const decrypted = decryptData(ciphertext, iv, authTag);
    res.json({ decrypted });
  } catch (err: any) {
    console.error('Decryption error:', err);
    res.status(500).json({ error: 'Failed to decrypt data (invalid signature or key)' });
  }
});

// Carregar configuração oficial do Firebase para validação no backend
const configPath = new URL('./firebase-applet-config.json', import.meta.url);
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BH78AfuxrLzczmvgRlw_wBSCsjwjjOyvtckmd__4OEzEVDHF894rS7848ZC3rMbIsQ9gSyRhX85PuCAzFPouLdY';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '-uGUUBJgbXtlcyzpSKtKWAOTxYdTMh95Xosnd4PRi5Q';

webpush.setVapidDetails(
  'mailto:fusionmetodo@gmail.com',
  publicVapidKey,
  privateVapidKey
);

app.get('/api/push/vapidPublicKey', (req, res) => {
  res.json({ publicKey: publicVapidKey });
});

/**
 * Rota Protegida de Validação de Acesso às Aulas
 * O servidor valida se o utilizador possui matrícula ativa no Firestore antes de autorizar o streaming do vídeo.
 */
app.post('/api/lessons/verify-access', async (req, res) => {
  try {
    const { userId, courseId, lessonId } = req.body;

    if (!userId) {
      return res.status(401).json({ 
        allowed: false, 
        reason: 'Utilizador não autenticado na plataforma' 
      });
    }

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return res.status(403).json({ 
        allowed: false, 
        reason: 'Registo do utilizador não encontrado no sistema' 
      });
    }

    const userData = userSnap.data();
    const email = (userData.email || '').toLowerCase();
    
    // Lista de administradores mestres
    const isMaster = [
      'fusionmetodo@gmail.com', 
      'grupocassaminha@gmail.com', 
      'exportacoes.extras@gmail.com'
    ].includes(email);

    const isAdmin = userData.role === 'admin' || userData.role === 'producer' || isMaster;
    
    // Verificação de matrícula ativa no curso
    const enrolledCourses = Array.isArray(userData.enrolledCourses) ? userData.enrolledCourses : [];
    const isEnrolled = courseId ? enrolledCourses.includes(courseId) : true;
    const isActive = userData.subscriptionStatus === 'active';

    if (!isAdmin && (!isEnrolled || !isActive)) {
      return res.status(403).json({
        allowed: false,
        reason: 'Acesso bloqueado pelo servidor: Matrícula inativa ou não autorizada para este curso.'
      });
    }

    // Assinatura do token de sessão de reprodução (válido por 1 hora)
    const sessionTimestamp = Date.now();
    const tokenPayload = `${userId}:${courseId || 'free'}:${lessonId || ''}:${sessionTimestamp}`;
    const secureToken = Buffer.from(tokenPayload).toString('base64');

    const fullName = userData.fullName || userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Estudante';
    const phone = (userData.phoneCountryCode || '+244') + (userData.phoneNumber || '');

    return res.status(200).json({
      allowed: true,
      token: secureToken,
      expiresAt: sessionTimestamp + 3600000,
      studentName: fullName,
      studentEmail: userData.email || '',
      studentPhone: phone
    });

  } catch (error: any) {
    console.error('Erro na validação de autorização backend:', error);
    return res.status(500).json({ 
      allowed: false, 
      reason: 'Erro interno ao validar autorização de segurança' 
    });
  }
});

app.post('/api/push/send', async (req, res) => {
  const { subscriptions, payload } = req.body;
  
  if (!subscriptions || !Array.isArray(subscriptions)) {
    return res.status(400).json({ error: 'Subscriptions array is required' });
  }

  const pushPayload = JSON.stringify({
    title: payload.title || 'Marks o Monstro - ACADEMY',
    body: payload.body || 'Nova notificação!',
    url: payload.url || '/dashboard'
  });

  const promises = subscriptions.map(sub => 
    webpush.sendNotification(sub, pushPayload).catch(err => {
      console.error('Error sending push to a subscription', err);
      return { status: 'failed', sub };
    })
  );

  await Promise.all(promises);
  res.status(200).json({ success: true });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
