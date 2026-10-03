import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Chat from '../models/Chat.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { HttpError, asyncHandler } from '../utils/httpError.js';
import { buildConversation } from '../utils/history.js';
import { openSse } from '../utils/sse.js';
import { describeAiError } from '../services/gemini.js';

const messageSchema = z.object({ content: z.string().trim().min(1, 'Message is empty').max(4000, 'Message is too long (max 4000 characters)') });
const renameSchema = z.object({ title: z.string().trim().min(1, 'Title is required').max(80, 'Title is too long') });

const summary = (c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, createdAt: c.createdAt });
const publicMessage = (m) => ({ id: String(m._id), role: m.role, content: m.content, solver: m.solver ?? [], createdAt: m.createdAt });

// ai = { configError, streamChat, generateTitle } (injected so tests can fake it).
export function chatRoutes(ai) {
  const router = Router();
  router.use(requireAuth, chatLimiter);

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
      await Chat.deleteOne({ _id: chat._id });
      res.json({ ok: true });
    })
  );

  // Send a message and stream the answer as Server-Sent Events.
  // Events: start, token, solver, title, done, error.
  router.post(
    '/:id/messages',
    validate(messageSchema),
    asyncHandler(async (req, res) => {
      const chat = await findOwned(req);
      const problem = ai.configError();
      if (problem) throw new HttpError(503, problem);

      const text = req.body.content;
      const isFirstMessage = chat.messages.length === 0;
      const prior = chat.messages.map((m) => ({ role: m.role, content: m.content }));
      const previousUserMessages = prior.filter((m) => m.role === 'user').map((m) => m.content);

      // Save the user's message first so it is never lost. History comes from the DB, never from the client.
      const userMsg = { _id: new mongoose.Types.ObjectId(), role: 'user', content: text, createdAt: new Date() };
      await Chat.updateOne({ _id: chat._id }, { $push: { messages: userMsg } });
      const messages = buildConversation(prior, text, env.historyLimit);

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
          ? ai.generateTitle(text).then(async (title) => {
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
            toolContext: { previousUserMessages },
            onToken: (t) => sse.send('token', { text: t }),
            onSolver: (s) => sse.send('solver', s),
          });
        } catch (err) {
          if (!ac.signal.aborted) {
            console.error('Model call failed:', err);
            // Drop the unanswered user message so the client's Retry does not create a duplicate.
            await Chat.updateOne({ _id: chat._id }, { $pull: { messages: { _id: userMsg._id } } }, { timestamps: false }).catch(() => {});
            sse.send('error', { message: describeAiError(err) });
            await titleDone;
            finished = true;
            sse.end();
            return;
          }
          result = { text: '', solver: [], aborted: true };
        }

        // Save the full answer, or the partial text if the user stopped it.
        let saved = null;
        if (result.text.trim() || result.solver.length) {
          saved = { _id: new mongoose.Types.ObjectId(), role: 'assistant', content: result.text, solver: result.solver, createdAt: new Date() };
          await Chat.updateOne({ _id: chat._id }, { $push: { messages: saved } });
        }

        await titleDone; // make sure the live title event goes out before we finish
        finished = true;
        sse.send('done', { aborted: result.aborted, message: saved ? publicMessage(saved) : null });
        sse.end();
      } catch (err) {
        // Anything unexpected after the stream opened becomes an SSE error event (headers are already sent).
        console.error('Chat stream failed:', err);
        sse.send('error', { message: 'Something went wrong. Please try again.' });
        finished = true;
        sse.end();
      }
    })
  );

  return router;
}
