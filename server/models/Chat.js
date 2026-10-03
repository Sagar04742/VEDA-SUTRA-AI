import mongoose from 'mongoose';

// Results of solver tool calls are kept on the assistant message so the StepViewer survives a reload.
const solverSchema = new mongoose.Schema(
  { tool: String, args: mongoose.Schema.Types.Mixed, method: String, answer: String, steps: [String] },
  { _id: false }
);

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, default: '' },
  // Pictures the user attached (the bytes live in the Image collection).
  images: {
    type: [new mongoose.Schema({ imageId: mongoose.Schema.Types.ObjectId, mimeType: String }, { _id: false })],
    default: undefined,
  },
  solver: { type: [solverSchema], default: undefined },
  // Web pages used when "Web search" was on.
  sources: { type: [new mongoose.Schema({ title: String, uri: String }, { _id: false })], default: undefined },
  createdAt: { type: Date, default: Date.now },
});

const chatSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'New chat', trim: true, maxlength: 120 },
    messages: [messageSchema],
  },
  { timestamps: true }
);

chatSchema.index({ userId: 1, updatedAt: -1 });

export const DEFAULT_TITLE = 'New chat';
export const MAX_MESSAGES_PER_CHAT = 400;
export default mongoose.model('Chat', chatSchema);
