/**
 * Compresses an uploaded image File cleanly using an HTML5 Canvas
 * so the resulting Data URL stays well below Firestore's 1 MB document limit.
 */
export async function compressCoverImageFile(
  file: File,
  maxWidth: number = 1280,
  maxHeight: number = 720,
  quality: number = 0.82
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um ficheiro de imagem válido (JPG, PNG ou WebP).');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro selecionado.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('A imagem selecionada não pôde ser carregada.'));
      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Falha ao preparar o processamento da imagem.'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
