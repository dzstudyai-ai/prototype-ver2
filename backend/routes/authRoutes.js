import express from 'express';
import { authUser, registerUser, getUserProfile, checkAlias, updateProfile } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Trop de tentatives, réessayez plus tard',
});

router.post('/register', registerUser);
router.post('/login', loginLimiter, authUser);
router.get('/me', protect, getUserProfile);
router.put('/profile', protect, rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), updateProfile);
router.get('/check-alias/:alias', checkAlias);

export default router;
