import { Router } from 'express';
import Farm, { find, countDocuments, findById, findByIdAndUpdate, findOne, aggregate, findOneAndDelete } from '../models/Farm';
import { authMiddleware, roleMiddleware } from '../middleware/authMiddleware';
import { farmValidation, validateRequest } from '../middleware/validationMiddleware';
import { array } from '../middleware/uploadMiddleware';

const router = Router();

// Get all farms with search and filtering
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      type,
      province,
      minRating,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      lat,
      lng,
      radius = 50
    } = req.query;

    let query = { status: 'approved', isActive: true };

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    // Filter by type
    if (type) {
      query['basicInfo.type'] = type;
    }

    // Filter by province
    if (province) {
      query['location.address.province'] = province;
    }

    // Filter by rating
    if (minRating) {
      query['statistics.averageRating'] = { $gte: parseFloat(minRating) };
    }

    // Location-based search
    if (lat && lng) {
      query['location.coordinates'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: radius * 1000 // Convert km to meters
        }
      };
    }

    const skip = (page - 1) * limit;
    const sortObj = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const farms = await find(query)
      .populate('farmer', 'profile.firstName profile.lastName')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await countDocuments(query);

    res.json({
      farms,
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

// Get single farm
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const farm = await findById(req.params.id)
      .populate('farmer', 'profile email contact')
      .lean();

    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    // Increment view count
    await findByIdAndUpdate(req.params.id, {
      $inc: { 'statistics.viewCount': 1 }
    });

    if (req.user) {
        const userId = req.user._id;
        // Remove farm if it exists to move it to the front, then add it
        await User.findByIdAndUpdate(userId, {
            $pull: { recentlyViewedFarms: req.params.id }
        });
        await User.findByIdAndUpdate(userId, {
            $push: { recentlyViewedFarms: { $each: [req.params.id], $position: 0, $slice: 10 } } // Keep last 10
        });
    }

    res.json(farm);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new farm (farmers only)
router.post('/', 
  authMiddleware, 
  roleMiddleware(['farmer']), 
  farmValidation.create, 
  validateRequest,
  async (req, res) => {
    try {
      const farmData = {
        ...req.body,
        farmer: req.user._id
      };

      const farm = new Farm(farmData);
      await farm.save();

      res.status(201).json(farm);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Update farm
router.put('/:id', 
  authMiddleware, 
  roleMiddleware(['farmer']),
  async (req, res) => {
    try {
      const farm = await findOne({
        _id: req.params.id,
        farmer: req.user._id
      });

      if (!farm) {
        return res.status(404).json({ error: 'Farm not found or access denied' });
      }

      const updatedFarm = await findByIdAndUpdate(
        req.params.id,
        { $set: req.body, updatedAt: new Date() },
        { new: true, runValidators: true }
      );

      res.json(updatedFarm);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Upload farm photos
router.post('/:id/photos', 
  authMiddleware, 
  roleMiddleware(['farmer']),
  array('photos', 10),
  async (req, res) => {
    try {
      const farm = await findOne({
        _id: req.params.id,
        farmer: req.user._id
      });

      if (!farm) {
        return res.status(404).json({ error: 'Farm not found or access denied' });
      }

      const photos = req.files.map(file => ({
        url: `/uploads/${req.user.role}/${file.filename}`,
        caption: req.body.caption || ''
      }));

      farm.media.photos.push(...photos);
      await farm.save();

      res.json({ photos });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.post('/:id/videos', 
  authMiddleware, 
  roleMiddleware(['farmer']),
  array('videos', 5), // Using multer upload middleware for videos
  async (req, res) => {
    try {
      const farm = await findOne({
        _id: req.params.id,
        farmer: req.user._id
      });

      if (!farm) {
        return res.status(404).json({ error: 'Farm not found or access denied' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No video files uploaded.' });
      }

      const videos = req.files.map(file => ({
        url: `/uploads/${req.user.role}/${file.filename}`,
        title: req.body.title || file.originalname,
        description: req.body.description || ''
      }));

      farm.media.videos.push(...videos);
      await farm.save();

      res.json({ videos });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get farmer's farms
router.get('/farmer/my-farms', 
  authMiddleware, 
  roleMiddleware(['farmer']),
  async (req, res) => {
    try {
      const farms = await find({ farmer: req.user._id })
        .sort({ createdAt: -1 })
        .lean();

      res.json(farms);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.get('/farmer/my-dashboard', 
  authMiddleware, 
  roleMiddleware(['farmer']),
  async (req, res) => {
    try {
      const farmerId = req.user._id;
      const farms = await find({ farmer: farmerId }).select('_id');
      const farmIds = farms.map(farm => farm._id);

      if (farmIds.length === 0) {
        return res.json({ message: "No farms found for this farmer." });
      }

      const stats = await Promise.all([
        Booking.countDocuments({ farm: { $in: farmIds } }),
        Booking.countDocuments({ farm: { $in: farmIds }, status: 'completed' }),
        Review.countDocuments({ farm: { $in: farmIds } }),
        aggregate([
          { $match: { _id: { $in: farmIds } } },
          { $group: { _id: null, totalRevenue: { $sum: '$statistics.totalRevenue' }, totalViews: { $sum: '$statistics.viewCount' } } }
        ])
      ]);
      
      const monthlyBookings = await Booking.aggregate([
          { $match: { farm: { $in: farmIds } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              count: { $sum: 1 },
              revenue: { $sum: '$pricing.total' }
            }
          },
          { $sort: { '_id': -1 } },
          { $limit: 12 }
      ]);

      res.json({
        totalBookings: stats[0],
        completedBookings: stats[1],
        totalReviews: stats[2],
        totalRevenue: stats[3][0] ? stats[3][0].totalRevenue : 0,
        totalViews: stats[3][0] ? stats[3][0].totalViews : 0,
        monthlyBookings
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete farm
router.delete('/:id', 
  authMiddleware, 
  roleMiddleware(['farmer']),
  async (req, res) => {
    try {
      const farm = await findOneAndDelete({
        _id: req.params.id,
        farmer: req.user._id
      });

      if (!farm) {
        return res.status(404).json({ error: 'Farm not found or access denied' });
      }

      res.json({ message: 'Farm deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;