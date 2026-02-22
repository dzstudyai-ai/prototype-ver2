import express from 'express';
import { getGeneralRanking, getSubjectRanking, getGroupRanking, refreshRankings } from '../controllers/rankingController.js';
import { protect, verifiedOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/refresh', protect, verifiedOnly, refreshRankings);
router.get('/general', protect, verifiedOnly, getGeneralRanking);
router.get('/subject/:subject', protect, verifiedOnly, getSubjectRanking);
router.get('/group/:group', protect, verifiedOnly, getGroupRanking);

export default router;

