import { HttpError } from './httpError.js';

export const MAX_IMAGES_PER_MESSAGE = 3;
export const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
export const MAX_HISTORY_IMAGES = 4; // how many recent images are re-sent to the model with later questions

// The first bytes of each allowed format, so a file cannot just claim to be an image.
const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG',
  'image/webp': (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};

// Validate base64 images from the request and return [{ mimeType, buffer }].
export function decodeImages(images) {
  return images.map((img, i) => {
    const label = `Image ${i + 1}`;
    const b64 = img.data.replace(/^data:[^;]+;base64,/, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new HttpError(400, `${label} is not valid image data`);
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError(413, `${label} is too large (max ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(1)} MB)`);
    if (buffer.length < 12 || !SIGNATURES[img.mimeType](buffer)) throw new HttpError(400, `${label} is not a valid ${img.mimeType.split('/')[1].toUpperCase()} file`);
    return { mimeType: img.mimeType, buffer };
  });
}
