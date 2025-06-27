import { Schema, model } from 'mongoose';

const bookingSchema = new Schema({
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
  activities: [{
    activity: {
      type: Schema.Types.ObjectId,
      ref: 'Activity',
      required: true
    },
    date: { type: Date, required: true },
    timeSlot: {
      startTime: String,
      endTime: String
    },
    participants: {
      adults: { type: Number, default: 1 },
      children: { type: Number, default: 0 },
      seniors: { type: Number, default: 0 }
    },
    pricing: {
      basePrice: Number,
      discounts: Number,
      taxes: Number,
      total: Number
    }
  }],
  contactInfo: {
    name: String,
    email: String,
    phone: String,
    emergencyContact: {
      name: String,
      phone: String,
      relationship: String
    }
  },
  groupDetails: {
    totalParticipants: Number,
    specialRequests: String,
    dietaryRestrictions: [String],
    accessibilityNeeds: [String]
  },
  pricing: {
    subtotal: Number,
    taxes: Number,
    discounts: Number,
    total: Number,
    currency: String,
    paymentMethod: String
  },
  payment: {
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
      default: 'pending'
    },
    paymentIntentId: String,
    transactionId: String,
    paidAmount: Number,
    refundAmount: Number,
    paymentDate: Date,
    refundDate: Date
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'],
    default: 'pending'
  },
  timeline: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String
  }],
  cancellation: {
    reason: String,
    cancelledBy: String,
    cancelledAt: Date,
    refundAmount: Number
  },
  confirmation: {
    code: String,
    sentAt: Date,
    reminderSent: { type: Boolean, default: false }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ farm: 1, 'activities.date': 1 });

export default model('Booking', bookingSchema);