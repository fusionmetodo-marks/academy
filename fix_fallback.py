import re

logic = """
      if (c.scope === 'producer') {
        const adminEmails = ['grupocassaminha@gmail.com', 'exportacoes.extras@gmail.com', 'grupocassaminha@gmail.com'];
        const courseAuthorId = course.authorId;
        const courseAuthorEmail = course.authorEmail;
        const couponProducerId = c.producerId;
        const couponProducerEmail = c.producerEmail;
        
        if (couponProducerId && courseAuthorId && couponProducerId === courseAuthorId) return true;
        if (couponProducerEmail && courseAuthorEmail && couponProducerEmail.toLowerCase() === courseAuthorEmail.toLowerCase()) return true;
        
        // Cursos antigos sem owner são do admin
        const isCourseOldAdmin = !courseAuthorId && !courseAuthorEmail;
        // Cupões criados pelo admin (ou antes de ter email salvo)
        const isCouponAdmin = !couponProducerEmail || adminEmails.includes(couponProducerEmail.toLowerCase());
        
        if (isCourseOldAdmin && isCouponAdmin) {
           return true;
        }
        
        return false;
      }
"""

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    pattern = re.compile(r"      if \(c\.scope === 'producer'\) \{.*?return false;\n      \}", re.DOTALL)
    
    if "courseData" in content:
        local_logic = logic.replace("course.", "courseData?")
    else:
        local_logic = logic
        
    content = pattern.sub(local_logic.strip('\n'), content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

replace_in_file('src/components/StudentCatalog.tsx')
replace_in_file('src/pages/SalesPage.tsx')
replace_in_file('src/components/CourseCheckout.tsx')

print("Fixed Fallback")
