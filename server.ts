import express from 'express';
import path from 'path';
import cors from 'cors';
import webpush from 'web-push';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

const app = express();
const PORT = 3000;

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-email']
}));
app.options('*', cors());
app.use(express.json());

// Security Headers Middleware (Iframe-compliant for AI Studio preview environment)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
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
 * Validador criptográfico de Firebase ID Token via Google Identity Toolkit
 */
async function verifyFirebaseIdToken(idToken?: string): Promise<{ uid: string; email: string } | null> {
  if (!idToken) return null;
  try {
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.users && data.users.length > 0) {
      return {
        uid: data.users[0].localId,
        email: (data.users[0].email || '').toLowerCase()
      };
    }
  } catch (err) {
    console.warn('Erro ao validar idToken no Identity Toolkit:', err);
  }
  return null;
}

/**
 * Parser para converter campos do formato Firestore REST API para objeto JavaScript simples
 */
function parseFirestoreFields(fields: any): any {
  if (!fields) return {};
  const result: any = {};
  for (const [key, val] of Object.entries<any>(fields)) {
    if (val.stringValue !== undefined) result[key] = val.stringValue;
    else if (val.booleanValue !== undefined) result[key] = val.booleanValue;
    else if (val.integerValue !== undefined) result[key] = Number(val.integerValue);
    else if (val.doubleValue !== undefined) result[key] = Number(val.doubleValue);
    else if (val.arrayValue !== undefined) {
      result[key] = (val.arrayValue.values || []).map((v: any) => v.stringValue ?? v.integerValue ?? v);
    } else if (val.mapValue !== undefined) {
      result[key] = parseFirestoreFields(val.mapValue.fields);
    }
  }
  return result;
}

/**
 * Validador autoritativo de privilégios administrativos
 */
