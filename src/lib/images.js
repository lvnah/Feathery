// Conversion d'une image choisie sur l'ordinateur en miniature (data URL WebP), redimensionnée côté navigateur.
export function fileToDataUrl(file, { maxWidth = 128, maxHeight = 128, square = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      reject(new Error('Format non pris en charge : PNG, JPEG, WebP ou GIF.'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('Image trop lourde (10 Mo maximum).'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;
      if (square) {
        const side = Math.min(sw, sh);
        sx = (sw - side) / 2;
        sy = (sh - side) / 2;
        sw = side;
        sh = side;
      }
      const scale = Math.min(1, maxWidth / sw, maxHeight / sh);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/webp', 0.93));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de lire cette image.'));
    };
    img.src = url;
  });
}

// Bouton de choix de fichier réutilisable.
export const AVATAR_OPTS = { maxWidth: 128, maxHeight: 128, square: true };
export const ICON_OPTS = { maxWidth: 128, maxHeight: 128, square: true };
export const BANNER_OPTS = { maxWidth: 800, maxHeight: 280, square: false };
// Bannière d'espace : grande définition pour rester nette en largeur.
export const ESPACE_BANNER_OPTS = { maxWidth: 1600, maxHeight: 500, square: false };

// GIF animé : pas de redimensionnement (il perdrait l'animation). Réservé aux PLUS, poids limité.
export function readGif(file, maxBytes, isPlus) {
  return new Promise((resolve, reject) => {
    if (!isPlus) {
      reject(new Error('Les GIF animés sont réservés aux membres PLUS.'));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error(`GIF trop lourd (${Math.round(maxBytes / 1024)} Ko maximum).`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Lecture du GIF impossible.'));
    reader.readAsDataURL(file);
  });
}
// Pièce jointe d'un message : photo réduite (1280 px, WebP, léger) ; GIF gardé animé, 2 Mo maximum.
export const CHAT_IMAGE_OPTS = { maxWidth: 1280, maxHeight: 1280, square: false };
export const CHAT_GIF_MAX = 2_000_000; // octets
export async function chatImageFromFile(file) {
  if (file?.type === 'image/gif') {
    if (file.size > CHAT_GIF_MAX) throw new Error('GIF trop lourd (2 Mo maximum).');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Lecture du GIF impossible.'));
      reader.readAsDataURL(file);
    });
  }
  return fileToDataUrl(file, CHAT_IMAGE_OPTS);
}
export const GIF_MAX_AVATAR = 9_000_000; // octets du fichier
export const GIF_MAX_BANNER = 12_000_000;
