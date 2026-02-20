import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createWorker } from 'tesseract.js';
import { supabase } from '../config/db.js';
import { extractFrames } from '../utils/videoProcessor.js';
import { runAllOCR, buildFrameConsensus, checkCodeInResults } from '../utils/multiOCR.js';
import { aggregateTemporalResults, crossCheckWithPortal } from '../utils/temporalAggregator.js';
import { calculateVideoTrustScore, getVideoStatusMessage } from '../utils/videoTrustScoring.js';
import { detectTampering } from '../utils/gradeTamperingDetector.js';
import { compareGrades } from '../utils/gradeComparator.js';

/**
 * Submit video for verification (Async Start)
 * POST /api/grades/verify/video
 */
export const submitVideoVerification = async (req, res) => {
    try {
        const userId = req.user.id;
        const videoFile = req.file;
        const { code } = req.body;

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
        setImmediate(() => processVideoJob(job.id, videoFile.buffer, userId, code));

        // 3. Return Job ID immediately
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
async function processVideoJob(jobId, videoBuffer, userId, verificationCode) {
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

        // STEP 2: OCR Analysis
        await updateStatus('OCR_ANALYSIS');
        worker = await createWorker('fra+eng');

        const frameResults = [];
        let codeFound = false;

        for (let i = 0; i < frames.length; i++) {
            const result = await runAllOCR(frames[i].buffer, worker);

            // Check for code in any frame
            if (!codeFound && verificationCode) {
                const check = checkCodeInResults(result.results, verificationCode);
                if (check.found) codeFound = true;
            }

            frameResults.push({
                frameIndex: i,
                timestamp: i, // Approximation if timestamps not available from extractor
                results: result.results,
                gradeExtractions: result.gradeExtractions,
                consensus: buildFrameConsensus(result.gradeExtractions)
            });

            if (i % 2 === 0) {
                await updateStatus(`OCR_ANALYSIS_${i + 1}/${frames.length}`);
            }
        }

        // STEP 3: Consensus & Temporal Aggregation
        await updateStatus('AGGREGATING_RESULTS');
        const temporal = aggregateTemporalResults(frameResults);

        // STEP 4: CREDIBILITY CHECK — Compare OCR vs User Grades
        await updateStatus('COMPARING_GRADES');
        const { data: portalGrades } = await supabase
            .from('grades')
            .select('*')
            .eq('user_id', userId);

        const credibility = compareGrades(temporal.finalGrades, portalGrades || []);
        console.log(`[VIDEO-VERIFY] Credibility: ${credibility.summary}`);

        // STEP 5: Tampering Detection
        await updateStatus('TAMPERING_DETECTION');
        const tampering = await detectTampering(frames[0].buffer);

        // STEP 6: Final Scoring
        await updateStatus('CALCULATING_SCORE');

        // Prepare data for the scoring utility
        const ocrAgreement = {
            confidence: temporal.consistency,
            disagreements: frameResults.flatMap(f => f.consensus.disagreements || [])
        };

        const scoreResult = calculateVideoTrustScore({
            ocrAgreement,
            extractedGrades: temporal.finalGrades,
            portalGrades: portalGrades ? portalGrades.reduce((acc, g) => {
                acc[g.subject] = { exam: g.exam_score, td: g.td_score };
                return acc;
            }, {}) : {},
            temporalResult: temporal,
            tamperingResult: tampering,
            codeResult: { found: codeFound }
        });

        // Override status if credibility check fails
        if (!credibility.passed) {
            scoreResult.status = 'REJECTED';
            scoreResult.issues = scoreResult.issues || [];
            scoreResult.issues.push(`Crédibilité insuffisante: ${credibility.score}/${credibility.total}`);
            if (credibility.mandatoryFailures.length > 0) {
                scoreResult.issues.push(
                    `Notes obligatoires incorrectes: ${credibility.mandatoryFailures.map(f => `${f.module} ${f.type}`).join(', ')}`
                );
            }
        }

        // STEP 7: Final Save
        const processingTime = (Date.now() - startTime) / 1000;
        const message = getVideoStatusMessage(scoreResult.status, scoreResult.trustScore);

        await supabase
            .from('grade_verifications')
            .update({
                status: scoreResult.status,
                current_step: 'COMPLETED',
                trust_score: scoreResult.trustScore,
                extracted_grades: temporal.finalGrades,
                credibility_score: credibility.score,
                credibility_total: credibility.total,
                credibility_details: credibility.details,
                ocr_agreement_score: scoreResult.breakdown.ocrAgreement?.score || 0,
                temporal_consistency_score: scoreResult.breakdown.temporalConsistency?.score || 0,
                arithmetic_accuracy_score: scoreResult.breakdown.arithmeticAccuracy?.score || 0,
                tampering_probability: tampering.tamperingProbability,
                frames_analyzed: frames.length,
                issues: scoreResult.issues,
                processing_time: processingTime,
                score_breakdown: scoreResult.breakdown,
                message: message
            })
            .eq('id', jobId);

        if (scoreResult.status === 'VERIFIED') {
            await supabase
                .from('users')
                .update({ is_verified: true })
                .eq('id', userId);
        }

        console.log(`[VIDEO-JOB] Job ${jobId} completed in ${processingTime}s`);

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
