import express, { json, urlencoded } from 'express';
import { connect } from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
//import crypto from 'crypto';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import { createServer } from 'http';
import socketIo from 'socket.io';
import { createLogger, format as _format, transports as _transports } from 'winston';
import { schedule } from 'node-cron';
require('dotenv').config();
import session from 'express-session';
import passport from 'passport';
import './config/passport-setup';

// Import routes
import userRoutes from './routes/userRoutes';
import farmRoutes from './routes/farmRoutes';
import activityRoutes from './routes/activityRoutes';
import bookingRoutes from './routes/bookingRoutes';
import paymentRoutes from './routes/paymentRoutes';
import reviewRoutes from './routes/reviewRoutes';
import messageRoutes from './routes/messageRoutes';
import reportRoutes from './routes/reportRoutes';
import adminRoutes from './routes/adminRoutes';
import notificationRoutes from './routes/notificationRoutes';
import feedbackRoutes from './routes/feedbackRoutes';
import searchRoutes from './routes/searchRoutes';

// Import middleware
//import authMiddleware from './middleware/authMiddleware';
import errorHandler from './middleware/errorHandler';

const app = express();
const server = createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Logger configuration
const logger = createLogger({
  level: 'info',
  format: _format.combine(
    _format.timestamp(),
    _format.json()
  ),
  transports: [
    new _transports.File({ filename: 'logs/error.log', level: 'error' }),
    new _transports.File({ filename: 'logs/combined.log' }),
    new _transports.Console()
  ]
});

// Security middleware
app.use(helmet());
app.use(compression());
app.use(mongoSanitize());
app.use(hpp());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB connection
connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/agrotourism', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => logger.info('MongoDB connected successfully'))
.catch(err => logger.error('MongoDB connection error:', err));

// Socket.IO for real-time messaging
io.on('connection', (socket) => {
  logger.info('User connected:', socket.id);
  
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
  });
  
  socket.on('send-message', (data) => {
    socket.to(data.roomId).emit('receive-message', data);
  });
  
  socket.on('disconnect', () => {
    logger.info('User disconnected:', socket.id);
  });
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/farms', farmRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/search', searchRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use(errorHandler);

// Cron jobs for automated tasks
schedule('0 0 * * *', () => {
  logger.info('Running daily cleanup tasks');
  // Add cleanup tasks here
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

export default app;