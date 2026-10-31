import { initializeApp, deleteApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { 
  initializeFirestore,
  getFirestore,
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

// Configure log level to silent to prevent connection heartbeat noise during transient reconnects
setLogLevel('silent');

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firestore initialization with auto-detect long polling
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();

// Validate connection to Firestore on boot silently
async function testConnection() {
  try {
    await getDoc(doc(db, 'settings', 'general')).catch(() => {});
  } catch (error) {
    // Silent
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

    const userRef = doc(db, 'users', newUid);
    await setDoc(userRef, {
      uid: newUid,
      email: email.trim().toLowerCase(),
      firstName: studentData.firstName.trim(),
      lastName: studentData.lastName.trim(),
      phoneCountryCode: studentData.phoneCountryCode || '+244',
      phoneNumber: studentData.phoneNumber || '',
      role: 'student',
      roleType: 'student',
      subscriptionStatus: hasCourses ? 'active' : 'inactive',
      enrolledCourses: selectedCourses,
      plan: hasCourses ? (studentData.plan || 'Estudante Matriculado') : 'Estudante Cadastrado (Sem Curso)',
      createdAt: serverTimestamp(),
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

    // 2. Inteligência: Insere o ID exato do curso comprado no array de cursos do usuário
    if (userId && !userId.startsWith('guest_')) {
      try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, {
            enrolledCourses: arrayUnion(targetCourseId),
            subscriptionStatus: 'active'
          });
        } else {
          console.warn(`User document ${userId} not found, skipping course enrollment.`);
        }
      } catch (userErr) {
        console.error("Failed to update user enrolledCourses:", userErr);
      }
    } else if (userEmail) {
      // Caso a transação tenha sido feita por guest com email cadastrado
      try {
        const q = query(collection(db, 'users'), where('email', '==', userEmail.trim().toLowerCase()));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const foundDoc = snap.docs[0];
          await updateDoc(doc(db, 'users', foundDoc.id), {
            enrolledCourses: arrayUnion(targetCourseId),
            subscriptionStatus: 'active'
          });
        }
      } catch (userErr) {
        console.error("Failed to update guest user enrolledCourses by email:", userErr);
      }
    }

    console.log(`Curso ${targetCourseId} liberado com sucesso para a transação ${transactionId}`);

    // Dispara notificação de pagamento aprovado
    try {
      await addDoc(collection(db, 'notifications'), {
        type: 'payment_approved',
        title: '🎉 Matrícula Confirmada!',
        message: `O seu pagamento foi aprovado com sucesso e o seu acesso ao curso foi liberado na sua Área do Estudante!`,
        link: '/library',
        targetRole: 'student',
        targetUserId: userId || null,
        read: false,
        timestamp: Date.now(),
        createdAt: serverTimestamp()
      });
    } catch (notifErr) {
      console.warn("Failed to create approval notification:", notifErr);
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
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (error) {
    console.error('Error signing in with email', error);
    throw error;
  }
};

export const registerWithEmail = async (email: string, pass: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (error) {
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
