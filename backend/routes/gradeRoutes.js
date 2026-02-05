import express from 'express';
import { addGrade, batchAddGrades, getMyGrades, getMyAverages } from '../controllers/gradeController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/').post(protect, addGrade).get(protect, getMyGrades);
router.post('/batch', protect, batchAddGrades);
router.get('/averages', protect, getMyAverages);

export default router;
