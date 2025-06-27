import { Schema, model } from 'mongoose';

const paymentSchema = new Schema({
  booking: {
    type: Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
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
  amount: {
    subtotal: Number,
    taxes: Number,
    fees: Number,
    total: Number,
    currency: String
  },
  method: {
    type: String,
    enum: ['stripe', 'paypal', 'bank_transfer', 'cash'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending'
  },
  transactions: [{
    type: { type: String, enum: ['payment', 'refund', 'chargeback'] },
    amount: Number,
    status: String,
    externalId: String,
    timestamp: { type: Date, default: Date.now },
    metadata: Schema.Types.Mixed
  }],
  commission: {
    rate: Number,
    amount: Number,
    status: {
      type: String,
      enum: ['pending', 'calculated', 'paid'],
      default: 'pending'
    }
  },
  payout: {
    amount: Number,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    scheduledDate: Date,
    completedDate: Date,
    externalId: String
  },
  metadata: {
    paymentIntentId: String,
    clientSecret: String,
    receiptUrl: String,
    failureReason: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ farm: 1, status: 1 });

export default model('Payment', paymentSchema);
