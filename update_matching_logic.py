import re

logic = """
      if (c.scope === 'producer') {
        const adminEmails = ['grupocassaminha@gmail.com', 'exportacoes.extras@gmail.com', 'Grupocassaminha@gmail.com'];
        const courseAuthorId = course.authorId;
        const courseAuthorEmail = course.authorEmail;
        const couponProducerId = c.producerId;
        const couponProducerEmail = c.producerEmail;
        
        // Match by UID
        if (couponProducerId && courseAuthorId && couponProducerId === courseAuthorId) return true;
        // Match by Email
        if (couponProducerEmail && courseAuthorEmail && couponProducerEmail.toLowerCase() === courseAuthorEmail.toLowerCase()) return true;
        
        // Se o curso NÃO tem authorId nem email (cursos antigos criados pelo admin),
        // E o cupão foi criado pelo Admin, permitimos.
        const isCourseOldAdmin = !courseAuthorId && !courseAuthorEmail;
        const isCouponAdmin = couponProducerEmail && adminEmails.includes(couponProducerEmail.toLowerCase());
        
        // Se o cupão não tiver producerEmail, mas quem tiver logado no momento tentar ver o desconto 
        // e ele for admin (neste caso não temos currentUser aqui facilmente, então baseamos nos dados)
        if (isCourseOldAdmin) {
           return true; // Todos os cursos antigos sem dono são considerados da CFA/Admin, então cupões de produtor CFA aplicam-se a eles
        }
        
        return false;
      }
"""

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    pattern = re.compile(r"      if \(c\.scope === 'producer'\) \{\n        return c\.producerId === (?:course|courseData\?)\.authorId;\n      \}", re.DOTALL)
    
    # We replace "course.authorId" to correctly reference course or courseData
    if "courseData" in content:
        local_logic = logic.replace("course.", "courseData.")
    else:
        local_logic = logic
        
    content = pattern.sub(local_logic.strip('\n'), content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

replace_in_file('src/components/StudentCatalog.tsx')
replace_in_file('src/pages/SalesPage.tsx')
replace_in_file('src/components/CourseCheckout.tsx')

print("Updated Logic")
