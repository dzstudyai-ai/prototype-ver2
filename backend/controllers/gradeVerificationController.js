/**
 * ═══════════════════════════════════════════════════════════════
 * GRADE VERIFICATION CONTROLLER v2
 * ═══════════════════════════════════════════════════════════════
 * 
 * Multi-layer anti-cheat system for verifying grades from Progrès app.
 * 
 * Endpoints:
 *   GET  /api/grades/verify/code    → Generate verification code (120s TTL)
 *   POST /api/grades/verify/submit  → Submit TD + Exam screenshots
 *   GET  /api/grades/verify/status  → Get latest verification status
 * 
 * Flow:
 *   1. Student requests a verification code → overlay shown on site
 *   2. Student opens Progrès, captures TD grades + Exam grades
 *   3. Student uploads both screenshots (code visible via overlay)
 *   4. System verifies: code presence, OCR grades, structure, tampering
 *   5. Calculates module averages + semester average
 *   6. Returns trust score, status, and grades
 */

import crypto from 'crypto';
import { createWorker } from 'tesseract.js';
import { supabase } from '../config/db.js';
import { analyzeImage, preprocessForOCR, getImageHash } from '../utils/imageProcessor.js';
import { detectFraud } from '../utils/fraudDetector.js';
import { extractGrades, validateGradeStructure, findVerificationCode, mergeGrades, calculateAverages } from '../utils/gradeOCRExtractor.js';
import { detectTampering } from '../utils/gradeTamperingDetector.js';
import { calculateGradeTrustScore, getGradeStatusMessage } from '../utils/gradeTrustScoring.js';
import { logVerification, getClientIP } from '../utils/verificationLogger.js';

const CODE_TTL_SECONDS = 120;
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
        const { data, error } = await supabase
            .from('verification_codes')
            .insert({
                user_id: userId,
                code,
                expires_at: expiresAt,
                used: false
            })
            .select()
            .single();

        if (error) {
            console.error('[CODE] Insert error:', error.message);
            return res.status(500).json({ error: 'Erreur lors de la génération du code' });
        }

        console.log(`[CODE] Generated: ${code} for user ${userId}, expires in ${CODE_TTL_SECONDS}s`);

        return res.json({
            code: data.code,
            expires_at: data.expires_at,
            ttl_seconds: CODE_TTL_SECONDS,
            instructions: [
                '1. Le code s\'affiche en overlay sur votre écran',
                '2. Ouvrez l\'application Progrès (notes S3)',
                '3. Prenez une capture des notes TD (avec le code visible)',
                '4. Prenez une capture des notes Examen (avec le code visible)',
                '5. Soumettez les deux captures ci-dessous',
                '6. Vous avez 2 minutes avant expiration du code'
            ]
        });
    } catch (err) {
        console.error('[CODE] Error:', err.message);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
};

/**
 * Process a single image through OCR
 * @returns {Object} { ocrText, grades, codeCheck, imageAnalysis, fraudResults, tamperingResult }
 */
async function processImage(imageBuffer, code, userId, req) {
    // Image analysis
    const imageAnalysis = await analyzeImage(imageBuffer);

    if (imageAnalysis.resolution.width < 300 || imageAnalysis.resolution.height < 200) {
        throw new Error('Image trop petite. Résolution minimale: 300x200.');
    }

    // Fraud detection
    const fraudContext = { userId, ip: getClientIP(req), userAgent: req.headers['user-agent'] || 'unknown' };
    const fraudResults = await detectFraud(imageAnalysis, imageBuffer, fraudContext);

    // OCR
    const worker = await createWorker('fra+eng');
    const ocrBuffer = await preprocessForOCR(imageBuffer);
    const { data: { text: ocrText, confidence: ocrConfidence } } = await worker.recognize(ocrBuffer);
    await worker.terminate();

    // Check for verification code
    const codeCheck = findVerificationCode(ocrText, code);

    // Extract grades
    const gradeExtraction = extractGrades(ocrText);

    // Tampering detection
    const tamperingResult = await detectTampering(imageBuffer);

    return {
        ocrText,
        ocrConfidence: Math.round(ocrConfidence),
        grades: gradeExtraction,
        codeCheck,
        imageAnalysis,
        fraudResults,
        tamperingResult
    };
}

/**
 * Submit TD + Exam screenshots for verification
 * POST /api/grades/verify/submit
 * Files: tdScreenshot, examScreenshot
 * Body: { code: string }
 */
