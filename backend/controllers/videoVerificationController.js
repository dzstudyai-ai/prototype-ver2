import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createWorker } from 'tesseract.js';
import { supabase } from '../config/db.js';
import { extractFrames } from '../utils/videoProcessor.js';
import { runAllOCR, buildFrameConsensus } from '../utils/multiOCR.js';
import { aggregateTemporalResults, crossCheckWithPortal } from '../utils/temporalAggregator.js';
import { calculateVideoTrustScore } from '../utils/videoTrustScoring.js';
import { detectTampering } from '../utils/gradeTamperingDetector.js';

/**
 * Submit video for verification (Async Start)
 * POST /api/grades/verify/video
 */
export const submitVideoVerification = async (req, res) => {
    try {
        const userId = req.user.id;
        const videoFile = req.file;

        if (!videoFile) {
            return res.status(400).json({ message: 'Vidéo manquante' });
        }

        // 1. Create initial record in PROCESSING state
        const { data: job, error: insertError } = await supabase
            .from('grade_verifications')
            .upsert({
                user_id: userId,
                status: 'PROCESSING',
                verification_type: 'video',
                current_step: 'UPLOADED',
                created_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 2. Start background processing
        // We use setImmediate to let the request return immediately
        setImmediate(() => processVideoJob(job.id, videoFile.buffer, userId));

        // 3. Return Job ID immediately (Render 30s timeout fix)
        res.status(202).json({
            message: 'Vérification lancée',
            jobId: job.id,
            status: 'PROCESSING'
        });

    } catch (err) {
        console.error('[VIDEO-VERIFY] Submission error:', err);
        res.status(500).json({ message: err.message });
    }
};

/**
 * Get Video Verification Status (Polling endpoint)
 * GET /api/grades/verify/video/status/:id
 */
export const getVideoVerificationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: job, error } = await supabase
            .from('grade_verifications')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !job) {
            return res.status(404).json({ message: 'Vérification non trouvée' });
        }

        res.json(job);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * Internal Background Processor
 */
async function processVideoJob(jobId, videoBuffer, userId) {
    const startTime = Date.now();
    let worker = null;

    try {
        const updateStatus = async (step, extra = {}) => {
            await supabase
                .from('grade_verifications')
                .update({ current_step: step, ...extra })
                .eq('id', jobId);
        };

        // STEP 1: Frame Extraction
        await updateStatus('EXTRACTING_FRAMES');
        const frames = await extractFrames(videoBuffer, { fps: 1, maxFrames: 8 });

        if (!frames || frames.length === 0) {
            throw new Error('Aucune capture claire extraite de la vidéo');
        }

        // STEP 2: OCR Analysis (Sequential with worker reuse)
        await updateStatus('OCR_ANALYSIS');
        worker = await createWorker('fra+eng');

        const frameResults = [];
        for (let i = 0; i < frames.length; i++) {
            const result = await runAllOCR(frames[i].buffer, worker);
            frameResults.push({
                index: i,
                results: result.results,
                gradeExtractions: result.gradeExtractions
            });
            // Update progress occasionally
            if (i % 2 === 0) {
                await updateStatus(`OCR_ANALYSIS_${i + 1}/${frames.length}`);
            }
        }

        // STEP 3: Consensus & Temporal Aggregation
        await updateStatus('AGGREGATING_RESULTS');
        const frameConsensus = frameResults.map(fr => buildFrameConsensus(fr.gradeExtractions));
        const temporal = aggregateTemporalResults(frameConsensus);

        // STEP 4: Portal Cross-Check
        await updateStatus('PORTAL_CROSS_CHECK');
        const { data: portalGrades } = await supabase
            .from('grades')
            .select('*')
            .eq('user_id', userId);

        const crossCheck = crossCheckWithPortal(temporal.finalGrades, portalGrades || []);

        // STEP 5: Tampering Detection (on first clear frame)
        await updateStatus('TAMPERING_DETECTION');
        const tampering = await detectTampering(frames[0].buffer);

        // STEP 6: Final Scoring
        await updateStatus('CALCULATING_SCORE');
        const scoreResult = calculateVideoTrustScore({
            ocrResults: frameResults,
            temporal,
            crossCheck,
            tampering
        });

        // STEP 7: Final Save
        const processingTime = (Date.now() - startTime) / 1000;
        const status = scoreResult.trustScore >= 60 ? 'VERIFIED' : 'REJECTED';

        await supabase
            .from('grade_verifications')
            .update({
                status: status,
                current_step: 'COMPLETED',
                trust_score: scoreResult.trustScore,
                extracted_grades: temporal.finalGrades,
                ocr_agreement_score: scoreResult.breakdown.ocr,
                temporal_consistency_score: scoreResult.breakdown.temporal,
                arithmetic_accuracy_score: scoreResult.breakdown.arithmetic,
                tampering_probability: tampering.tamperingProbability,
                frames_analyzed: frames.length,
                issues: scoreResult.issues,
                processing_time: processingTime,
                score_breakdown: scoreResult.breakdown
            })
            .eq('id', jobId);

        // If verified, update the user's status globally
        if (status === 'VERIFIED') {
            await supabase
                .from('users')
                .update({ is_verified: true })
                .eq('id', userId);
        }

        console.log(`[VIDEO-JOB] Job ${jobId} completed for user ${userId} in ${processingTime}s`);

    } catch (err) {
        console.error(`[VIDEO-JOB] Error processing job ${jobId}:`, err);
        await supabase
            .from('grade_verifications')
            .update({
                status: 'FAILED',
                current_step: 'ERROR',
                error_message: err.message
            })
            .eq('id', jobId);
    } finally {
        if (worker) await worker.terminate().catch(() => { });
    }
}
