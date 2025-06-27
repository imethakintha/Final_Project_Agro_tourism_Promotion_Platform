import { Router } from 'express';
import Review from '../models/Review';
import Booking from '../models/Booking';
import Farm from '../models/Farm';
import { authMiddleware, roleMiddleware } from '../middleware/authMiddleware'; // roleMiddleware is now used
import upload from '../middleware/uploadMiddleware'; // Correct way to import the default export
import { findBestMatch } from 'string-similarity';
import rateLimit from 'express-rate-limit';

const router = Router();

const createReviewLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 5, // Limit each IP to 5 review requests per window
	message: 'Too many reviews created from this IP, please try again after an hour',
	standardHeaders: true,
	legacyHeaders: false,
});

// Create review (tourists only, must have completed booking)
router.post('/', createReviewLimiter, authMiddleware, upload.array('photos', 5), async (req, res) => {
	try {
		const { farm, booking, rating, title, content, categories } = req.body;

		// Verify booking exists and is completed
		const bookingRecord = await Booking.findOne({
			_id: booking,
			user: req.user._id,
			status: 'completed'
		});

		if (!bookingRecord) {
			return res.status(400).json({ error: 'Valid completed booking required to leave review' });
		}

		// Check if already reviewed
		const existingReview = await Review.findOne({ booking, user: req.user._id });
		if (existingReview) {
			return res.status(400).json({ error: 'You have already reviewed this booking' });
		}
        
        // Spam/Duplicate check
        const recentReviews = await Review.find({ farm }).sort({ createdAt: -1 }).limit(20);
        const existingContents = recentReviews.map(r => r.content.review);
        if (existingContents.length > 0) {
            const { bestMatch } = findBestMatch(content.review, existingContents);
            if (bestMatch.rating > 0.85) {
                return res.status(400).json({ error: "This review is too similar to an existing one." });
            }
        }

		const photos = req.files ? req.files.map(file => ({
			url: `/uploads/${req.user.role}/${file.filename}`,
			caption: ''
		})) : [];

		const review = new Review({
			user: req.user._id,
			farm,
			booking,
			// FIX: The model schema is 'ratings' (plural) and 'review' for text
			ratings: {
				overall: rating,
				...categories
			},
			content: { title, review: content }, // Adjusted to match schema
			media: { photos }, // Adjusted to match schema
			isVerified: true
		});

		await review.save();
		
		// Update farm statistics
		await updateFarmStatistics(farm);

		res.status(201).json(review);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Get reviews for a farm
router.get('/farm/:farmId', async (req, res) => {
	try {
		const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
		
		const skip = (page - 1) * limit;
		const sortObj = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

		const query = { 
			farm: req.params.farmId,
			'moderation.status': 'approved' // Corrected based on schema
		};

		const reviews = await Review.find(query)
			.populate('user', 'profile.firstName profile.lastName profile.avatar')
			.sort(sortObj)
			.skip(skip)
			.limit(parseInt(limit));

		const total = await Review.countDocuments(query);

		res.json({
			reviews,
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

// Farmer response to review
router.post('/:id/response', authMiddleware, roleMiddleware(['farmer']), async (req, res) => {
	try {
		const { responseText } = req.body;
		
		const review = await Review.findById(req.params.id).populate('farm');
		if (!review) {
			return res.status(404).json({ error: 'Review not found' });
		}

		if (review.farm.farmer.toString() !== req.user._id.toString()) {
			return res.status(403).json({ error: 'Access denied' });
		}
        
        // FIX: Use the correct schema structure
		review.response = {
			content: responseText,
            respondedBy: req.user._id,
			respondedAt: new Date()
		};
		await review.save();

		res.json(review);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Vote on review helpfulness
router.post('/:id/helpful', authMiddleware, async (req, res) => {
    try {
        const { vote } = req.body; // 'helpful' or 'notHelpful'
        const reviewId = req.params.id;
        const userId = req.user._id;

        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({ error: 'Review not found.' });
        }

        if (review.helpfulness.voters.includes(userId)) {
            return res.status(400).json({ error: 'You have already voted on this review.' });
        }

        let update;
        if (vote === 'helpful') {
            update = { $inc: { 'helpfulness.helpful': 1 } };
        } else if (vote === 'notHelpful') {
            update = { $inc: { 'helpfulness.notHelpful': 1 } };
        } else {
            return res.status(400).json({ error: 'Invalid vote type.' });
        }
        
        await Review.updateOne({ _id: reviewId }, { ...update, $push: { 'helpfulness.voters': userId } });

        res.json({ message: 'Thank you for your feedback.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Helper function to update farm statistics
async function updateFarmStatistics(farmId) {
	const reviews = await Review.find({ farm: farmId, 'moderation.status': 'approved' });
	
	if (reviews.length > 0) {
		const averageRating = reviews.reduce((sum, review) => sum + review.ratings.overall, 0) / reviews.length;
		
		await Farm.findByIdAndUpdate(farmId, {
			'statistics.averageRating': Math.round(averageRating * 10) / 10,
			'statistics.totalReviews': reviews.length
		});
	} else {
        await Farm.findByIdAndUpdate(farmId, {
			'statistics.averageRating': 0,
			'statistics.totalReviews': 0
		});
    }
}

export default router;