import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Chat, { MAX_MESSAGES_PER_CHAT } from '../models/Chat.js';
import Image from '../models/Image.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { HttpError, asyncHandler } from '../utils/httpError.js';
import { buildConversation } from '../utils/history.js';
import { decodeImages, MAX_IMAGES_PER_MESSAGE } from '../utils/images.js';
import { openSse } from '../utils/sse.js';
import { describeAiError } from '../services/gemini.js';
import { attachImages } from '../services/attachments.js';

const imageSchema = z.object({ mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), data: z.string().min(16) });
const messageSchema = z
  .object({
    content: z.string().trim().max(4000, 'Message is too long (max 4000 characters)').default(''),
    images: z.array(imageSchema).max(MAX_IMAGES_PER_MESSAGE, `You can attach up to ${MAX_IMAGES_PER_MESSAGE} images`).default([]),
    webSearch: z.boolean().default(false),
    deepExplain: z.boolean().default(false),
  })
  .refine((b) => b.content || b.images.length, { message: 'Write a message or attach an image' });
const renameSchema = z.object({ title: z.string().trim().min(1, 'Title is required').max(80, 'Title is too long') });

const summary = (c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, createdAt: c.createdAt });
const publicMessage = (m) => ({
  id: String(m._id),
  role: m.role,
  content: m.content,
  images: (m.images ?? []).map((i) => ({ id: String(i.imageId), mimeType: i.mimeType })),
  solver: m.solver ?? [],
  sources: m.sources ?? [],
  createdAt: m.createdAt,
});