export const submitVerification = async (req, res) => {
    const startTime = Date.now();

    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║     GRADE VERIFICATION SYSTEM v2.0               ║');
    console.log('╚═══════════════════════════════════════════════════╝');

    try {
        const userId = req.user.id;
        const { code } = req.body;
        const tdBuffer = req.files?.tdScreenshot?.[0]?.buffer;
        const examBuffer = req.files?.examScreenshot?.[0]?.buffer;

        if (!code || (!tdBuffer && !examBuffer)) {
            return res.status(400).json({
                status: 'REJECTED',
                trust_score: 0,
                message: 'Code de vérification et au moins une capture requise.',
                issues_detected: ['Données manquantes']
            });
        }

        // ═══════════════════════════════════════
        // STEP 1: VALIDATE VERIFICATION CODE
        // ═══════════════════════════════════════
        console.log('\n[STEP 1] 🔑 Validating verification code...');

        const { data: codeRecord, error: codeError } = await supabase
            .from('verification_codes')
            .select('*')
            .eq('user_id', userId)
            .eq('code', code)
            .eq('used', false)
            .single();

        let codeExpired = false;
        if (codeError || !codeRecord) {
            console.log('[STEP 1] ❌ Code not found or already used');
            return res.status(400).json({
                status: 'REJECTED',
                trust_score: 0,
                message: 'Code de vérification invalide ou déjà utilisé.',
                issues_detected: ['Code invalide']
            });
        }

        if (new Date(codeRecord.expires_at) < new Date()) {
            console.log('[STEP 1] ❌ Code expired');
            codeExpired = true;
        } else {
            console.log(`[STEP 1] ✅ Code valid: ${code}`);
        }

        // Mark code as used
        await supabase
            .from('verification_codes')
            .update({ used: true })
            .eq('id', codeRecord.id);

        // ═══════════════════════════════════════
        // STEP 2-3: PROCESS IMAGES IN PARALLEL
        // ═══════════════════════════════════════
        console.log('\n[STEP 2-3] 🖼  Processing TD & Exam images...');

        let tdResult = null;
        let examResult = null;
        const processingPromises = [];

        if (tdBuffer) {
            processingPromises.push(
                processImage(tdBuffer, code, userId, req)
                    .then(r => { tdResult = r; console.log(`  ├─ TD: ${r.grades.modulesFound.length} modules, OCR ${r.ocrConfidence}%`); })
                    .catch(e => { console.error('  ├─ TD processing error:', e.message); })
            );
        }

        if (examBuffer) {
            processingPromises.push(
                processImage(examBuffer, code, userId, req)
                    .then(r => { examResult = r; console.log(`  ├─ Exam: ${r.grades.modulesFound.length} modules, OCR ${r.ocrConfidence}%`); })
                    .catch(e => { console.error('  ├─ Exam processing error:', e.message); })
            );
        }

        await Promise.all(processingPromises);

        if (!tdResult && !examResult) {
            return res.status(422).json({
                status: 'REJECTED',
                trust_score: 0,
                message: 'Impossible de traiter les images soumises.',
                issues_detected: ['Erreur de traitement des images']
            });
        }

        // ═══════════════════════════════════════
        // STEP 4: MERGE & VALIDATE GRADES
        // ═══════════════════════════════════════
        console.log('\n[STEP 4] 📋 Merging & validating grades...');

        let mergedGrades;
        if (tdResult && examResult) {
            mergedGrades = mergeGrades(tdResult.grades, examResult.grades);
        } else {
            const available = tdResult || examResult;
            mergedGrades = {
                grades: available.grades.grades,
                modulesFound: available.grades.modulesFound,
                tdModulesFound: tdResult ? available.grades.modulesFound : [],
                examModulesFound: examResult ? available.grades.modulesFound : []
            };
        }

        console.log(`  ├─ Total modules after merge: ${mergedGrades.modulesFound.length}`);

        const structureValidation = validateGradeStructure(mergedGrades.grades);
        console.log(`  ├─ Structure valid: ${structureValidation.valid ? '✅' : '❌'}`);
        console.log(`  └─ Structure score: ${structureValidation.structureScore}/100`);

        // ═══════════════════════════════════════
        // STEP 5: CALCULATE AVERAGES
        // ═══════════════════════════════════════
        console.log('\n[STEP 5] 🧮 Calculating averages...');

        const averagesResult = calculateAverages(mergedGrades.grades);
        console.log(`  ├─ Modules calculated: ${averagesResult.modulesCalculated}/${Object.keys(mergedGrades.grades).length}`);
        console.log(`  └─ Semester average: ${averagesResult.semesterAverage ?? 'N/A'}`);

        // ═══════════════════════════════════════
        // STEP 6: AGGREGATE TAMPERING & CODE CHECKS
        // ═══════════════════════════════════════
        console.log('\n[STEP 6] 🛡  Aggregating tampering & code results...');

        // Best code check from either image
        const codeChecks = [tdResult?.codeCheck, examResult?.codeCheck].filter(Boolean);
        const bestCodeCheck = codeChecks.reduce((best, c) => (c.confidence > (best?.confidence || 0) ? c : best), { found: false, confidence: 0 });
        bestCodeCheck.expired = codeExpired;

        // Worst-case tampering (highest probability)
        const tamperingResults = [tdResult?.tamperingResult, examResult?.tamperingResult].filter(Boolean);
        const maxTampering = tamperingResults.reduce((worst, t) => (t.tamperingProbability > worst.tamperingProbability ? t : worst), { tamperingProbability: 0, summary: 'N/A', checks: [] });
        console.log(`  ├─ Code found: ${bestCodeCheck.found ? '✅' : '❌'} (confidence: ${bestCodeCheck.confidence}%)`);
        console.log(`  └─ Max tampering: ${maxTampering.tamperingProbability}%`);

        // ═══════════════════════════════════════
        // STEP 7: TRUST SCORE
        // ═══════════════════════════════════════
        console.log('\n[STEP 7] 📊 Trust Score Calculation...');

        const trustResult = calculateGradeTrustScore({
            codeResult: bestCodeCheck,
            structureResult: structureValidation,
            tamperingResult: maxTampering,
            modulesFound: mergedGrades.modulesFound
        });

        const duration = Date.now() - startTime;
        console.log(`\n[RESULT] Score: ${trustResult.trustScore}/100 → ${trustResult.status} (${duration}ms)`);

        // ═══════════════════════════════════════
        // SAVE & RESPOND
        // ═══════════════════════════════════════
        const imageHash = await getImageHash(tdBuffer || examBuffer);

        const { error: saveError } = await supabase
            .from('grade_verifications')
            .insert({
                user_id: userId,
                code_id: codeRecord.id,
                image_hash: imageHash,
                trust_score: trustResult.trustScore,
                status: trustResult.status,
                tampering_probability: maxTampering.tamperingProbability,
                extracted_grades: averagesResult.modules,
                issues_detected: [
                    ...trustResult.issues,
                    ...structureValidation.issues.map(i => i.message),
                    ...maxTampering.checks.filter(c => c.suspicionScore > 50).map(c => `${c.name}: suspicion ${c.suspicionScore}%`)
                ],
                score_breakdown: trustResult.breakdown,
                ip_address: getClientIP(req),
                user_agent: req.headers['user-agent'] || 'unknown'
            });

        if (saveError) {
            console.error('[SAVE] Error:', saveError.message);
        }

        // Log to verification_logs
        await logVerification({
            userId,
            imageHash,
            ipAddress: getClientIP(req),
            userAgent: req.headers['user-agent'],
            validationStatus: trustResult.status === 'VERIFIED' ? 'VALID' : trustResult.status === 'PENDING' ? 'SUSPICIOUS' : 'REJECTED',
            confidenceScore: trustResult.trustScore,
            fraudFlags: [...(tdResult?.fraudResults?.flags || []), ...(examResult?.fraudResults?.flags || [])],
            extractedData: { modules: Object.keys(mergedGrades.grades).length, semesterAverage: averagesResult.semesterAverage, code },
            verificationSource: 'GRADE_SCREENSHOT_V2'
        });

        return res.json({
            status: trustResult.status,
            trust_score: trustResult.trustScore,
            tampering_probability: maxTampering.tamperingProbability,
            message: getGradeStatusMessage(trustResult.status, trustResult.trustScore),
            extracted_grades: averagesResult.modules,
            semester_average: averagesResult.semesterAverage,
            issues_detected: trustResult.issues,
            breakdown: trustResult.breakdown,
            processing_time_ms: duration
        });

    } catch (err) {
        console.error('[GRADE-VERIFY] Fatal error:', err);
        return res.status(500).json({
            status: 'REJECTED',
            trust_score: 0,
            message: 'Erreur serveur lors de la vérification.',
            issues_detected: [err.message]
        });
    }
};

/**
 * Get latest verification status for current user
 * GET /api/grades/verify/status
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

        if (error) {
            return res.status(500).json({ error: 'Erreur lors de la récupération du statut' });
        }

        if (!data) {
            return res.json({
                status: 'NONE',
                message: 'Aucune vérification effectuée.',
                trust_score: 0
            });
        }

        return res.json({
            status: data.status,
            trust_score: data.trust_score,
            tampering_probability: data.tampering_probability,
            extracted_grades: data.extracted_grades,
            semester_average: data.extracted_grades ?
                Object.values(data.extracted_grades).reduce((sum, m) => sum + ((m.average || 0) * (m.coefficient || 1)), 0) /
                Object.values(data.extracted_grades).reduce((sum, m) => sum + (m.coefficient || 1), 0) : null,
            issues_detected: data.issues_detected,
            score_breakdown: data.score_breakdown,
            verified_at: data.created_at,
            message: getGradeStatusMessage(data.status, data.trust_score)
        });
    } catch (err) {
        console.error('[STATUS] Error:', err.message);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
};
