import re

logic = """        const isStudent = targetRole === 'student';
        const isProducer = targetRole === 'producer';
        const isAdmin = targetRole === 'admin';
        const notifType = data.type;
        
        let shouldKeep = false;
        
        if (isStudent) {
          if (['new_lesson', 'new_module', 'new_course'].includes(notifType)) {
            shouldKeep = true;
          }
          if (data.targetUserId && data.targetUserId === userId) {
            shouldKeep = true;
          }
        } else if (isProducer) {
          if (['new_lesson', 'new_module', 'new_course'].includes(notifType)) {
            shouldKeep = true;
          }
          if (data.targetUserId && data.targetUserId === userId) {
            shouldKeep = true;
          }
        } else if (isAdmin) {
          shouldKeep = true;
          if (data.targetUserId && data.targetUserId !== userId && docRole !== 'admin') {
            shouldKeep = false;
          }
        }
        
        if (!shouldKeep) return;"""

with open('src/services/notificationService.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the forEach logic
pattern = re.compile(r"        // Filtro por papel do utilizador.*?        \} else if \(targetRole !== 'admin'\) \{.*?\n        \}", re.DOTALL)
content = pattern.sub(logic, content)

# There is a second occurrence of the filtering inside snapshot.docChanges().forEach
logic2 = """            let shouldNotify = false;
            const isStudent = targetRole === 'student';
            const isProducer = targetRole === 'producer';
            const isAdmin = targetRole === 'admin';
            const notifType = data.type;
            
            if (isStudent) {
              if (['new_lesson', 'new_module', 'new_course'].includes(notifType)) shouldNotify = true;
              if (data.targetUserId && data.targetUserId === userId) shouldNotify = true;
            } else if (isProducer) {
              if (['new_lesson', 'new_module', 'new_course'].includes(notifType)) shouldNotify = true;
              if (data.targetUserId && data.targetUserId === userId) shouldNotify = true;
            } else if (isAdmin) {
              shouldNotify = true;
              if (data.targetUserId && data.targetUserId !== userId && docRole !== 'admin') shouldNotify = false;
            }"""

pattern2 = re.compile(r"            // Verifica se o usuário atual deve receber a notificação nativa\n            let shouldNotify = true;.*?            \} else if \(targetRole !== 'admin'\) \{.*?\n            \}", re.DOTALL)
content = pattern2.sub("            // Verifica se o usuário atual deve receber a notificação nativa\n" + logic2, content)

with open('src/services/notificationService.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated Filtering Logic")