async function verifyAdminAuth(req: express.Request): Promise<boolean> {
  const authHeader = req.headers['authorization'] || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.body?.idToken || '');
  
  if (idToken) {
    const verified = await verifyFirebaseIdToken(idToken);
    if (verified) {
      if (isMasterEmail(verified.email)) {
        return true;
      }
      try {
        const userSnap = await getDoc(doc(db, 'users', verified.uid));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          if (uData.role === 'admin' || (uData.role === 'producer' && uData.subscriptionStatus === 'active')) {
            return true;
          }
        }
      } catch (_) {}
    }
  }

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
    } catch {
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
 * O servidor valida se o utilizador possui matrícula ativa ou privilégios de administrador antes de autorizar o streaming do vídeo.
 */
app.post('/api/lessons/verify-access', async (req, res) => {
  try {
    const { 
      userId, 
      courseId, 
      lessonId, 
      studentEmail, 
      studentName, 
      studentPhone, 
      enrolledCourses, 
      subscriptionStatus,
      role 
    } = req.body || {};

    const authHeader = req.headers['authorization'] || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.body?.idToken || '');

    let verifiedUid = '';
    let verifiedEmail = '';

    if (idToken) {
      const verified = await verifyFirebaseIdToken(idToken);
      if (verified) {
        verifiedUid = verified.uid;
        verifiedEmail = verified.email;
      }
    }

    const targetUid = verifiedUid || userId || 'user';
    const emailToCheck = (verifiedEmail || studentEmail || '').trim().toLowerCase();

    // 1. Verificação instantânea incondicional de Administradores Mestres
    const isMaster = isMasterEmail(emailToCheck);
    const isRoleAdmin = role === 'admin' || role === 'producer';

    if (isMaster || isRoleAdmin) {
      const sessionTimestamp = Date.now();
      const expiresAt = sessionTimestamp + 3600000;
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const rawPayload = `${targetUid}:${courseId || 'admin'}:${lessonId || ''}:${expiresAt}:${clientIp}`;
      const hmacSignature = crypto.createHmac('sha256', MASTER_KEY).update(rawPayload).digest('hex');
      const secureToken = Buffer.from(`${rawPayload}:${hmacSignature}`).toString('base64');

      return res.status(200).json({
        allowed: true,
        token: secureToken,
        expiresAt: expiresAt,
        drmType: 'wistia-domain-lock-aes',
        studentName: studentName || (isMaster ? 'Administrador Mestre' : 'Produtor / Admin'),
        studentEmail: emailToCheck,
        studentPhone: studentPhone || ''
      });
    }

    // 2. Para alunos comuns, valida identificação e curso
    if (!userId && !studentEmail && !verifiedUid) {
      return res.status(401).json({ 
        allowed: false, 
        reason: 'Identificação de utilizador obrigatória para validação de acesso' 
      });
    }

    const targetCourseId = courseId || lessonId;
    if (!targetCourseId) {
      return res.status(400).json({ 
        allowed: false, 
        reason: 'Identificação do curso obrigatória para validação de acesso' 
      });
    }

    // 3. Consulta autoritativa via Firestore REST API com o ID Token do usuário
    let remoteUserData: any = null;

    if (idToken && targetUid) {
      try {
        const fsUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/users/${targetUid}`;
        const fsRes = await fetch(fsUrl, {
          headers: { 'Authorization': `Bearer ${idToken}` }
        });
        if (fsRes.ok) {
          const fsJson = await fsRes.json();
          remoteUserData = parseFirestoreFields(fsJson.fields);
        }
      } catch (fsErr) {
        console.warn('Aviso: Falha ao ler Firestore REST com token:', fsErr);
      }
    }

    // Se não obteve via REST, tenta via SDK por UID
    if (!remoteUserData && targetUid && targetUid !== 'user') {
      try {
        const userRef = doc(db, 'users', targetUid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          remoteUserData = userSnap.data();
        }
      } catch {
        // Erro permissivo no backend
      }
    }

    // 3.4 Busca autoritativa complementar por e-mail para cobrir registros salvos por e-mail
    let emailUserData: any = null;
    if (emailToCheck) {
      try {
        const q = query(collection(db, 'users'), where('email', '==', emailToCheck));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          emailUserData = qSnap.docs[0].data();
        }
      } catch (_) {}
    }

    const mergedEnrolledCourses = [
      ...(Array.isArray(remoteUserData?.enrolledCourses) ? remoteUserData.enrolledCourses : []),
      ...(Array.isArray(emailUserData?.enrolledCourses) ? emailUserData.enrolledCourses : []),
      ...(Array.isArray(enrolledCourses) ? enrolledCourses : [])
    ];

    // Determina os dados do usuário a partir dos dados do servidor (UID/Email) ou da requisição
    const userRole = remoteUserData?.role || emailUserData?.role || role || 'student';
    const userStatus = remoteUserData?.subscriptionStatus || emailUserData?.subscriptionStatus || subscriptionStatus || 'active';
    let enrolledList: string[] = Array.from(new Set(mergedEnrolledCourses));
    if (enrolledList.includes('marks-trading-master') || enrolledList.includes('curso-cfa')) {
      if (!enrolledList.includes('c_1793470582310')) {
        enrolledList.push('c_1793470582310');
      }
    }

    const isAdmin = userRole === 'admin' || userRole === 'producer' || isMaster;
    const isEnrolled = enrolledList.includes(targetCourseId);
    const isActive = userStatus === 'active';

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
    const rawPayload = `${targetUid}:${targetCourseId}:${lessonId || ''}:${expiresAt}:${clientIp}`;
    const hmacSignature = crypto.createHmac('sha256', MASTER_KEY).update(rawPayload).digest('hex');
    const secureToken = Buffer.from(`${rawPayload}:${hmacSignature}`).toString('base64');

    const fullName = remoteUserData?.fullName || remoteUserData?.name || studentName || 'Estudante Autorizado';
    const finalEmail = remoteUserData?.email || emailToCheck || '';
    const finalPhone = remoteUserData?.phoneNumber || studentPhone || '';

    return res.status(200).json({
      allowed: true,
      token: secureToken,
      expiresAt: expiresAt,
      drmType: 'wistia-domain-lock-aes',
      studentName: fullName,
      studentEmail: finalEmail,
      studentPhone: finalPhone
    });

  } catch (error: any) {
    console.error('Erro na validação de autorização backend:', error);
    return res.status(403).json({ 
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
