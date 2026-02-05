import express from 'express';
import { getGeneralRanking, getSubjectRanking, refreshRankings } from '../controllers/rankingController.js';

const router = express.Router();

router.post('/refresh', refreshRankings);
router.get('/general', getGeneralRanking);
router.get('/subject/:subject', getSubjectRanking);

export default router;
