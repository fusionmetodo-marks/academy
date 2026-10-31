import re

with open('src/services/notificationService.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add a helper function for VAPID conversion
vapid_helper = """
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
"""

content = content.replace("export const playNotificationSound = () => {", vapid_helper + "\nexport const playNotificationSound = () => {")

# Replace requestPushPermission
new_request_push = """export const requestPushPermission = async (userId?: string): Promise<boolean> => {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      try {
        // Registrar o Service Worker
        const register = await navigator.serviceWorker.register('/sw.js');
        
        // Esperar o Service Worker ficar ativo
        await navigator.serviceWorker.ready;

        // Obter a Public VAPID Key do backend
        const response = await fetch('/api/push/vapidPublicKey');
        const vapidData = await response.json();
        const convertedVapidKey = urlBase64ToUint8Array(vapidData.publicKey);

        // Inscrever para Push Notifications
        const subscription = await register.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });

        // Se o userId estiver disponível, gravar a subscrição no Firestore (pode suportar múltiplas futuramente, mas aqui substituímos/atualizamos)
        if (userId) {
          const userRef = doc(db, 'users', userId);
          // Obter os dados atuais para não sobrescrever sem querer
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const currentSubs = userData.pushSubscriptions || [];
            
            // Gravar (evitando duplicados exatos)
            const subStr = JSON.stringify(subscription);
            const isDuplicate = currentSubs.some((s: any) => JSON.stringify(s) === subStr);
            
            if (!isDuplicate) {
               await updateDoc(userRef, {
                 pushSubscriptions: [...currentSubs, JSON.parse(subStr)]
               });
            }
          }
        }

        showNativeNotification(
          'Notificações Push Ativas!',
          'O seu dispositivo está agora configurado para receber alertas reais em segundo plano.',
          '/dashboard'
        );
        return true;
      } catch (err) {
        console.error('Erro na subscrição do Service Worker / Push:', err);
        return true; // A permissão local foi dada, mas a Web Push falhou
      }
    }
    return false;
  } catch (error) {
    console.error('Erro ao pedir permissão de notificações:', error);
    return false;
  }
};"""

content = re.sub(r"export const requestPushPermission = async \(\): Promise<boolean> => \{[\s\S]*?\n\};", new_request_push, content)


# Now, update sendSystemNotification to also send via Web Push (/api/push/send)
new_send_sys_notif = """export const sendSystemNotification = async (payload: {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  targetRole?: 'admin' | 'student' | 'producer' | 'all';
  targetUserId?: string;
  metadata?: Record<string, any>;
}) => {
  try {
    const notificationData = {
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link || '/dashboard',
      targetRole: payload.targetRole || 'all',
      targetUserId: payload.targetUserId || null,
      read: false,
      metadata: payload.metadata || {},
      timestamp: Date.now(),
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, 'notifications'), notificationData);
    
    // Agora disparar as Web Push em segundo plano via Backend
    // Precisamos de recolher as subscrições dos utilizadores alvo
    const usersQuery = payload.targetUserId 
      ? query(collection(db, 'users'), where('__name__', '==', payload.targetUserId))
      : payload.targetRole === 'all'
        ? query(collection(db, 'users'))
        : query(collection(db, 'users'), where('role', '==', payload.targetRole)); // Simplificado, na prática para 'all' ou papeis complexos pode precisar de lógicas compostas
        
    const usersSnap = await getDocs(usersQuery);
    let allSubscriptions: any[] = [];
    
    usersSnap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.pushSubscriptions && Array.isArray(data.pushSubscriptions)) {
        // Extra check for complex roles (e.g., student vs admin simulation)
        if (payload.targetRole === 'admin' && (data.role !== 'admin' && data.roleType !== 'producer' && !data.email?.includes('cassaminha'))) return;
        
        allSubscriptions = [...allSubscriptions, ...data.pushSubscriptions];
      }
    });
    
    if (allSubscriptions.length > 0) {
      await fetch('/api/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscriptions: allSubscriptions,
          payload: {
            title: payload.title,
            body: payload.message,
            url: payload.link || '/dashboard'
          }
        })
      }).catch(err => console.error("Falha ao enviar push para o backend:", err));
    }

  } catch (error) {
    console.error('Erro ao registrar notificação no Firestore:', error);
  }
};"""

content = re.sub(r"export const sendSystemNotification = async \(payload: \{[\s\S]*?\}\) => \{[\s\S]*?\n\};", new_send_sys_notif, content)


with open('src/services/notificationService.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated notificationService.ts")
