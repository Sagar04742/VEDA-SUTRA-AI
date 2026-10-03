import mongoose from 'mongoose';

// Results of solver tool calls are kept on the assistant message so the StepViewer survives a reload.
const solverSchema = new mongoose.Schema(
  { tool: String, args: mongoose.Schema.Types.Mixed, method: String, answer: String, steps: [String] },
  { _id: false }
);

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, default: '' },
  solver: { type: [solverSchema], default: undefined },
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
export default mongoose.model('Chat', chatSchema);
