/**
 * Utilitário de compressão e otimização de imagens para garantir conformidade
 * com os limites estritos de documento do Firebase Firestore (máximo 1 MiB / 1.048.576 bytes).
 */

export const compressDataUrl = (
  dataUrl: string,
  maxWidth = 1920,
  maxHeight = 1358,
  initialQuality = 0.85,
  maxSizeBytes = 650000 // 650 KB máximo garantido (muito abaixo de 1 MB)
): Promise<string> => {
  return new Promise((resolve) => {
    // Se já estiver abaixo do limite seguro e não for gigante, não precisa reprocessar se não quiser
    if (dataUrl.length < 250000 && dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let { width, height } = img;

      // Manter proporção exata redimensionando apenas se exceder maxWidth ou maxHeight
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      let quality = initialQuality;
      let output = canvas.toDataURL('image/jpeg', quality);

      // Loop de redução progressiva caso ainda ultrapasse a margem de segurança
      while (output.length > maxSizeBytes && quality > 0.35) {
        quality -= 0.08;
        output = canvas.toDataURL('image/jpeg', quality);
      }

      resolve(output);
    };

    img.onerror = () => {
      console.warn('Falha ao processar dataURL no canvas; mantendo original.');
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
};

export const compressImage = (
  file: File,
  maxWidth = 1920,
  maxHeight = 1358,
  initialQuality = 0.85,
  maxSizeBytes = 650000
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;

    reader.onload = async (e) => {
      const raw = e.target?.result as string;
      if (!raw) {
        reject(new Error('Não foi possível ler o arquivo selecionado.'));
        return;
      }

      try {
        const compressed = await compressDataUrl(raw, maxWidth, maxHeight, initialQuality, maxSizeBytes);
        resolve(compressed);
      } catch (err) {
        console.error('Erro na compressão:', err);
        resolve(raw);
      }
    };

    reader.readAsDataURL(file);
  });
};
