import { Router } from 'express';
import Activity, { find, countDocuments, findById, findByIdAndUpdate, findByIdAndDelete } from '../models/Activity';
import { findOne, find as _find } from '../models/Farm';
import { authMiddleware, roleMiddleware } from '../middleware/authMiddleware';
import { activityValidation, validateRequest } from '../middleware/validationMiddleware';
import { getConversionRate } from '../utils/currencyConverter';

const router = Router();

// Get activities by farm
router.get('/farm/:farmId', async (req, res) => {
  try {
    const activities = await find({
      farm: req.params.farmId,
      isActive: true
    }).sort({ createdAt: -1 });

    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search activities
router.get('/search', async (req, res) => {
  try {
    const {
      category,
      difficulty,
      minPrice,
      maxPrice,
      date,
      participants,
      page = 1,
      limit = 12
    } = req.query;

    let query = { isActive: true };

    if (category) query['basicInfo.category'] = category;
    if (difficulty) query['basicInfo.difficulty'] = difficulty;
    
    if (minPrice || maxPrice) {
      query['pricing.basePrice.adult'] = {};
      if (minPrice) query['pricing.basePrice.adult'].$gte = parseFloat(minPrice);
      if (maxPrice) query['pricing.basePrice.adult'].$lte = parseFloat(maxPrice);
    }
    if (date) {
        const requestedDate = new Date(date);
        // Ensure the activity is not in a blackout period on that day
        query['schedule.blackoutDates'] = { $not: { $elemMatch: { $eq: requestedDate } } };
    }

    // Filter by number of participants if provided
    if (participants && !isNaN(parseInt(participants))) {
        const numParticipants = parseInt(participants);
        // Find activities where:
        // 1. The minimum required participants is less than or equal to the user's group size.
        // 2. The maximum allowed participants is greater than or equal to the user's group size.
        query['requirements.minimumParticipants'] = { $lte: numParticipants };
        query['requirements.maximumParticipants'] = { $gte: numParticipants };
    }

    const skip = (page - 1) * limit;

    const activities = await find(query)
      .populate('farm', 'basicInfo location')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await countDocuments(query);

    res.json({
      activities,
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

// Get single activity
router.get('/:id', async (req, res) => {
  try {
    const { currency } = req.query;
    const activity = await Activity.findById(req.params.id)
      .populate('farm', 'basicInfo location contact farmer')
      .populate('farm.farmer', 'profile')
      .lean();

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    if (currency && activity.pricing.currency !== currency) {
        const rate = await getConversionRate(activity.pricing.currency, currency);
        activity.pricing.convertedPrice = {
            adult: activity.pricing.basePrice.adult * rate,
            child: activity.pricing.basePrice.child * rate,
            senior: activity.pricing.basePrice.senior * rate,
            currency: currency
        };
    }

    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create activity (farmers only)
router.post('/', 
  authMiddleware, 
  roleMiddleware(['farmer']),
  activityValidation.create,
  validateRequest,
  async (req, res) => {
    try {
      // Verify farm ownership
      const farm = await findOne({
        _id: req.body.farm,
        farmer: req.user._id
      });

      if (!farm) {
        return res.status(404).json({ error: 'Farm not found or access denied' });
      }

      const activity = new Activity(req.body);
      await activity.save();

      res.status(201).json(activity);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Update activity
router.put('/:id', 
  authMiddleware, 
  roleMiddleware(['farmer']),
  async (req, res) => {
    try {
      const activity = await findById(req.params.id).populate('farm');
      
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      if (activity.farm.farmer.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updatedActivity = await findByIdAndUpdate(
        req.params.id,
        { $set: req.body, updatedAt: new Date() },
        { new: true, runValidators: true }
      );

      res.json(updatedActivity);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Check activity availability
router.post('/:id/check-availability', async (req, res) => {
  try {
    const { date, participants } = req.body;
    const activity = await findById(req.params.id);

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Check if date is in blackout dates
    const requestedDate = new Date(date);
    const isBlackedOut = activity.schedule.blackoutDates.some(blackoutDate => 
      blackoutDate.toDateString() === requestedDate.toDateString()
    );

    if (isBlackedOut) {
      return res.json({ available: false, reason: 'Date not available' });
    }

    // Check participant limits
    if (participants > activity.requirements.maximumParticipants) {
      return res.json({ 
        available: false, 
        reason: `Maximum ${activity.requirements.maximumParticipants} participants allowed` 
      });
    }

    if (participants < activity.requirements.minimumParticipants) {
      return res.json({ 
        available: false, 
        reason: `Minimum ${activity.requirements.minimumParticipants} participants required` 
      });
    }

    res.json({ available: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get farmer's activities
router.get('/farmer/my-activities', 
  authMiddleware, 
  roleMiddleware(['farmer']),
  async (req, res) => {
    try {
      const farms = await _find({ farmer: req.user._id }).select('_id');
      const farmIds = farms.map(farm => farm._id);

      const activities = await find({ farm: { $in: farmIds } })
        .populate('farm', 'basicInfo')
        .sort({ createdAt: -1 });

      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete activity
router.delete('/:id', 
  authMiddleware, 
  roleMiddleware(['farmer']),
  async (req, res) => {
    try {
      const activity = await findById(req.params.id).populate('farm');
      
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      if (activity.farm.farmer.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await findByIdAndDelete(req.params.id);
      res.json({ message: 'Activity deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;