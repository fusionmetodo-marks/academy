import { doc, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Aprova uma transação de pagamento e libera o curso para o aluno de forma atômica.
 *
 * @param transactionId ID da transação na collection 'transactions'
 * @param userId ID do usuário na collection 'users'
 * @param courseId ID do curso a ser destrancado
 */
export const handleApproveTransaction = async (
  transactionId: string, 
  userId: string, 
  courseId: string = 'cfa-financial-master'
) => {
  try {
    const batch = writeBatch(db);

    // 1. Muda o status da transação para aprovado
    const transactionRef = doc(db, 'transactions', transactionId);
    batch.update(transactionRef, { status: 'approved' });

    // 2. Destranca o curso inserindo o ID na lista do aluno
    if (userId && !userId.startsWith('guest_')) {
      const userRef = doc(db, 'users', userId);
      batch.update(userRef, { 
        enrolledCourses: arrayUnion(courseId),
        subscriptionStatus: 'active'
      });
    }

    // Executa as duas ações simultaneamente
    await batch.commit();
    return { success: true, message: 'Pagamento aprovado e curso liberado com sucesso!' };
  } catch (error) {
    console.error("Erro ao aprovar:", error);
    throw error;
  }
};
