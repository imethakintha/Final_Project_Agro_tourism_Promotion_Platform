import { Schema, model } from 'mongoose';

const messageSchema = new Schema({
  conversation: {
    participants: [{
      user: { type: Schema.Types.ObjectId, ref: 'User' },
      role: String,
      joinedAt: { type: Date, default: Date.now }
    }],
    type: {
      type: String,
      enum: ['direct', 'booking', 'support'],
      default: 'direct'
    },
    subject: String,
    relatedBooking: { type: Schema.Types.ObjectId, ref: 'Booking' },
    relatedFarm: { type: Schema.Types.ObjectId, ref: 'Farm' }
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: { type: String, enum: ['text', 'image', 'file', 'system'], default: 'text' },
    text: String,
    media: [{
      type: String, // image, document, etc.
      url: String,
      filename: String,
      size: Number
    }],
    translation: {
      originalLanguage: String,
      translations: [{
        language: String,
        text: String
      }]
    }
  },
  status: {
    sent: { type: Boolean, default: true },
    delivered: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
    readAt: Date
  },
  metadata: {
    edited: { type: Boolean, default: false },
    editedAt: Date,
    deleted: { type: Boolean, default: false },
    deletedAt: Date,
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' }
  },
  createdAt: { type: Date, default: Date.now }
});

messageSchema.index({ 'conversation.participants.user': 1, createdAt: -1 });

export default model('Message', messageSchema);