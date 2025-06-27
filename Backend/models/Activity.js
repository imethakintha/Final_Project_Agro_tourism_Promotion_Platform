import { Schema, model } from 'mongoose';

const activitySchema = new Schema({
  farm: {
    type: Schema.Types.ObjectId,
    ref: 'Farm',
    required: true
  },
  basicInfo: {
    name: { type: String, required: true },
    description: {
      en: String,
      si: String,
      ta: String
    },
    category: {
      type: String,
      enum: ['harvesting', 'planting', 'workshop', 'cultural', 'educational', 'recreational'],
      required: true
    },
    subcategory: String,
    difficulty: {
      type: String,
      enum: ['easy', 'moderate', 'hard'],
      default: 'easy'
    },
    ageRestriction: {
      minimum: Number,
      maximum: Number
    }
  },
  schedule: {
    duration: {
      value: Number,
      unit: { type: String, enum: ['minutes', 'hours', 'days'] }
    },
    availability: {
      type: String,
      enum: ['daily', 'weekly', 'seasonal', 'custom'],
      default: 'daily'
    },
    timeSlots: [{
      startTime: String,
      endTime: String,
      days: [String], // monday, tuesday, etc.
      maxParticipants: Number
    }],
    seasonalAvailability: {
      start: String, // month-day format
      end: String
    },
    blackoutDates: [Date]
  },
  pricing: {
    basePrice: {
      adult: Number,
      child: Number,
      senior: Number
    },
    currency: { type: String, default: 'USD' },
    groupDiscounts: [{
      minSize: Number,
      discount: Number // percentage
    }],
    seasonalPricing: [{
      season: String,
      multiplier: Number
    }],
    inclusions: [String],
    exclusions: [String]
  },
  requirements: {
    minimumParticipants: { type: Number, default: 1 },
    maximumParticipants: { type: Number, default: 20 },
    physicalRequirements: [String],
    equipmentProvided: [String],
    equipmentRequired: [String],
    clothing: [String],
    restrictions: [String]
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
  location: {
    meetingPoint: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    transportationIncluded: { type: Boolean, default: false }
  },
  cancellationPolicy: {
    refundable: { type: Boolean, default: true },
    cutoffHours: Number,
    refundPercentage: Number,
    terms: String
  },
  statistics: {
    totalBookings: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 }
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

activitySchema.index({ 'basicInfo.name': 'text', 'basicInfo.description.en': 'text' });

export default model('Activity', activitySchema);