import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { RegisteredDevice } from '../types';

export const MAX_ALLOWED_DEVICES = 2;

export const isMobileOrTabletDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // Check screen width (mobile & tablet < 1024px)
  const isSmallScreen = window.innerWidth < 1024;
  
  // Check User Agent for mobile/tablet devices
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  const isTouchDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet|Mobile/i.test(userAgent);
  
  // Also check touch points (e.g. iPad Pro in desktop mode)
  const isMaxTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  
  return isSmallScreen || isTouchDevice || isMaxTouchPoints;
};

export const isAppInstalledOrStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // Check display-mode standalone
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  
  // Check iOS standalone mode
  const isNavStandalone = (navigator as any).standalone === true;
  
  // Check referrer android app
  const isAndroidApp = document.referrer.includes('android-app://');
  
  return isStandalone || isNavStandalone || isAndroidApp;
};

export const shouldShowInstallPopup = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // 1. MUST be on Mobile or Tablet
  if (!isMobileOrTabletDevice()) {
    return false;
  }
  
  // 2. MUST NOT be already installed or running in standalone mode
  if (isAppInstalledOrStandalone()) {
    return false;
  }
  
  // 3. MUST NOT have dismissed/saved before
  if (localStorage.getItem('hasSeenInstallGuide') === 'true') {
    return false;
  }
  
  return true;
};

export const syncUserDeviceStatus = async (userId: string) => {
  if (!userId) return;
  try {
    const isMobile = isMobileOrTabletDevice();
    const isInstalled = isAppInstalledOrStandalone();
    const pushPermission = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';

    const updates: Record<string, any> = {
      isMobileDevice: isMobile,
      appInstalled: isInstalled,
      pushStatus: pushPermission,
      pushEnabled: pushPermission === 'granted',
      lastDeviceSync: new Date().toISOString()
    };

    if (isInstalled) {
      updates.installedAppAt = new Date().toISOString();
    }

    await updateDoc(doc(db, 'users', userId), updates);
  } catch (err) {
    console.warn('Erro ao sincronizar status do dispositivo:', err);
  }
};

/**
 * GERA OU RECUPERA IDENTIFICADOR PERSISTENTE DO DISPOSITIVO ATUAL
 */
export const getOrCreateDeviceId = (): string => {
  if (typeof window === 'undefined') return 'server_side_device';
  const STORAGE_KEY = 'mm_academy_device_id';
  let deviceId = localStorage.getItem(STORAGE_KEY);
  if (!deviceId) {
    deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  return deviceId;
};

/**
 * DETECTA INFORMAÇÕES AMIGÁVEIS DO DISPOSITIVO ATUAL (BROWSER & OS)
 */
export const getCurrentDeviceDetails = (): { deviceName: string; os: string; browser: string } => {
  if (typeof window === 'undefined') {
    return { deviceName: 'Dispositivo Web', os: 'Web', browser: 'Navegador' };
  }

  const ua = navigator.userAgent || '';
  let os = 'Desconhecido';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Navegador Web';
  if (/Edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Google Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/Firefox/i.test(ua)) browser = 'Mozilla Firefox';
  else if (/Opera|OPR/i.test(ua)) browser = 'Opera';

  const deviceName = `${browser} em ${os}`;
  return { deviceName, os, browser };
};

export interface DeviceValidationResult {
  allowed: boolean;
  registeredDevices: RegisteredDevice[];
  currentDeviceId: string;
  currentDeviceName: string;
}

/**
 * VERIFICA E REGISTRA O DISPOSITIVO NO FIRESTORE (LIMITE MÁXIMO DE 2 APARELHOS)
 */
export const validateAndRegisterDevice = async (
  userId: string,
  isMaster: boolean = false
): Promise<DeviceValidationResult> => {
  const currentDeviceId = getOrCreateDeviceId();
  const { deviceName, os, browser } = getCurrentDeviceDetails();

  // O Maestro (Administrador Mestre) não possui restrição de dispositivos
  if (isMaster) {
    return {
      allowed: true,
      registeredDevices: [],
      currentDeviceId,
      currentDeviceName: deviceName
    };
  }

  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return { allowed: true, registeredDevices: [], currentDeviceId, currentDeviceName: deviceName };
    }

    const userData = userSnap.data();
    const existingDevices: RegisteredDevice[] = Array.isArray(userData?.registeredDevices) 
      ? userData.registeredDevices 
      : [];

    const existingIndex = existingDevices.findIndex(d => d.deviceId === currentDeviceId);

    if (existingIndex >= 0) {
      // Dispositivo já registrado: atualiza última atividade
      existingDevices[existingIndex] = {
        ...existingDevices[existingIndex],
        deviceName,
        os,
        browser,
        lastLoginAt: new Date().toISOString()
      };

      await updateDoc(userRef, {
        registeredDevices: existingDevices,
        lastLoginAt: new Date().toISOString()
      });

      return {
        allowed: true,
        registeredDevices: existingDevices,
        currentDeviceId,
        currentDeviceName: deviceName
      };
    }

    // Se o dispositivo NÃO está na lista e já possui 2 ou mais cadastrados -> BLOQUEIO
    if (existingDevices.length >= MAX_ALLOWED_DEVICES) {
      return {
        allowed: false,
        registeredDevices: existingDevices,
        currentDeviceId,
        currentDeviceName: deviceName
      };
    }

    // Caso tenha menos de 2 dispositivos, cadastra o novo dispositivo
    const newDevice: RegisteredDevice = {
      deviceId: currentDeviceId,
      deviceName,
      os,
      browser,
      lastLoginAt: new Date().toISOString()
    };

    const updatedList = [...existingDevices, newDevice];

    await updateDoc(userRef, {
      registeredDevices: updatedList,
      lastLoginAt: new Date().toISOString()
    });

    return {
      allowed: true,
      registeredDevices: updatedList,
      currentDeviceId,
      currentDeviceName: deviceName
    };
  } catch (err) {
    console.error('Erro na validação de dispositivos:', err);
    // Em caso de falha transitória de rede, permite login defensivamente para não travar o estudante
    return {
      allowed: true,
      registeredDevices: [],
      currentDeviceId,
      currentDeviceName: deviceName
    };
  }
};

/**
 * REVOGA UM DISPOSITIVO ANTERIOR E REGISTRA O DISPOSITIVO ATUAL
 */
export const revokeDeviceAndRegisterCurrent = async (
  userId: string,
  deviceToRevokeId: string
): Promise<{ success: boolean; registeredDevices: RegisteredDevice[] }> => {
  const currentDeviceId = getOrCreateDeviceId();
  const { deviceName, os, browser } = getCurrentDeviceDetails();

  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return { success: false, registeredDevices: [] };
    }

    const userData = userSnap.data();
    const existingDevices: RegisteredDevice[] = Array.isArray(userData?.registeredDevices) 
      ? userData.registeredDevices 
      : [];

    // Remove o dispositivo selecionado para revogação
    const filtered = existingDevices.filter(d => d.deviceId !== deviceToRevokeId);

    // Adiciona o dispositivo atual
    const newDevice: RegisteredDevice = {
      deviceId: currentDeviceId,
      deviceName,
      os,
      browser,
      lastLoginAt: new Date().toISOString()
    };

    const updatedList = [...filtered, newDevice];

    await updateDoc(userRef, {
      registeredDevices: updatedList,
      lastLoginAt: new Date().toISOString()
    });

    return { success: true, registeredDevices: updatedList };
  } catch (err) {
    console.error('Erro ao revogar e registrar dispositivo:', err);
    return { success: false, registeredDevices: [] };
  }
};
