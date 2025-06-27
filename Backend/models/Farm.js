import { Schema, model } from 'mongoose';

const farmSchema = new Schema({
  farmer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  basicInfo: {
    name: { type: String, required: true },
    description: {
      en: String,
      si: String,
      ta: String
    },
    type: {
      type: String,
      enum: ['organic', 'conventional', 'mixed', 'livestock', 'aquaculture'],
      required: true
    },
    size: {
      value: Number,
      unit: { type: String, enum: ['acres', 'hectares', 'square_meters'] }
    },
    establishedYear: Number
  },
  location: {
    address: {
      street: String,
      city: String,
      province: String,
      postalCode: String,
      country: { type: String, default: 'Sri Lanka' }
    },
    coordinates: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true }
    },
    directions: String,
    nearbyLandmarks: [String]
  },
  contact: {
    phone: String,
    email: String,
    website: String,
    socialMedia: {
      facebook: String,
      instagram: String,
      twitter: String
    }
  },
  media: {
    photos: [{
      url: String,
      caption: String,
      isPrimary: { type: Boolean, default: false }
    }],
    videos: [{
      url: String,
      title: String,
      description: String
    }],
    virtualTour: String
  },
  facilities: {
    accommodation: {
      available: { type: Boolean, default: false },
      types: [String], // hotel, guesthouse, camping, etc.
      capacity: Number,
      amenities: [String]
    },
    dining: {
      available: { type: Boolean, default: false },
      types: [String], // restaurant, cafe, traditional, etc.
      specialties: [String]
    },
    transport: {
      parking: { type: Boolean, default: false },
      pickupService: { type: Boolean, default: false },
      publicTransport: Boolean
    },
    accessibility: {
      wheelchairAccessible: { type: Boolean, default: false },
      facilities: [String]
    },
    other: [String]
  },
  certification: {
    organic: { type: Boolean, default: false },
    fairtrade: { type: Boolean, default: false },
    other: [String]
  },
  operatingHours: {
    monday: { open: String, close: String, closed: Boolean },
    tuesday: { open: String, close: String, closed: Boolean },
    wednesday: { open: String, close: String, closed: Boolean },
    thursday: { open: String, close: String, closed: Boolean },
    friday: { open: String, close: String, closed: Boolean },
    saturday: { open: String, close: String, closed: Boolean },
    sunday: { open: String, close: String, closed: Boolean }
  },
  seasonalInfo: {
    peakSeason: { start: String, end: String },
    offSeason: { start: String, end: String },
    closedPeriods: [{ start: Date, end: Date, reason: String }]
  },
  statistics: {
    totalBookings: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 }
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'suspended'],
    default: 'draft'
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

farmSchema.index({ 'location.coordinates': '2dsphere' });
farmSchema.index({ 'basicInfo.name': 'text', 'basicInfo.description.en': 'text' });

export default model('Farm', farmSchema);