import re

logic = """
      coursesSnap.forEach(async (cDoc) => {
        const cData = cDoc.data();
        if (cData.authorId === user.uid || (user.email && cData.authorEmail === user.email)) {
          await updateDoc(doc(db, 'courses', cDoc.id), {
            producerName: producerData.producerName.trim(),
            producerPhone: producerData.producerWhatsApp.trim(),
            producerBankName: producerData.producerBankName.trim(),
            producerHolderName: producerData.producerHolderName.trim(),
            producerIban: producerData.producerIban.trim(),
            producerExpressPhone: producerData.producerExpressPhone.trim(),
            authorEmail: user.email
          }).catch(() => {});
        }
      });
"""

with open('src/pages/Settings.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r"      coursesSnap\.forEach\(async \(cDoc\) => \{.*?\}\);\n", re.DOTALL)
content = pattern.sub(logic.strip('\n') + '\n', content)

with open('src/pages/Settings.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated Producer Sync")
