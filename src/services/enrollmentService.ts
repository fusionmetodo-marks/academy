import { doc, onSnapshot, collection, query, where, updateDoc, arrayUnion, arrayRemove, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export interface UserEnrollmentData {
  docId: string;
  enrolledCourses: string[];
  completedLessons: string[];
  subscriptionStatus: string;
  userProfile: any;
}

/**
 * Escuta em tempo real os cursos matriculados, aulas concluídas e perfil do usuário.
 * Faz busca defensiva pelo UID do Firebase Auth e também pelo e-mail caso os IDs divirjam.
 */
export function subscribeUserEnrollments(
  user: { uid?: string; email?: string | null } | null,
  onUpdate: (data: UserEnrollmentData) => void
): () => void {
  if (!user || (!user.uid && !user.email)) {
    onUpdate({
      docId: '',
      enrolledCourses: [],
      completedLessons: [],
      subscriptionStatus: 'inactive',
      userProfile: null
    });
    return () => {};
  }

  let unsub1 = () => {};
  let unsub2 = () => {};

  const handleSnapData = (docId: string, data: any) => {
    const enrolled = Array.isArray(data?.enrolledCourses) ? data.enrolledCourses : [];
    const completed = Array.isArray(data?.completedLessons) ? data.completedLessons : [];
    const status = data?.subscriptionStatus || (enrolled.length > 0 ? 'active' : 'inactive');

    onUpdate({
      docId,
      enrolledCourses: enrolled,
      completedLessons: completed,
      subscriptionStatus: status,
      userProfile: data
    });
  };

  if (user.uid) {
    const userRef = doc(db, 'users', user.uid);
    unsub1 = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        handleSnapData(snap.id, snap.data());
      } else if (user.email) {
        // Busca fallback por e-mail caso o documento por UID não exista
        const cleanEmail = user.email.trim().toLowerCase();
        const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
        unsub2 = onSnapshot(q, (qSnap) => {
          if (!qSnap.empty) {
            const found = qSnap.docs[0];
            handleSnapData(found.id, found.data());
            // Vincula e sincroniza com o UID real do usuário no Auth para acessos futuros
            setDoc(userRef, found.data(), { merge: true }).catch(() => {});
          } else {
            handleSnapData(user.uid!, null);
          }
        }, (err) => {
          console.warn("Erro ao escutar usuário por e-mail:", err);
          handleSnapData(user.uid!, null);
        });
      } else {
        handleSnapData(user.uid!, null);
      }
    }, (err) => {
      console.warn("Erro ao escutar documento do usuário por UID:", err);
    });
  } else if (user.email) {
    const cleanEmail = user.email.trim().toLowerCase();
    const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
    unsub2 = onSnapshot(q, (qSnap) => {
      if (!qSnap.empty) {
        const found = qSnap.docs[0];
        handleSnapData(found.id, found.data());
      } else {
        handleSnapData('', null);
      }
    });
  }

  return () => {
    unsub1();
    unsub2();
  };
}

/**
 * Adiciona um curso aos "Meus Cursos" do aluno (matrícula imediata/curso grátis)
 */
export async function addCourseToUser(userId: string, userEmail: string | null, courseId: string): Promise<boolean> {
  try {
    if (userId) {
      const uRef = doc(db, 'users', userId);
      await setDoc(uRef, {
        enrolledCourses: arrayUnion(courseId),
        subscriptionStatus: 'active'
      }, { merge: true });
    }

    if (userEmail) {
      const cleanEmail = userEmail.trim().toLowerCase();
      const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        if (docSnap.id !== userId) {
          await updateDoc(doc(db, 'users', docSnap.id), {
            enrolledCourses: arrayUnion(courseId),
            subscriptionStatus: 'active'
          });
        }
      }
    }
    return true;
  } catch (error) {
    console.error("Erro ao adicionar curso ao usuário:", error);
    throw error;
  }
}

/**
 * Remove um curso dos "Meus Cursos" do aluno (revogação pelo admin)
 */
export async function removeCourseFromUser(userId: string, userEmail: string | null, courseId: string): Promise<boolean> {
  try {
    if (userId) {
      const uRef = doc(db, 'users', userId);
      await setDoc(uRef, {
        enrolledCourses: arrayRemove(courseId)
      }, { merge: true });
    }

    if (userEmail) {
      const cleanEmail = userEmail.trim().toLowerCase();
      const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        if (docSnap.id !== userId) {
          await updateDoc(doc(db, 'users', docSnap.id), {
            enrolledCourses: arrayRemove(courseId)
          });
        }
      }
    }
    // Revoga transações ativas aprovadas associadas para este curso
    try {
      const cleanEmail = userEmail ? userEmail.trim().toLowerCase() : '';
      const txSnap = await getDocs(query(collection(db, 'transactions'), where('status', '==', 'approved')));
      for (const docSnap of txSnap.docs) {
        const d = docSnap.data();
        const txEmail = (d.userEmail || d.studentEmail || d.email || '').trim().toLowerCase();
        const match = (userId && d.userId === userId) || (cleanEmail && txEmail === cleanEmail);
        if (match && d.courseId === courseId) {
          await updateDoc(doc(db, 'transactions', docSnap.id), {
            status: 'revoked',
            revokedAt: new Date().toISOString(),
            revocationReason: 'Acesso revogado'
          });
        }
      }
    } catch (txErr) {
      console.warn("Aviso ao revogar transações vinculadas:", txErr);
    }

    return true;
  } catch (error) {
    console.error("Erro ao remover curso do usuário:", error);
    throw error;
  }
}
