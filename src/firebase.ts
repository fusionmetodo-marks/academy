import { initializeApp, deleteApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence
} from 'firebase/auth';
import { 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
  doc, 
  setDoc, 
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  serverTimestamp,
  getDoc,
  getDocFromServer,
  addDoc
} from 'firebase/firestore';

import firebaseConfig from '../firebase-applet-config.json';
import { initGlobalReadQuotaSync } from './services/guardedFirestore';

// Configure log level to silent to prevent connection heartbeat noise during transient reconnects
setLogLevel('silent');

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {
  setPersistence(auth, inMemoryPersistence).catch(() => {});
});

// Firestore com cache local persistente em IndexedDB + long polling para máxima economia de leituras
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
}, firebaseConfig.firestoreDatabaseId);

initGlobalReadQuotaSync(db);

export const googleProvider = new GoogleAuthProvider();

// Validate connection to Firestore on boot (at most once per browser session)
async function testConnection() {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('fs_conn_checked_v1')) {
      return;
    }
    await getDocFromServer(doc(db, 'test', 'connection'));
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('fs_conn_checked_v1', '1');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export interface NewStudentPayload {
  firstName: string;
  lastName: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  enrolledCourses?: string[];
  plan?: string;
}

export const adminCreateStudentAccount = async (
  email: string, 
  pass: string, 
  studentData: NewStudentPayload
) => {
  const secondaryAppName = `SecondaryApp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), pass);
    const newUid = userCredential.user.uid;

    const selectedCourses = studentData.enrolledCourses || [];
    const hasCourses = selectedCourses.length > 0;

    const fullName = `${studentData.firstName.trim()} ${studentData.lastName?.trim() || ''}`.trim();
    const userRef = doc(db, 'users', newUid);
    await setDoc(userRef, {
      uid: newUid,
      email: email.trim().toLowerCase(),
      firstName: studentData.firstName.trim(),
      lastName: studentData.lastName?.trim() || '',
      fullName: fullName,
      name: fullName,
      displayName: fullName,
      phoneCountryCode: studentData.phoneCountryCode || '+244',
      phoneNumber: studentData.phoneNumber || '',
      role: 'student',
      roleType: 'student',
      subscriptionStatus: hasCourses ? 'active' : 'inactive',
      enrolledCourses: selectedCourses,
      plan: hasCourses ? (studentData.plan || 'Estudante Matriculado') : 'Estudante Cadastrado (Sem Curso)',
      profileCompleted: true,
      createdAt: serverTimestamp(),
      ...(hasCourses ? { subscriptionActivatedAt: serverTimestamp() } : {}),
      createdBy: auth.currentUser?.email || 'admin'
    });

    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);

    return { uid: newUid, email: email.trim() };
  } catch (error: any) {
    try {
      await deleteApp(secondaryApp);
    } catch (_) {}
    console.error('Error creating student account as admin:', error);
    throw error;
  }
};

export const approveStudentTransaction = async (
  transactionId: string, 
  userId?: string, 
  courseId: string = 'marks-trading-master',
  userEmail?: string
) => {
  try {
    // 1. Atualiza o status da transação para 'approved'
    const txRef = doc(db, 'transactions', transactionId);
    await updateDoc(txRef, { 
      status: 'approved',
      approvedAt: serverTimestamp(),
      approvedBy: auth.currentUser?.email || 'admin'
    });

    const targetCourseId = courseId || 'marks-trading-master';
    let resolvedUserId = userId && !userId.startsWith('guest_') ? userId : undefined;
    let resolvedEmail = (userEmail || '').trim().toLowerCase();
    let txUserName = '';
    let txUserPhone = '';
    let txCourseTitle = '';
    let txAmount: number | null = null;

    try {
      const txSnap = await getDoc(txRef);
      if (txSnap.exists()) {
        const txData = txSnap.data();
        if (!resolvedEmail && txData.userEmail) resolvedEmail = String(txData.userEmail).trim().toLowerCase();
        if (!resolvedUserId && txData.userId && !String(txData.userId).startsWith('guest_')) {
          resolvedUserId = txData.userId;
        }
        txUserName = txData.userName || '';
        txUserPhone = txData.userPhone || '';
        txCourseTitle = txData.courseTitle || '';
        if (typeof txData.amount === 'number') txAmount = txData.amount;
      }
    } catch {
      // ignore tx metadata fallback
    }

    // 2. Inteligência: Insere o ID exato do curso comprado no array de cursos do usuário
    if (resolvedUserId) {
      try {
        const userRef = doc(db, 'users', resolvedUserId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, {
            enrolledCourses: arrayUnion(targetCourseId),
            subscriptionStatus: 'active',
            subscriptionActivatedAt: serverTimestamp()
          });
        } else {
          console.warn(`User document ${resolvedUserId} not found, skipping course enrollment.`);
        }
      } catch (userErr) {
        console.error("Failed to update user enrolledCourses:", userErr);
      }
    } else if (resolvedEmail) {
      // Caso a transação tenha sido feita por guest com email cadastrado
      try {
        const q = query(collection(db, 'users'), where('email', '==', resolvedEmail));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const foundDoc = snap.docs[0];
          resolvedUserId = foundDoc.id;
          await updateDoc(doc(db, 'users', foundDoc.id), {
            enrolledCourses: arrayUnion(targetCourseId),
            subscriptionStatus: 'active',
            subscriptionActivatedAt: serverTimestamp()
          });
        }
      } catch (userErr) {
        console.error("Failed to update guest user enrolledCourses by email:", userErr);
      }
    }

    console.log(`Curso ${targetCourseId} liberado com sucesso para a transação ${transactionId}`);

    if (targetCourseId === 'live-room-christmas-bonus' && resolvedUserId) {
      try {
        const { CHRISTMAS_LIVE_ROOM_ID, joinLiveRoom } = await import('./services/liveRoomService');
        await joinLiveRoom({
          roomId: CHRISTMAS_LIVE_ROOM_ID,
          userId: resolvedUserId,
          displayName: txUserName || undefined,
          email: resolvedEmail || undefined,
        });
      } catch (liveRoomErr) {
        console.warn('Falha ao inscrever participante automaticamente na Sala Ao Vivo:', liveRoomErr);
      }
    }

    // Dispara notificação de pagamento aprovado para o Administrador
    try {
      await addDoc(collection(db, 'notifications'), {
        type: 'payment_approved',
        scope: 'admin',
        title: '💰 Pagamento Aprovado & Matrícula Liberada!',
        message: `A transação ${transactionId} (Curso: ${txCourseTitle || targetCourseId}) foi aprovada com sucesso no painel.`,
        link: '/directory',
        targetRole: 'admin',
        targetUserId: resolvedUserId || null,
        targetEmail: resolvedEmail || null,
        read: false,
        timestamp: Date.now(),
        createdAt: serverTimestamp()
      });
    } catch (notifErr) {
      console.warn("Failed to create admin approval notification:", notifErr);
    }

    // Dispara notificação INDIVIDUAL vinculada ao estudante (UID, nome, e-mail e telefone)
    try {
      const { notifyStudentCourseApproved } = await import('./services/notificationService');
      await notifyStudentCourseApproved({
        userId: resolvedUserId || null,
        email: resolvedEmail || null,
        name: txUserName || null,
        phone: txUserPhone || null,
        courseId: targetCourseId,
        courseTitle: txCourseTitle || null,
        approvedBy: auth.currentUser?.email || 'admin',
        transactionId,
        amount: txAmount,
      });
    } catch (studentNotifErr) {
      console.warn("Failed to create individual student approval notification:", studentNotifErr);
    }

    return true;
  } catch (error) {
    console.error("Erro ao aprovar transação e liberar curso:", error);
    throw error;
  }
};

export const sendResetEmail = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('Error sending password reset email', error);
    throw error;
  }
};

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google', error);
    throw error;
  }
};

export const loginWithEmail = async (email: string, pass: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
    return result.user;
  } catch (error: any) {
    if (error?.code === 'auth/network-request-failed' || error?.message?.includes('network-request-failed')) {
      try {
        await setPersistence(auth, inMemoryPersistence);
        const retryResult = await signInWithEmailAndPassword(auth, email.trim(), pass);
        return retryResult.user;
      } catch (retryErr) {
        console.error('Retry after network error failed:', retryErr);
      }
    }
    console.error('Error signing in with email', error);
    throw error;
  }
};

export const registerWithEmail = async (email: string, pass: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    return result.user;
  } catch (error: any) {
    if (error?.code === 'auth/network-request-failed' || error?.message?.includes('network-request-failed')) {
      try {
        await setPersistence(auth, inMemoryPersistence);
        const retryResult = await createUserWithEmailAndPassword(auth, email.trim(), pass);
        return retryResult.user;
      } catch (retryErr) {
        console.error('Retry registration after network error failed:', retryErr);
      }
    }
    console.error('Error registering with email', error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out', error);
    throw error;
  }
};
