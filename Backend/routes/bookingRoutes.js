import { Router } from 'express';
import { randomBytes } from 'crypto';
import Booking, { find, findOne, findById, findByIdAndUpdate } from '../models/Booking';
import { findById as _findById } from '../models/Activity';
import Farm from '../models/Farm';
import { findById as __findById } from '../models/user';
import { authMiddleware, roleMiddleware } from '../middleware/authMiddleware';
import { createTransporter } from 'nodemailer';
import { google } from 'googleapis';
import util from 'util';

const router = Router();

// Email configuration
const transporter = createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Create booking (continuation)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      farm: farmId,
      activities,
      contactInfo,
      groupDetails,
      specialRequests
    } = req.body;

    const farm = await Farm.findOne({ _id: farmId, status: 'approved', isActive: true });

    if (!farm) {
      return res.status(404).json({ error: 'Farm not found or is not currently accepting bookings.' });
    }

    // Validate activities and calculate pricing
    let subtotal = 0;
    const processedActivities = [];

    for (let activityData of activities) {
      const activity = await _findById(activityData.activity);
      if (!activity) {
        return res.status(404).json({ error: `Activity ${activityData.activity} not found` });
      }

      // Check availability
      const requestedDate = new Date(activityData.date);
      const isBlackedOut = activity.schedule.blackoutDates.some(blackoutDate => 
        blackoutDate.toDateString() === requestedDate.toDateString()
      );

      if (isBlackedOut) {
        return res.status(400).json({ error: `Activity ${activity.basicInfo.name} not available on ${activityData.date}` });
      }

      // Calculate pricing
      const { adults = 1, children = 0, seniors = 0 } = activityData.participants;
      const totalParticipants = adults + children + seniors;

      if (totalParticipants > activity.requirements.maximumParticipants) {
        return res.status(400).json({ 
          error: `Too many participants for ${activity.basicInfo.name}. Maximum: ${activity.requirements.maximumParticipants}` 
        });
      }

      const activityTotal = 
        (adults * activity.pricing.basePrice.adult) +
        (children * (activity.pricing.basePrice.child || activity.pricing.basePrice.adult * 0.7)) +
        (seniors * (activity.pricing.basePrice.senior || activity.pricing.basePrice.adult * 0.8));

      processedActivities.push({
        ...activityData,
        pricing: {
          basePrice: activityTotal,
          discounts: 0,
          taxes: activityTotal * 0.12, // 12% tax
          total: activityTotal * 1.12
        }
      });

      subtotal += activityTotal;
    }

    const taxes = subtotal * 0.12;
    const total = subtotal + taxes;

    // Generate confirmation code
    const confirmationCode = randomBytes(6).toString('hex').toUpperCase();

    // Create booking
    const booking = new Booking({
      user: req.user._id,
      farm: farmId,
      activities: processedActivities,
      contactInfo,
      groupDetails,
      specialRequests,
      pricing: {
        subtotal,
        taxes,
        total
      },
      confirmation: {
        code: confirmationCode,
        sentAt: new Date()
      },
      status: 'pending'
    });

    await booking.save();
    await booking.populate(['user', 'farm']);

    // Send confirmation email
    await transporter.sendMail({
      to: req.user.email,
      subject: `Booking Confirmation - ${booking.confirmation.code}`,
      html: `
        <h2>Booking Confirmation</h2>
        <p>Dear ${req.user.profile.firstName},</p>
        <p>Your booking has been confirmed!</p>
        <p><strong>Confirmation Code:</strong> ${confirmation.code}</p>
        <p><strong>Farm:</strong> ${booking.farm.basicInfo.name}</p>
        <p><strong>Total Amount:</strong> $${total.toFixed(2)}</p>
        <p>We'll contact you soon with further details.</p>
      `
    });

    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user bookings
