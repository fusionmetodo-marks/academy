import re

with open('src/components/CourseCheckout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

logic = """
      const producerId = courseData?.authorId || '';
      const producerEmail = courseData?.authorEmail || '';
      const isAdminCourse = !producerId && !producerEmail;

      if (producerId || producerEmail || isAdminCourse) {
        sendSystemNotification({
          type: 'payment_submitted',
          title: '💰 Nova Venda Recebida!',
          message: `O aluno ${finalStudentName} informou pagamento de ${formattedPrice} no seu curso "${safeTitle}". Aceda à plataforma para validar o comprovativo e libertar o acesso do aluno ao curso.`,
          link: '/dashboard',
          targetRole: 'producer',
          targetUserId: producerId || 'admin_default',
          metadata: {
            studentName: finalStudentName,
            courseTitle: safeTitle,
            amount: finalPrice,
            referenceNumber: cleanRef,
            targetEmail: producerEmail
          }
        });
      }"""

pattern = re.compile(r"      if \(courseData && courseData\.authorId\) \{.*?      \}", re.DOTALL)
content = pattern.sub(logic.strip(), content)

with open('src/components/CourseCheckout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated CourseCheckout.tsx")