// ai = { configError, streamChat, generateTitle } (injected so tests can fake it).
export function chatRoutes(ai) {
  const router = Router();
  router.use(requireAuth, chatLimiter);
  const answering = new Set(); // chats that are in the middle of an answer

  // Ownership check on every request: a chat is only found if it belongs to the logged-in user.
  // Others' chats and malformed ids both look like "not found".
  async function findOwned(req) {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Chat not found');
    const chat = await Chat.findOne({ _id: id, userId: req.user._id });
    if (!chat) throw new HttpError(404, 'Chat not found');
    return chat;
  }

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const chats = await Chat.find({ userId: req.user._id }).select('title createdAt updatedAt').sort({ updatedAt: -1 }).limit(200);
      res.json({ chats: chats.map(summary) });
    })
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const chat = await Chat.create({ userId: req.user._id });
      res.status(201).json({ chat: summary(chat) });
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const chat = await findOwned(req);
      res.json({ chat: { ...summary(chat), messages: chat.messages.map(publicMessage) } });
    })
  );

  router.patch(
    '/:id',
    validate(renameSchema),
    asyncHandler(async (req, res) => {
      const chat = await findOwned(req);
      // timestamps:false so renaming does not move the chat to the top of the list.
      await Chat.updateOne({ _id: chat._id }, { $set: { title: req.body.title } }, { timestamps: false });
      res.json({ chat: { ...summary(chat), title: req.body.title } });
    })
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const chat = await findOwned(req);
      await Promise.all([Chat.deleteOne({ _id: chat._id }), Image.deleteMany({ chatId: chat._id })]);
      res.json({ ok: true });
    })
  );

  // A picture attached to one of this user's chats.
  router.get(
    '/:id/images/:imageId',
    asyncHandler(async (req, res) => {
      const chat = await findOwned(req);
      if (!mongoose.isValidObjectId(req.params.imageId)) throw new HttpError(404, 'Image not found');
      const image = await Image.findOne({ _id: req.params.imageId, chatId: chat._id, userId: req.user._id });
      if (!image) throw new HttpError(404, 'Image not found');
      res.set({ 'Content-Type': image.mimeType, 'Cache-Control': 'private, max-age=86400' }).send(image.data);
    })
  );

  // Send a message and stream the answer as Server-Sent Events.
  // Events: start, token, solver, notice, title, done, error.
  router.post(
    '/:id/messages',
    validate(messageSchema),
    asyncHandler(async (req, res) => {
      const chat = await findOwned(req);
      const problem = ai.configError();
      if (problem) throw new HttpError(503, problem);
      if (chat.messages.length >= MAX_MESSAGES_PER_CHAT) throw new HttpError(400, 'This chat has reached its length limit. Please start a new chat.');
      const chatKey = String(chat._id);
      if (answering.has(chatKey)) throw new HttpError(409, 'Still answering your previous message in this chat. Please wait a moment.');

      const { content, images, webSearch, deepExplain } = req.body;
      const decoded = decodeImages(images); // validates type, size and file signature
      const isFirstMessage = chat.messages.length === 0;
      const prior = chat.messages.map((m) => ({ role: m.role, content: m.content, imageIds: (m.images ?? []).map((i) => i.imageId) }));
      const previousUserMessages = prior.filter((m) => m.role === 'user' && m.content).map((m) => m.content);

      answering.add(chatKey);
      try {
        // Save the pictures and the user's message first so they are never lost.
        // History comes from the DB, never from the client.
        const imageDocs = decoded.length
          ? await Image.insertMany(decoded.map((d) => ({ chatId: chat._id, userId: req.user._id, mimeType: d.mimeType, data: d.buffer })))
          : [];
        const userMsg = {
          _id: new mongoose.Types.ObjectId(),
          role: 'user',
          content,
          ...(imageDocs.length ? { images: imageDocs.map((d) => ({ imageId: d._id, mimeType: d.mimeType })) } : {}),
          createdAt: new Date(),
        };
        await Chat.updateOne({ _id: chat._id }, { $push: { messages: userMsg } });
        const turns = buildConversation(prior, content, env.historyLimit, imageDocs.map((d) => d._id));
        const messages = await attachImages(turns, req.user._id);
        const titleSource = content || 'Image question';

        const sse = openSse(res);
        const ac = new AbortController();
        let finished = false;
        res.on('close', () => {
          if (!finished) ac.abort(); // "Stop generating" (or a dropped connection) aborts the model call
        });

        try {
          sse.send('start', { userMessageId: String(userMsg._id) });

          // Title runs in parallel and never blocks or breaks the answer (generateTitle cannot throw).
          const titleTask = isFirstMessage
            ? ai.generateTitle(titleSource).then(async (title) => {
                await Chat.updateOne({ _id: chat._id }, { $set: { title } }, { timestamps: false });
                sse.send('title', { title });
              })
            : Promise.resolve();
          const titleDone = titleTask.catch((e) => console.error('Saving title failed:', e.message));

          let result;
          try {
            result = await ai.streamChat({
              messages,
              signal: ac.signal,
              options: { webSearch, deepExplain },
              toolContext: { previousUserMessages },
              onToken: (t) => sse.send('token', { text: t }),
              onSolver: (s) => sse.send('solver', s),
              onNotice: (message) => sse.send('notice', { message }),
            });
          } catch (err) {
            if (!ac.signal.aborted) {
              console.error('Model call failed:', err);
              // Drop the unanswered user message so the client's Retry does not create a duplicate.
              await Chat.updateOne({ _id: chat._id }, { $pull: { messages: { _id: userMsg._id } } }, { timestamps: false }).catch(() => {});
              if (imageDocs.length) await Image.deleteMany({ _id: { $in: imageDocs.map((d) => d._id) } }).catch(() => {});
              sse.send('error', describeAiError(err));
              await titleDone;
              finished = true;
              sse.end();
              return;
            }
            result = { text: '', solver: [], sources: [], aborted: true };
          }

          // Save the full answer, or the partial text if the user stopped it.
          let saved = null;
          if (result.text.trim() || result.solver.length) {
            saved = {
              _id: new mongoose.Types.ObjectId(),
              role: 'assistant',
              content: result.text,
              solver: result.solver,
              ...(result.sources?.length ? { sources: result.sources } : {}),
              createdAt: new Date(),
            };
            await Chat.updateOne({ _id: chat._id }, { $push: { messages: saved } });
          }

          await titleDone; // make sure the live title event goes out before we finish
          finished = true;
          sse.send('done', { aborted: result.aborted, message: saved ? publicMessage(saved) : null });
          sse.end();
        } catch (err) {
          // Anything unexpected after the stream opened becomes an SSE error event (headers are already sent).
          console.error('Chat stream failed:', err);
          sse.send('error', { message: 'Something went wrong. Please try again.', code: 'server_error' });
          finished = true;
          sse.end();
        }
      } finally {
        answering.delete(chatKey);
      }
    })
  );

  return router;
}
