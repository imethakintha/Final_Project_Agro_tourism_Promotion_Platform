import { Router, raw } from 'express';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
import Payment, { find } from '../models/Payment';
import { findById, findByIdAndUpdate } from '../models/Booking';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Create payment intent
router.post('/create-intent', authMiddleware, async (req, res) => {
  try {
    const { bookingId, currency = 'usd' } = req.body;

    const booking = await findById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(booking.pricing.total * 100), // Convert to cents
      currency,
      metadata: {
        bookingId: booking._id.toString(),
        userId: req.user._id.toString()
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount: booking.pricing.total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook for payment confirmation
router.post('/webhook', raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const { bookingId, userId } = paymentIntent.metadata;
      
      // Get booking to find the farm
      const booking = await findById(bookingId).populate('farm');
      if (!booking) {
          console.error(`Webhook error: Booking ${bookingId} not found.`);
          return res.status(400).send(`Webhook Error: Booking not found`);
      }

      const totalAmount = paymentIntent.amount / 100;
      const commissionRate = 0.10; // 10% commission rate
      const commissionAmount = totalAmount * commissionRate;
      const payoutAmount = totalAmount - commissionAmount;

      // Create payment record
      const payment = new Payment({
        user: userId,
        booking: bookingId,
        farm: booking.farm._id,
        amount: {
            total: totalAmount,
            currency: paymentIntent.currency,
        },
        method: 'stripe',
        metadata: {
            paymentIntentId: paymentIntent.id,
        },
        status: 'completed',
        // NEW: Save commission and payout info (FR-063, FR-064)
        commission: {
            rate: commissionRate,
            amount: commissionAmount,
            status: 'calculated'
        },
        payout: {
            amount: payoutAmount,
            status: 'pending', // To be processed by a cron job
            scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Payout in 7 days
        }
      });
      await payment.save();

      // Update booking status
      await findByIdAndUpdate(bookingId, {
        payment: {
            status: 'completed',
            paymentIntentId: paymentIntent.id,
            paidAmount: totalAmount,
            paymentDate: new Date()
        },
        status: 'confirmed'
      });
      
      // Update farm statistics with revenue
      await Farm.findByIdAndUpdate(booking.farm._id, {
          $inc: {
              'statistics.totalBookings': 1,
              'statistics.totalRevenue': totalAmount
          }
      });
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// Get payment history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const payments = await find({ user: req.user._id })
      .populate('booking', 'confirmationCode farm')
      .populate('booking.farm', 'basicInfo')
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;