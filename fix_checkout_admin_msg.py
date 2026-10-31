import re

with open('src/components/CourseCheckout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_msg = 'message: `O aluno ${finalStudentName} informou pagamento de ${formattedPrice} no curso "${safeTitle}". Referência: ${cleanRef}`'
new_msg = 'message: `O aluno ${finalStudentName} informou pagamento de ${formattedPrice} no curso "${safeTitle}" (Produtor: ${courseData?.authorEmail || \'CFA Academy\'}). Referência: ${cleanRef}`'

content = content.replace(old_msg, new_msg)

with open('src/components/CourseCheckout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Checkout")
