import express from 'express';
import multer from 'multer';
import { addGrade, batchAddGrades, getMyGrades, getMyAverages, recalcAverages } from '../controllers/gradeController.js';
import { generateCode, submitVerification, getVerificationStatus } from '../controllers/gradeVerificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Grade CRUD
router.route('/').post(protect, addGrade).get(protect, getMyGrades);
router.post('/batch', protect, batchAddGrades);
router.post('/recalc', protect, recalcAverages);
router.get('/averages', protect, getMyAverages);

// Grade Verification
router.get('/verify/code', protect, generateCode);
router.post('/verify/submit', protect, upload.fields([{ name: 'tdScreenshot', maxCount: 1 }, { name: 'examScreenshot', maxCount: 1 }]), submitVerification);
router.get('/verify/status', protect, getVerificationStatus);

export default router;
