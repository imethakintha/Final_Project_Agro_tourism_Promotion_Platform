import { Router } from 'express';
import Farm from '../models/Farm';
import { find } from '../models/Activity';

const router = Router();

// Global search
router.get('/', async (req, res) => {
  try {
    const { q, type = 'all', page = 1, limit = 10 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const skip = (page - 1) * limit;
    const results = {};

    if (type === 'all' || type === 'farms') {
      results.farms = await Farm.find({
        $text: { $search: q },
        status: 'approved',
        isActive: true
      })
        .populate('farmer', 'profile')
        .limit(parseInt(limit))
        .skip(skip);
    }

    if (type === 'all' || type === 'activities') {
      results.activities = await find({
        $text: { $search: q },
        isActive: true
      })
        .populate('farm', 'basicInfo location')
        .limit(parseInt(limit))
        .skip(skip);
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Location-based search
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 50, type = 'farms' } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    let query = {
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: radius * 1000 // Convert km to meters
        }
      }
    };

    if (type === 'farms') {
      query.status = 'approved';
      query.isActive = true;
      
      const farms = await Farm.find(query)
        .populate('farmer', 'profile')
        .limit(20);
      
      res.json({ farms });
    } else if (type === 'activities') {
      const farms = await Farm.find(query).select('_id');
      const farmIds = farms.map(f => f._id);
      
      const activities = await find({
        farm: { $in: farmIds },
        isActive: true
      })
        .populate('farm', 'basicInfo location')
        .limit(20);
      
      res.json({ activities });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;