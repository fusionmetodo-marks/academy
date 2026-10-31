with open('src/components/CourseCheckout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_msg = 'message: `O aluno ${finalStudentName} informou pagamento de ${formattedPrice} no seu curso "${safeTitle}".`'
new_msg = 'message: `O aluno ${finalStudentName} informou pagamento de ${formattedPrice} no seu curso "${safeTitle}". Aceda à plataforma para validar o comprovativo e libertar o acesso do aluno ao curso.`'

content = content.replace(old_msg, new_msg)

with open('src/components/CourseCheckout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
