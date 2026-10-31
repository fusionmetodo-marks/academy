import re

with open('src/components/CourseCheckout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """        // Executa todas as buscas em PARALELO para velocidade máxima
        const [genSnap, platSnap, paymentSettingsSnap, methodsSnap, couponsSnap, courseSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'general')).catch(() => null),
          getDoc(doc(db, 'settings', 'platform')).catch(() => null),
          getDoc(doc(db, 'settings', 'payment')).catch(() => null),
          getDocs(collection(db, 'paymentMethods')).catch(() => null),
          getDoc(doc(db, 'settings', 'coupons')).catch(() => null),
          getDoc(doc(db, 'courses', courseId)).catch(() => null)
        ]);
        
        const courseData = courseSnap?.exists() ? courseSnap.data() : null;"""

pattern = re.compile(r"        // Executa todas as buscas em PARALELO para velocidade máxima.*?getDocs\(collection\(db, 'paymentMethods'\)\)\.catch\(\(\) => null\),\n          getDoc\(doc\(db, 'settings', 'coupons'\)\)\.catch\(\(\) => null\)\n        \]\);", re.DOTALL)
content = pattern.sub(replacement, content)

with open('src/components/CourseCheckout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated CourseCheckout to fetch courseData")