router.get('/my-bookings', authMiddleware, async (req, res) => {
  try {
    const bookings = await find({ user: req.user._id })
      .populate('farm', 'basicInfo location media')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get booking by confirmation code
router.get('/confirmation/:code', async (req, res) => {
  try {
    const booking = await Booking.findOne({ 'confirmation.code': req.params.code })
      .populate('user', 'profile email')
      .populate('farm', 'basicInfo location contact');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update booking status (farmers only)
router.put('/:id/status', authMiddleware, roleMiddleware(['farmer']), async (req, res) => {
  try {
    const { status, reason } = req.body;
    
    const booking = await findById(req.params.id).populate('farm');
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.farm.farmer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    booking.status = status;
    if (reason) booking.statusHistory.push({ status, reason, date: new Date() });
    await booking.save();

    // Send status update email
    const user = await __findById(booking.user);
    await transporter.sendMail({
      to: user.email,
      subject: `Booking Status Update - ${booking.confirmation.code}`,
      html: `
        <h2>Booking Status Updated</h2>
        <p>Your booking ${booking.confirmation.code} status has been updated to: <strong>${status}</strong></p>
        ${reason ? `<p>Reason: ${reason}</p>` : ''}
      `
    });

    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel booking
router.put('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const booking = await findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking already cancelled' });
    }

    booking.status = 'cancelled';
    booking.cancellation = {
        reason: reason,
        cancelledBy: 'user',
        cancelledAt: new Date()
    };
    await booking.save();

    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { activities, contactInfo, groupDetails, specialRequests } = req.body;
    
    const booking = await findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check ownership and status
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied: You do not own this booking.' });
    }
    if (booking.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending bookings can be modified.' });
    }

    // You might want to re-validate activities and recalculate pricing here
    // For simplicity, this example just updates the provided fields.
    // A full implementation should repeat the pricing logic from the create route.

    const updates = {
        contactInfo,
        groupDetails,
        specialRequests,
        updatedAt: new Date()
    };
    
    if (activities) {
        // Full implementation would re-process activities and pricing like in the POST '/' route
        // For now, we will assume the frontend sends the correct data structure
        updates.activities = activities;
    }

    const updatedBooking = await findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true }
    );

    res.json(updatedBooking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/add-to-google-calendar', authMiddleware, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('farm').populate('activities.activity');
        if (!booking || booking.user.toString() !== req.user._id.toString()) {
            return res.status(404).json({ error: 'Booking not found or access denied.' });
        }

        const user = await User.findById(req.user._id);
        if (!user.socialLogins.googleRefreshToken) {
            return res.status(400).json({ error: 'User has not linked their Google account or refresh token is missing.' });
        }

        // 1. Setup Google OAuth2 Client
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.FRONTEND_URL // Your redirect uri
        );

        // 2. Set the refresh token to get a new access token
        oauth2Client.setCredentials({
            refresh_token: user.socialLogins.googleRefreshToken
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const insertEvent = util.promisify(calendar.events.insert).bind(calendar.events);

        // 3. Create the calendar event details from booking
        const firstActivity = booking.activities[0];
        const eventStartTime = new Date(firstActivity.date);
        const eventEndTime = new Date(eventStartTime.getTime() + 2 * 60 * 60 * 1000); // Assume 2 hour duration

        const event = {
            summary: `Agro-Tour: ${booking.farm.basicInfo.name}`,
            location: `${booking.farm.location.address.city}, Sri Lanka`,
            description: `Your booking for the activity: ${firstActivity.activity.basicInfo.name}. \nConfirmation Code: ${booking.confirmation.code}`,
            start: {
                dateTime: eventStartTime.toISOString(),
                timeZone: 'Asia/Colombo',
            },
            end: {
                dateTime: eventEndTime.toISOString(),
                timeZone: 'Asia/Colombo',
            },
        };

        // 4. Insert the event into the user's primary calendar
        await insertEvent({
            calendarId: 'primary',
            resource: event,
        });

        res.json({ message: 'Event successfully added to your Google Calendar!' });

    } catch (error) {
        console.error('Google Calendar Error:', error.message);
        res.status(500).json({ error: 'Failed to add event to Google Calendar.' });
    }
});

export default router;