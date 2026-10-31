import re

with open('src/services/notificationService.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure auth is imported
if "import { auth } from '../firebase';" not in content:
    content = content.replace("import { db } from '../firebase';", "import { db, auth } from '../firebase';")

logic = """        const isStudent = targetRole === 'student';
        const isProducer = targetRole === 'producer';
        const isAdmin = targetRole === 'admin';
        const notifType = data.type;
        const currentUserEmail = auth.currentUser?.email;
        const targetEmail = data.metadata?.targetEmail;
        
        let shouldKeep = false;
        
        if (isStudent) {
          if (['new_lesson', 'new_module', 'new_course'].includes(notifType)) {
            shouldKeep = true;
          }
          if (data.targetUserId && data.targetUserId === userId) {
            shouldKeep = true;
          }
        } else if (isProducer || isAdmin) {
          // Se for admin e a notificação for para admins, mantém
          if (isAdmin && docRole === 'admin') {
            shouldKeep = true;
          }
          
          // Se for uma notificação de conteúdo para todos
          if (['new_lesson', 'new_module', 'new_course'].includes(notifType) && docRole === 'all') {
            shouldKeep = true;
          }
          
          // Se for notificação de produtor (Ex: Venda)
          if (docRole === 'producer') {
            let isMine = false;
            // Match por ID
            if (data.targetUserId && data.targetUserId === userId) isMine = true;
            // Match por Email
            if (targetEmail && currentUserEmail && targetEmail.toLowerCase() === currentUserEmail.toLowerCase()) isMine = true;
            
            // Administrador também vê as vendas dos seus próprios cursos antigos
            if (isAdmin && data.targetUserId === 'admin_default') isMine = true;
            
            if (isMine) shouldKeep = true;
          }
        }
        
        if (!shouldKeep) return;"""

pattern = re.compile(r"        const isStudent = targetRole === 'student';.*?        if \(!shouldKeep\) return;", re.DOTALL)
content = pattern.sub(logic, content)

logic2 = """            let shouldNotify = false;
            const isStudent = targetRole === 'student';
            const isProducer = targetRole === 'producer';
            const isAdmin = targetRole === 'admin';
            const notifType = data.type;
            const currentUserEmail = auth.currentUser?.email;
            const targetEmail = data.metadata?.targetEmail;
            
            if (isStudent) {
              if (['new_lesson', 'new_module', 'new_course'].includes(notifType)) shouldNotify = true;
              if (data.targetUserId && data.targetUserId === userId) shouldNotify = true;
            } else if (isProducer || isAdmin) {
              if (isAdmin && docRole === 'admin') shouldNotify = true;
              if (['new_lesson', 'new_module', 'new_course'].includes(notifType) && docRole === 'all') shouldNotify = true;
              
              if (docRole === 'producer') {
                let isMine = false;
                if (data.targetUserId && data.targetUserId === userId) isMine = true;
                if (targetEmail && currentUserEmail && targetEmail.toLowerCase() === currentUserEmail.toLowerCase()) isMine = true;
                if (isAdmin && data.targetUserId === 'admin_default') isMine = true;
                if (isMine) shouldNotify = true;
              }
            }"""

pattern2 = re.compile(r"            // Verifica se o usuário atual deve receber a notificação nativa\n            let shouldNotify = false;.*?            \}\n", re.DOTALL)
content = pattern2.sub("            // Verifica se o usuário atual deve receber a notificação nativa\n" + logic2 + "\n", content)

with open('src/services/notificationService.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Filter Logic")
