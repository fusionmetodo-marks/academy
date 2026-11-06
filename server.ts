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

// Military-Grade Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// DDoS & Brute-Force Rate Limiting Middleware for API Endpoints
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 min
const RATE_LIMIT_MAX = 150; // max 150 requests per min per IP

app.use('/api/', (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, record);
  } else {
    record.count++;
    if (record.count > RATE_LIMIT_MAX) {
      return res.status(429).json({ error: 'Muitas requisições detectadas. Limite de segurança atingido, aguarde um momento.' });
    }
  }
  next();
});

const MASTER_EMAILS = [
  'fusionmetodo@gmail.com',
  'grupocassaminha@gmail.com',
  'exportacoes.extras@gmail.com'
];

function isMasterEmail(email?: string): boolean {
  if (!email) return false;
  return MASTER_EMAILS.includes(email.trim().toLowerCase());
}

// Carregar configuração oficial do Firebase para validação no backend
const configPath = new URL('./firebase-applet-config.json', import.meta.url);
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

/**
 * Validador autoritativo de privilégios administrativos
 */
async function verifyAdminAuth(req: express.Request): Promise<boolean> {
  const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
  const userEmail = (req.headers['x-user-email'] as string) || req.body?.userEmail;

  if (userEmail && isMasterEmail(userEmail)) {
    return true;
  }

  if (userId) {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const uData = userSnap.data();
        if (isMasterEmail(uData.email) || uData.role === 'admin' || (uData.role === 'producer' && uData.subscriptionStatus === 'active')) {
          return true;
        }
      }
    } catch (err) {
      console.warn('Erro ao verificar autorização admin no backend:', err);
      return false;
    }
  }
  return false;
}

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

app.post('/api/crypto/encrypt', async (req, res) => {
  try {
    const isAuthorized = await verifyAdminAuth(req);
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Acesso negado: Requer privilégios de Administrador.' });
    }
    const { plaintext } = req.body;
    if (!plaintext) return res.status(400).json({ error: 'Plaintext is required' });
    const encrypted = encryptData(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));
    res.json(encrypted);
  } catch (err: any) {
    console.error('Encryption error:', err);
    res.status(500).json({ error: 'Failed to encrypt data' });
  }
});

app.post('/api/crypto/decrypt', async (req, res) => {
  try {
    const isAuthorized = await verifyAdminAuth(req);
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Acesso negado: Requer privilégios de Administrador.' });
    }
    const { ciphertext, iv, authTag } = req.body;
    if (!ciphertext || !iv || !authTag) return res.status(400).json({ error: 'Ciphertext, iv and authTag are required' });
    const decrypted = decryptData(ciphertext, iv, authTag);
    res.json({ decrypted });
  } catch (err: any) {
    console.error('Decryption error:', err);
    res.status(500).json({ error: 'Failed to decrypt data (invalid signature or key)' });
  }
});

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

    if (!userId || !courseId) {
      return res.status(400).json({ 
        allowed: false, 
        reason: 'Identificação de utilizador e curso obrigatórios para validação de acesso' 
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
    
    // Verificação estrita de matrícula ativa no curso específico
    const enrolledCourses = Array.isArray(userData.enrolledCourses) ? userData.enrolledCourses : [];
    const isEnrolled = enrolledCourses.includes(courseId);
    const isActive = userData.subscriptionStatus === 'active';

    if (!isAdmin && (!isEnrolled || !isActive)) {
      return res.status(403).json({
        allowed: false,
        reason: 'Acesso bloqueado pelo servidor: Matrícula inativa ou não autorizada para este curso.'
      });
    }

    // Assinatura criptográfica HMAC-SHA256 do token de sessão de streaming (válido por 1 hora)
    const sessionTimestamp = Date.now();
    const expiresAt = sessionTimestamp + 3600000;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rawPayload = `${userId}:${courseId}:${lessonId || ''}:${expiresAt}:${clientIp}`;
    const hmacSignature = crypto.createHmac('sha256', MASTER_KEY).update(rawPayload).digest('hex');
    const secureToken = Buffer.from(`${rawPayload}:${hmacSignature}`).toString('base64');

    const fullName = userData.fullName || userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Estudante';
    const phone = (userData.phoneCountryCode || '+244') + (userData.phoneNumber || '');

    return res.status(200).json({
      allowed: true,
      token: secureToken,
      expiresAt: expiresAt,
      drmType: 'wistia-domain-lock-aes',
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
  const isAuthorized = await verifyAdminAuth(req);
  if (!isAuthorized) {
    return res.status(403).json({ error: 'Acesso negado: Disparo de notificações restrito a administradores.' });
  }

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
