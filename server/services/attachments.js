import Image from '../models/Image.js';
import { MAX_HISTORY_IMAGES } from '../utils/images.js';

// Turn imageIds on conversation turns into real pictures for the model.
// Only the most recent MAX_HISTORY_IMAGES pictures are sent, to keep requests small and cheap.
export async function attachImages(turns, userId) {
  const wanted = turns.flatMap((t) => t.imageIds ?? []).slice(-MAX_HISTORY_IMAGES).map(String);
  const docs = wanted.length ? await Image.find({ _id: { $in: wanted }, userId }) : [];
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  return turns.map(({ imageIds, ...turn }) => {
    const images = (imageIds ?? [])
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((d) => ({ mimeType: d.mimeType, data: d.data.toString('base64') }));
    return images.length ? { ...turn, images } : turn;
  });
}
