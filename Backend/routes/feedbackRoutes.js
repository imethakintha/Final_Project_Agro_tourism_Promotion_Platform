import { Router } from 'express';
import Feedback, { find } from '../models/Feedback';
import { authMiddleware, roleMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Submit feedback
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { farm, type, subject, content, isAnonymous } = req.body;
    
    const feedbackData = {
      farm,
      type,
      subject,
      content,
      isAnonymous,
      user: isAnonymous ? null : req.user._id
    };

    const feedback = new Feedback(feedbackData);
    await feedback.save();

    res.status(201).json({ message: 'Feedback submitted successfully.', feedback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get feedback (for admins or relevant farmers)
router.get('/farm/:farmId', authMiddleware, roleMiddleware(['admin', 'farmer']), async (req, res) => {
  try {
    // Admins can see all feedback, farmers can only see feedback for their farms.
    const query = { farm: req.params.farmId };
    
    // Ensure farmer is the owner of the farm for which they request feedback
    if (req.user.role === 'farmer') {
      const isOwner = await Farm.exists({ _id: req.params.farmId, farmer: req.user._id });
      if (!isOwner) {
        return res.status(403).json({ error: 'Access denied to this farm\'s feedback.' });
      }
    }
    
    const feedback = await find(query)
      .populate('user', 'profile.firstName profile.lastName')
      .sort({ createdAt: -1 });

    res.json(feedback);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;