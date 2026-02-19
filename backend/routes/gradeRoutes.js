import express from 'express';
import multer from 'multer';
import { addGrade, batchAddGrades, getMyGrades, getMyAverages, recalcAverages } from '../controllers/gradeController.js';
import { generateCode, submitVerification, getVerificationStatus } from '../controllers/gradeVerificationController.js';
import { submitVideoVerification, getVideoVerificationStatus } from '../controllers/videoVerificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB for video
});

// Grade CRUD
router.route('/').post(protect, addGrade).get(protect, getMyGrades);
router.post('/batch', protect, batchAddGrades);
router.post('/recalc', protect, recalcAverages);
router.get('/averages', protect, getMyAverages);

// Grade Verification (Screenshot - to be refactored)
router.get('/verify/code', protect, generateCode);
router.post('/verify/submit', protect, upload.fields([{ name: 'tdScreenshot', maxCount: 1 }, { name: 'examScreenshot', maxCount: 1 }]), submitVerification);
router.get('/verify/status', protect, getVerificationStatus);

// Grade Verification (Video)
router.post('/verify/video', protect, upload.single('video'), submitVideoVerification);
router.get('/verify/video/status/:id', protect, getVideoVerificationStatus);


export default router;
