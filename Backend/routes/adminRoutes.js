import { Router } from 'express';
import { countDocuments, find, findByIdAndUpdate } from '../models/user';
import { countDocuments as _countDocuments, findByIdAndUpdate as _findByIdAndUpdate } from '../models/Farm';
import { countDocuments as __countDocuments, aggregate } from '../models/Booking';
import { countDocuments as ___countDocuments, findByIdAndUpdate as __findByIdAndUpdate } from '../models/Review';
import { authMiddleware, roleMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Dashboard statistics
router.get('/dashboard', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const stats = await Promise.all([
      countDocuments({ role: 'farmer' }),
      countDocuments({ role: 'tourist' }),
      _countDocuments({ status: 'approved' }),
      __countDocuments({}),
      ___countDocuments({ status: 'approved' })
    ]);

    const monthlyBookings = await aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.total' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    res.json({
      totalFarmers: stats[0],
      totalTourists: stats[1],
      totalFarms: stats[2],
      totalBookings: stats[3],
      totalReviews: stats[4],
      monthlyBookings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manage users
router.get('/users', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 20, role, status } = req.query;
    
    let query = {};
    if (role) query.role = role;
    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const users = await find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await countDocuments(query);

    res.json({
      users,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id/status', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive field must be a boolean.' });
    }
    
    const user = await findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: `User status updated successfully`, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve/reject farms
router.put('/farms/:id/status', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { status, reason } = req.body;
    
    const farm = await _findByIdAndUpdate(
      req.params.id,
      { 
        status,
        'approval.date': new Date(),
        'approval.reason': reason
      },
      { new: true }
    );

    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    res.json(farm);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Moderate reviews
router.put('/reviews/:id/moderate', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { status, reason } = req.body;
    
    const review = await __findByIdAndUpdate(
      req.params.id,
      { 
        status,
        'moderation.date': new Date(),
        'moderation.reason': reason
      },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json(review);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;