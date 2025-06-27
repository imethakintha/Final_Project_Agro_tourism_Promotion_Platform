import { Schema, model } from 'mongoose';

const notificationSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'booking_confirmed', 
      'booking_cancelled', 
      'booking_reminder', 
      'review_response', 
      'new_message', 
      'farm_approved',
      'system_alert'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  link: { // Optional link to navigate to (e.g., /bookings/id)
    type: String
  },
  readAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

notificationSchema.index({ user: 1, readAt: 1 });

const Notification = model('Notification', notificationSchema);

export default Notification;