import express from 'express';
import multer from 'multer';
import { authUser, registerUser, getUserProfile, checkAlias, updateProfile } from '../controllers/authController.js';
import { verifyStudent } from '../controllers/verificationController.js';
import { protect } from '../middleware/authMiddleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Multer setup for in-memory file storage (image is never saved to disk)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Rate limiters
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Trop de tentatives, réessayez plus tard',
});

const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Trop de tentatives de vérification. Attendez 15 minutes.',
});

router.post('/register', registerUser);
router.post('/login', loginLimiter, authUser);
router.get('/me', protect, getUserProfile);
router.put('/profile', protect, rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), updateProfile);
router.post('/verify', protect, verifyLimiter, upload.fields([
    { name: 'studentCard', maxCount: 1 }
]), verifyStudent);

export default router;
