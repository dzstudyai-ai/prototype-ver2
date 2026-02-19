import { createWorker } from 'tesseract.js';
import crypto from 'crypto';
import { supabase } from '../config/db.js';
import { validateGradeStructure, findVerificationCode, mergeGrades, calculateAverages } from '../utils/gradeOCRExtractor.js';
import { detectTampering } from '../utils/gradeTamperingDetector.js';
import { calculateGradeTrustScore, getGradeStatusMessage } from '../utils/gradeTrustScoring.js';
import { runAllOCR, buildFrameConsensus, checkCodeInResults } from '../utils/multiOCR.js';

const CODE_TTL_SECONDS = 300;
const CODE_PREFIX = 'AG-S3-';

/**
 * Generate a verification code valid for 120 seconds
 * GET /api/grades/verify/code
 */
export const generateCode = async (req, res) => {
    try {
        const userId = req.user.id;

        // Invalidate any existing unused codes for this user
        await supabase
            .from('verification_codes')
            .update({ used: true })
            .eq('user_id', userId)
            .eq('used', false);

        // Generate random 5-digit code
        const randomNum = crypto.randomInt(10000, 99999);
        const code = `${CODE_PREFIX}${randomNum}`;
        const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();

        // Save to database
        const { error } = await supabase
            .from('verification_codes')
            .insert({
                user_id: userId,
                code,
                expires_at: expiresAt
            });

        if (error) throw error;

        res.json({ code, expiresAt });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * Process single image internally using multi-engine OCR
 */
async function processImageInternal(imageBuffer, code, worker) {
    // 1. OCR with Multi-Engine (Tesseract + OCR.space)
    const { results, gradeExtractions } = await runAllOCR(imageBuffer, worker);

    // 2. Build Consensus
    const consensus = buildFrameConsensus(gradeExtractions);

    // 3. Code Check
    const codeCheck = findVerificationCode(results[0]?.text || '', code);

    // 4. Forensics
    const tamperingResult = await detectTampering(imageBuffer);

    return {
        ocrResults: results,
        grades: { extractedGrades: consensus.consensusGrades },
        codeCheck,
        tamperingResult,
        consensus
    };
}

/**
 * Submit screenshots for verification (Async Start)
 * POST /api/grades/verify/submit
 */
export const submitVerification = async (req, res) => {
    try {
        const userId = req.user.id;
        const { code } = req.body;
        const tdFile = req.files?.tdScreenshot?.[0];
        const examFile = req.files?.examScreenshot?.[0];

        if (!tdFile || !examFile || !code) {
            return res.status(400).json({ message: 'Données manquantes (TD, Exam ou Code)' });
        }

        // 1. Create initial record in PROCESSING state
        const { data: job, error: insertError } = await supabase
            .from('grade_verifications')
            .upsert({
                user_id: userId,
                status: 'PROCESSING',
                verification_type: 'screenshot',
                current_step: 'UPLOADED',
                created_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 2. Start background processing
        setImmediate(() => processScreenshotJob(job.id, tdFile.buffer, examFile.buffer, code, userId));

        // 3. Return Job ID immediately
        res.status(202).json({
            message: 'Vérification lancée',
            jobId: job.id,
            status: 'PROCESSING'
        });

    } catch (err) {
        console.error('[SCREENSHOT-VERIFY] Error:', err);
        res.status(500).json({ message: err.message });
    }
};

/**
 * Internal Background Processor for Screenshots
 */
async function processScreenshotJob(jobId, tdBuffer, examBuffer, code, userId) {
    const startTime = Date.now();
    let worker = null;

    try {
        const updateStatus = async (step, extra = {}) => {
            await supabase
                .from('grade_verifications')
                .update({ current_step: step, ...extra })
                .eq('id', jobId);
        };

        worker = await createWorker('fra+eng');

        // STEP 1: Process TD Screenshot
        await updateStatus('PROCESSING_TD');
        const tdResult = await processImageInternal(tdBuffer, code, worker);

        // STEP 2: Process Exam Screenshot
        await updateStatus('PROCESSING_EXAM');
        const examResult = await processImageInternal(examBuffer, code, worker);

        // STEP 3: Logic & Scoring
        await updateStatus('CALCULATING_RESULTS');

        const mergedResults = mergeGrades(
            { grades: tdResult.grades.extractedGrades },
            { grades: examResult.grades.extractedGrades }
        );

        const averages = calculateAverages(mergedResults.grades);
        const structure = validateGradeStructure(mergedResults.grades);

        // Aggregate code check result
        const codeResult = {
            found: tdResult.codeCheck.found || examResult.codeCheck.found,
            exact: tdResult.codeCheck.exact || examResult.codeCheck.exact,
            confidence: Math.max(tdResult.codeCheck.confidence, examResult.codeCheck.confidence)
        };

        const scoreResult = calculateGradeTrustScore({
            codeResult,
            structureResult: structure,
            tamperingResult: {
                tamperingProbability: Math.max(tdResult.tamperingResult.tamperingProbability, examResult.tamperingResult.tamperingProbability)
            },
            modulesFound: mergedResults.modulesFound
        });

        // STEP 4: Final Save
        const processingTime = (Date.now() - startTime) / 1000;
        const message = getGradeStatusMessage(scoreResult.status, scoreResult.trustScore);

        await supabase
            .from('grade_verifications')
            .update({
                status: scoreResult.status,
                current_step: 'COMPLETED',
                trust_score: scoreResult.trustScore,
                extracted_grades: mergedResults.grades,
                tampering_probability: Math.max(tdResult.tamperingResult.tamperingProbability, examResult.tamperingResult.tamperingProbability),
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

    } catch (err) {
        console.error(`[SCREENSHOT-JOB] Error for job ${jobId}:`, err);
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

/**
 * Get overall verification status for current user
 */
export const getVerificationStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const { data, error } = await supabase
            .from('grade_verifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        res.json(data || { status: 'PENDING_UPLOAD' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
