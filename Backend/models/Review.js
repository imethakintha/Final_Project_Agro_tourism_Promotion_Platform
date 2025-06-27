import { Schema, model } from 'mongoose';

const reviewSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  farm: {
    type: Schema.Types.ObjectId,
    ref: 'Farm',
    required: true
  },
  activity: {
    type: Schema.Types.ObjectId,
    ref: 'Activity'
  },
  booking: {
    type: Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  ratings: {
    overall: { type: Number, min: 1, max: 5, required: true },
    experience: { type: Number, min: 1, max: 5 },
    value: { type: Number, min: 1, max: 5 },
    hospitality: { type: Number, min: 1, max: 5 },
    facilities: { type: Number, min: 1, max: 5 },
    location: { type: Number, min: 1, max: 5 }
  },
  content: {
    title: String,
    review: { type: String, required: true },
    pros: [String],
    cons: [String],
    tips: [String]
  },
  media: {
    photos: [{
      url: String,
      caption: String
    }],
    videos: [{
      url: String,
      title: String
    }]
  },
  visitInfo: {
    visitDate: Date,
    visitDuration: String,
    groupSize: Number,
    travelType: String
  },
  moderation: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'flagged'],
      default: 'pending'
    },
    moderatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    moderatedAt: Date,
    reason: String
  },
  response: {
    content: String,
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    respondedAt: Date
  },
  helpfulness: {
    helpful: { type: Number, default: 0 },
    notHelpful: { type: Number, default: 0 },
    voters: [{ type: Schema.Types.ObjectId, ref: 'User' }]
  },
  isVerified: { type: Boolean, default: false },
  language: { type: String, default: 'en' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

reviewSchema.index({ farm: 1, 'moderation.status': 1 });
reviewSchema.index({ user: 1, createdAt: -1 });

export default model('Review', reviewSchema);
