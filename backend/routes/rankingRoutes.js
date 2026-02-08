import express from 'express';
import { getGeneralRanking, getSubjectRanking, refreshRankings } from '../controllers/rankingController.js';
import { protect, verifiedOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/refresh', protect, verifiedOnly, refreshRankings);
router.get('/general', protect, verifiedOnly, getGeneralRanking);
router.get('/subject/:subject', protect, verifiedOnly, getSubjectRanking);

export default router;

