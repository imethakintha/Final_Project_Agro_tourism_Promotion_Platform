import { Router } from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/authMiddleware';
import { aggregate } from '../models/Booking';
import { find } from '../models/Farm';
import { aggregate as _aggregate } from '../models/User';
import Review from '../models/Review';
import { aggregate as __aggregate } from '../models/Payment';

const router = Router();

// All routes in this file are admin-only
router.use(authMiddleware, roleMiddleware(['admin']));

/**
 * @route   GET /api/reports/financial
 * @desc    Get financial reports (revenue, commissions, etc.)
 * @access  Private (Admin)
 */
router.get('/financial', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query;
    const match = { status: 'completed' };
    if (startDate && endDate) {
      match.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const groupFormat = {
      'day': '%Y-%m-%d',
      'month': '%Y-%m',
      'year': '%Y'
    };

    const financialStats = await _aggregate([
      { $match: match },
      {
        $group: {
          _id: { 
            $dateToString: { format: groupFormat[groupBy] || groupFormat['month'], date: '$createdAt' }
          },
          totalRevenue: { $sum: '$amount.total' },
          totalCommission: { $sum: '$commission.amount' },
          totalPayouts: { $sum: '$payout.amount' },
          transactionCount: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    res.json(financialStats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate financial report' });
  }
});

/**
 * @route   GET /api/reports/users
 * @desc    Get user registration and activity reports
 * @access  Private (Admin)
 */
router.get('/users', async (req, res) => {
  try {
    const userGrowth = await _aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          newUsers: { $sum: 1 },
          roles: { $push: '$role' }
        }
      },
      { $sort: { '_id': 1 } },
      { 
        $project: {
          _id: 0,
          month: '$_id',
          totalNewUsers: '$newUsers',
          newFarmers: { $size: { $filter: { input: '$roles', as: 'role', cond: { $eq: ['$$role', 'farmer'] } } } },
          newTourists: { $size: { $filter: { input: '$roles', as: 'role', cond: { $eq: ['$$role', 'tourist'] } } } }
        }
      }
    ]);

    res.json({ userGrowth });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate user report' });
  }
});

/**
 * @route   GET /api/reports/bookings
 * @desc    Get booking trends report
 * @access  Private (Admin)
 */
router.get('/bookings', async (req, res) => {
  try {
    const bookingTrends = await aggregate([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
    ]);

    const popularFarms = await aggregate([
        { $group: { _id: '$farm', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'farms', localField: '_id', foreignField: '_id', as: 'farmDetails' } },
        { $unwind: '$farmDetails' },
        { $project: { _id: 0, farmId: '$_id', name: '$farmDetails.basicInfo.name', bookings: '$count' } }
    ]);

    res.json({ bookingTrends, popularFarms });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate bookings report' });
  }
});


/**
 * @route   GET /api/reports/farm-performance
 * @desc    Get farm performance report
 * @access  Private (Admin)
 */
router.get('/farm-performance', async (req, res) => {
    try {
        const farmPerformance = await find({ status: 'approved' })
            .select('basicInfo.name statistics')
            .sort({ 'statistics.totalRevenue': -1 })
            .limit(20);
            
        res.json(farmPerformance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate farm performance report' });
    }
});

/**
 * @route   GET /api/reports/reviews
 * @desc    Get review and rating analysis report
 * @access  Private (Admin)
 */
router.get('/reviews', async (req, res) => {
    try {
        const reviewAnalysis = await Review.aggregate([
            {
                $facet: {
                    "statusDistribution": [
                        { $group: { _id: "$moderation.status", count: { $sum: 1 } } }
                    ],
                    "ratingDistribution": [
                        { $match: { "moderation.status": "approved" } },
                        { $group: { _id: "$ratings.overall", count: { $sum: 1 } } },
                        { $sort: { _id: -1 } }
                    ],
                    "overallStats": [
                        { $match: { "moderation.status": "approved" } },
                        { 
                            $group: { 
                                _id: null, 
                                averageRating: { $avg: "$ratings.overall" },
                                totalApprovedReviews: { $sum: 1 }
                            } 
                        }
                    ]
                }
            }
        ]);

        res.json(reviewAnalysis[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate reviews report' });
    }
});

export default router;