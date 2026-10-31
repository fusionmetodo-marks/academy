import re

logic = """      // Dispara notificação em tempo real para telemóveis dos administradores
      sendSystemNotification({
        type: 'payment_submitted',
        title: '💳 Pagamento Informado ("Já Paguei")!',
        message: `O aluno ${finalStudentName} informou pagamento de ${formattedPrice} no curso "${safeTitle}". Referência: ${cleanRef}`,
        link: '/dashboard',
        targetRole: 'admin',
        metadata: {
          studentName: finalStudentName,
          courseTitle: safeTitle,
          amount: finalPrice,
          referenceNumber: cleanRef,
          paymentMethod: selectedMethod.shortName || selectedMethod.bankName || 'Transferência',
          phone: studentPhoneInput.trim()
        }
      });

      if (courseData && courseData.authorId) {
        sendSystemNotification({
          type: 'payment_submitted',
          title: '💰 Nova Venda Recebida!',
          message: `O aluno ${finalStudentName} informou pagamento de ${formattedPrice} no seu curso "${safeTitle}".`,
          link: '/dashboard',
          targetRole: 'producer',
          targetUserId: courseData.authorId,
          metadata: {
            studentName: finalStudentName,
            courseTitle: safeTitle,
            amount: finalPrice,
            referenceNumber: cleanRef
          }
        });
      }"""

with open('src/components/CourseCheckout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r"      // Dispara notificação em tempo real para telemóveis dos administradores.*?      \}\);\n", re.DOTALL)
content = pattern.sub(logic + "\n", content)

with open('src/components/CourseCheckout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated Checkout")
