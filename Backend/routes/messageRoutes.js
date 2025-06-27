import { Router } from 'express';
import Message, { find, updateMany, aggregate, populate } from '../models/Message';
import { authMiddleware } from '../middleware/authMiddleware';
import { array } from '../middleware/uploadMiddleware';

const router = Router();

// Send message
router.post('/', authMiddleware, array('attachments', 5), async (req, res) => { // <-- USE MIDDLEWARE HERE
  try {
    const { recipient, content, type = 'text' } = req.body;

    let attachments = [];
    if (req.files) {
        attachments = req.files.map(file => ({
            type: file.mimetype,
            url: `/uploads/${req.user.role}/${file.filename}`,
            filename: file.originalname,
            size: file.size
        }));
    }

    const message = new Message({
      sender: req.user._id,
      recipient,
      content, // Assuming content is a text message sent along with files
      type,
      attachments // Save file info to the message
    });

    await message.save();
    await message.populate(['sender', 'recipient'], 'profile email');

    // Emit real-time message (if using Socket.io)
    // Note: You might need to adjust your socket setup to pass `req.io`
    if (req.io) {
        req.io.to(recipient).emit('newMessage', message);
    }
    
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conversation between two users
router.get('/conversation/:userId', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const messages = await find({
      $or: [
        { sender: req.user._id, recipient: req.params.userId },
        { sender: req.params.userId, recipient: req.user._id }
      ]
    })
      .populate(['sender', 'recipient'], 'profile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Mark messages as read
    await updateMany({
      sender: req.params.userId,
      recipient: req.user._id,
      readAt: null
    }, {
      readAt: new Date()
    });

    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's conversations
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const conversations = await aggregate([
      {
        $match: {
          $or: [
            { sender: req.user._id },
            { recipient: req.user._id }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', req.user._id] },
              '$recipient',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$recipient', req.user._id] },
                    { $eq: ['$readAt', null] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    await populate(conversations, {
      path: '_id lastMessage.sender lastMessage.recipient',
      select: 'profile email'
    });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;