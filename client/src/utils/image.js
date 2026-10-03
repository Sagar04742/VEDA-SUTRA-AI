// Prepare a picture for sending: shrink it and re-encode as JPEG so uploads stay small and fast.
export const MAX_IMAGES = 3;
const MAX_SIDE = 1600;
const MAX_BYTES = 2.2 * 1024 * 1024; // the server limit is 2.5 MB per picture
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read the image'));
    r.readAsDataURL(blob);
  });

// Returns { mimeType, data (base64), preview (data URL) }. Throws an Error with a friendly message.
export async function prepareImage(file) {
  if (!ALLOWED.includes(file.type)) throw new Error('Please choose a JPG, PNG or WEBP image.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That image is too large. Please pick one under 25 MB.');

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); // respects phone-camera rotation
  } catch {
    throw new Error('That image could not be opened. Try another one.');
  }

  let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85 - attempt * 0.1));
    if (blob && blob.size <= MAX_BYTES) {
      const preview = await blobToDataUrl(blob);
      bitmap.close?.();
      return { mimeType: 'image/jpeg', data: preview.split(',')[1], preview };
    }
    scale *= 0.7;
  }
  throw new Error('That image is too detailed to send. Try a smaller one.');
}
