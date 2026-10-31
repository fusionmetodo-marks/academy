import re

# Update StudentCatalog
with open('src/components/StudentCatalog.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """    // 1. Procurar cupão específico para este curso
    const specificCoupon = coupons.find(c => c.scope === 'course' && c.courseId === course.id);
    // 2. Procurar cupão de produtor (todos os cursos do mesmo autor)
    const producerCoupon = coupons.find(c => c.scope === 'producer' && c.producerId === course.authorId);
    // 3. Procurar cupão geral (todos os cursos)
    const generalCoupon = coupons.find(c => c.scope === 'all' || c.scope === 'general' || !c.scope || !c.courseId);
    
    // O sistema é inteligente e escolhe o melhor cupão ativo para o curso (aqui tentamos pela ordem de prioridade)
    // Se quiser o de MAIOR desconto, podemos ordenar:
    const activeCoupon = specificCoupon || producerCoupon || generalCoupon;"""

content = re.sub(
    r"    // 1\. Procurar cupão específico para este curso.*?const activeCoupon = specificCoupon \|\| generalCoupon;",
    replacement,
    content,
    flags=re.DOTALL
)

with open('src/components/StudentCatalog.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated StudentCatalog")
