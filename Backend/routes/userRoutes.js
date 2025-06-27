import { Router } from 'express';
import { sign } from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { createTransporter } from 'nodemailer';
import User from '../models/User';
import { authMiddleware, roleMiddleware } from '../middleware/authMiddleware';
import { userValidation, validateRequest } from '../middleware/validationMiddleware';
import { single } from '../middleware/uploadMiddleware';
import passport from 'passport';

const router = Router();

// Email configuration
const transporter = createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// User Registration
router.post('/register', userValidation.register, validateRequest, async (req, res) => {
  try {
    const { email, password, role, profile } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create email verification token
    const emailToken = randomBytes(32).toString('hex');

    // Create new user
    const user = new User({
      email,
      password,
      role,
      profile,
      verification: { emailToken }
    });

    await user.save();

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${emailToken}`;
    await transporter.sendMail({
      to: email,
      subject: 'Verify Your Email - Agro Tourism Platform',
      html: `
        <h2>Welcome to Agro Tourism Platform!</h2>
        <p>Please click the link below to verify your email:</p>
        <a href="${verificationUrl}">Verify Email</a>
      `
    });

    res.status(201).json({
      message: 'User registered successfully. Please check your email for verification.',
      userId: user._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User Login
router.post('/login', userValidation.login, validateRequest, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is locked
    if (user.security.lockUntil && user.security.lockUntil > Date.now()) {
      return res.status(423).json({ error: 'Account temporarily locked. Try again later.' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Increment login attempts
      user.security.loginAttempts += 1;
      if (user.security.loginAttempts >= 5) {
        user.security.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
      }
      await user.save();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset login attempts on successful login
    user.security.loginAttempts = 0;
    user.security.lockUntil = undefined;
    user.security.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        profile: user.profile,
        verification: user.verification
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Email Verification
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({ 'verification.emailToken': token });
    if (!user) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    user.verification.email = true;
    user.verification.emailToken = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get User Profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update User Profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload Avatar
router.post('/avatar', authMiddleware, single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const avatarUrl = `/uploads/${req.user.role}/${req.file.filename}`;
    
    await User.findByIdAndUpdate(req.user._id, {
      'profile.avatar': avatarUrl,
      updatedAt: new Date()
    });

    res.json({ avatarUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Password Reset Request
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    user.verification.passwordResetToken = resetToken;
    user.verification.passwordResetExpiry = resetTokenExpiry;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await transporter.sendMail({
      to: email,
      subject: 'Password Reset - Agro Tourism Platform',
      html: `
        <h2>Password Reset Request</h2>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
      `
    });

    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Password Reset
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      'verification.passwordResetToken': token,
      'verification.passwordResetExpiry': { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.verification.passwordResetToken = undefined;
    user.verification.passwordResetExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Recommendation Route (FR-041) ---
const Booking = require('../models/Booking');

router.get('/recommendations/farms', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Find farms the current user has booked
    const userBookings = await Booking.find({ user: userId }).select('farm -_id');
    const userBookedFarmIds = userBookings.map(b => b.farm);

    if (userBookedFarmIds.length === 0) {
      // If user has no bookings, maybe return top-rated farms
      const topFarms = await Farm.find({ status: 'approved' }).sort({ 'statistics.averageRating': -1 }).limit(5);
      return res.json(topFarms);
    }

    // 2. Find other users who also booked these farms
    const similarUsersBookings = await Booking.find({ farm: { $in: userBookedFarmIds }, user: { $ne: userId } }).distinct('user');

    if (similarUsersBookings.length === 0) {
        return res.json([]);
    }

    // 3. Find farms booked by these similar users, which the current user has NOT booked
    const recommendedFarms = await Booking.aggregate([
      // Match bookings from similar users, excluding farms the current user already booked
      { $match: { user: { $in: similarUsersBookings }, farm: { $nin: userBookedFarmIds } } },
      // Group by farm to count how many similar users booked it
      { $group: { _id: '$farm', recommendationScore: { $sum: 1 } } },
      // Sort by the score to get the most popular ones
      { $sort: { recommendationScore: -1 } },
      { $limit: 10 },
      // Populate farm details
      { $lookup: { from: 'farms', localField: '_id', foreignField: '_id', as: 'farmDetails' } },
      { $unwind: '$farmDetails' },
      { $replaceRoot: { newRoot: '$farmDetails' } }
    ]);

    res.json(recommendedFarms);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// Callback route for Google to redirect to
router.get('/auth/google/callback', passport.authenticate('google'), (req, res) => {
  // Successful authentication, redirect to frontend.
  res.redirect(process.env.FRONTEND_URL + '/dashboard');
});

// Check auth status
router.get('/auth/status', (req, res) => {
    if (req.user) {
        res.status(200).json({
            authenticated: true,
            user: {
                id: req.user._id,
                email: req.user.email,
                role: req.user.role,
                profile: req.user.profile,
            }
        });
    } else {
        res.status(200).json({ authenticated: false });
    }
});

// Auth logout
router.get('/auth/logout', (req, res) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect(process.env.FRONTEND_URL);
    });
});

export default router;