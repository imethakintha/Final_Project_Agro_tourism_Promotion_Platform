import { body, validationResult } from 'express-validator';

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// User validation rules
const userValidation = {
  register: [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
    body('role').isIn(['farmer', 'tourist']),
    body('profile.firstName').trim().isLength({ min: 2, max: 50 }),
    body('profile.lastName').trim().isLength({ min: 2, max: 50 }),
    body('profile.phone').optional().isMobilePhone()
  ],
  login: [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ]
};

// Farm validation rules
const farmValidation = {
  create: [
    body('basicInfo.name').trim().isLength({ min: 3, max: 100 }),
    body('basicInfo.type').isIn(['organic', 'conventional', 'mixed', 'livestock', 'aquaculture']),
    body('location.coordinates.latitude').isFloat({ min: -90, max: 90 }),
    body('location.coordinates.longitude').isFloat({ min: -180, max: 180 }),
    body('contact.phone').optional().isMobilePhone(),
    body('contact.email').optional().isEmail()
  ]
};

// Activity validation rules
const activityValidation = {
  create: [
    body('basicInfo.name').trim().isLength({ min: 3, max: 100 }),
    body('basicInfo.category').isIn(['harvesting', 'planting', 'workshop', 'cultural', 'educational', 'recreational']),
    body('pricing.basePrice.adult').isFloat({ min: 0 }),
    body('requirements.minimumParticipants').isInt({ min: 1 }),
    body('requirements.maximumParticipants').isInt({ min: 1 })
  ]
};

export default {
  validateRequest,
  userValidation,
  farmValidation,
  activityValidation
};