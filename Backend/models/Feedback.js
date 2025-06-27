import { Schema, model } from 'mongoose';

const feedbackSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    // Not required if anonymous
  },
  farm: {
    type: Schema.Types.ObjectId,
    ref: 'Farm',
    required: true
  },
  type: {
    type: String,
    enum: ['suggestion', 'complaint', 'compliment'],
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['new', 'in-progress', 'resolved'],
    default: 'new'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

feedbackSchema.index({ farm: 1, status: 1 });

const Feedback = model('Feedback', feedbackSchema);

export default Feedback;