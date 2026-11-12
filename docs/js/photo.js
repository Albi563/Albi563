// Riduce la foto a un quadrato 320×320 JPEG (~20-40 KB) così può essere
// salvata direttamente nel database gratuito, senza servizi di archiviazione.
export function resizePhoto(file, size = 320, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      // ritaglio centrato, leggermente spostato in alto (i volti stanno lì)
      const sx = (img.naturalWidth - side) / 2;
      const sy = Math.max(0, (img.naturalHeight - side) / 2 - (img.naturalHeight - side) * 0.15);
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
