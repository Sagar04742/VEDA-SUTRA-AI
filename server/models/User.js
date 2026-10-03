import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

// Never leak the hash in JSON responses.
userSchema.set('toJSON', {
  transform: (_doc, ret) => ({ id: ret._id, name: ret.name, email: ret.email, createdAt: ret.createdAt }),
});

export default mongoose.model('User', userSchema);
