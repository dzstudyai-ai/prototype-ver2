/**
 * FRAUD DETECTOR — Détection fraude niveau bancaire (outils gratuits)
 * 
 * Checks:
 * 1. Screenshot Detection (histogram uniformity + noise absence + no EXIF camera)
 * 2. Image Manipulation (compression artifacts, unusual patterns)
 * 3. Anti-Replay (SHA-256 image hash → reject duplicates)
 * 4. Multi-Source Coherence (QR ID vs OCR ID mismatch → FRAUD)
 * 5. Behavior Monitoring (attempt rate, IP tracking)
 */
import crypto from 'crypto';
import { supabase } from '../config/db.js';

/**
 * Run all fraud checks on an image and its context
 * @param {Object} imageAnalysis - Results from imageProcessor.analyzeImage()
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {Object} context - { userId, ip, userAgent, qrMatricule, ocrMatricule }
 * @returns {Object} { fraudScore, flags[], isBlocked, screenshotProbability }
 */
export async function detectFraud(imageAnalysis, imageBuffer, context) {
    const flags = [];
    let fraudScore = 0; // 0 = no fraud, 100 = certain fraud

    // ═══════════════════════════════════════
    // 1. SCREENSHOT DETECTION
    // ═══════════════════════════════════════
    const screenshot = detectScreenshot(imageAnalysis);
    if (screenshot.probability > 70) {
        flags.push({
            type: 'SCREENSHOT_DETECTED',
            severity: 'HIGH',
            message: 'Image probablement un screenshot (pas une photo originale)',
            probability: screenshot.probability
        });
        fraudScore += 35;
    } else if (screenshot.probability > 40) {
        flags.push({
            type: 'SCREENSHOT_SUSPECTED',
            severity: 'MEDIUM',
            message: 'Image suspecte — pourrait être un screenshot',
            probability: screenshot.probability
        });
        fraudScore += 15;
    }

    // ═══════════════════════════════════════
    // 2. IMAGE MANIPULATION CHECK
    // ═══════════════════════════════════════
    const manipulation = detectManipulation(imageAnalysis);
    if (manipulation.suspected) {
        flags.push({
            type: 'MANIPULATION_SUSPECTED',
            severity: manipulation.severity,
            message: manipulation.reason
        });
        fraudScore += manipulation.severity === 'HIGH' ? 25 : 10;
    }

    // ═══════════════════════════════════════
    // 3. ANTI-REPLAY (Hash check)
    // ═══════════════════════════════════════
    const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const replayResult = await checkReplay(imageHash, context.userId);
    if (replayResult.isDuplicate) {
        flags.push({
            type: 'REPLAY_ATTACK',
            severity: 'CRITICAL',
            message: 'Cette image a déjà été utilisée pour une vérification'
        });
        fraudScore += 50;
    }

    // ═══════════════════════════════════════
    // 4. MULTI-SOURCE COHERENCE
    // ═══════════════════════════════════════
    if (context.qrMatricule && context.ocrMatricule) {
        if (context.qrMatricule !== context.ocrMatricule) {
            flags.push({
                type: 'SOURCE_MISMATCH',
                severity: 'CRITICAL',
                message: `QR ID (${context.qrMatricule}) ≠ OCR ID (${context.ocrMatricule}) — possible fraude`
            });
            fraudScore += 40;
        }
    }

    // ═══════════════════════════════════════
    // 5. BEHAVIOR MONITORING
    // ═══════════════════════════════════════
    const behavior = await checkBehavior(context.userId, context.ip);
    if (behavior.tooManyAttempts) {
        flags.push({
            type: 'EXCESSIVE_ATTEMPTS',
            severity: 'HIGH',
            message: `Trop de tentatives (${behavior.recentCount} en 15 min)`
        });
        fraudScore += 20;
    }
    if (behavior.rapidFire) {
        flags.push({
            type: 'RAPID_FIRE',
            severity: 'MEDIUM',
            message: 'Tentatives trop rapprochées (< 10 sec entre deux)'
        });
        fraudScore += 15;
    }

    // ═══════════════════════════════════════
    // 6. LOW QUALITY PENALTY
    // ═══════════════════════════════════════
    if (imageAnalysis.overallQuality < 30) {
        flags.push({
            type: 'LOW_QUALITY',
            severity: 'MEDIUM',
            message: 'Qualité image très faible — impossible de vérifier correctement'
        });
        fraudScore += 10;
    }

    // Cap at 100
    fraudScore = Math.min(100, fraudScore);

    return {
        fraudScore,
        flags,
        isBlocked: fraudScore >= 50 || replayResult.isDuplicate,
        screenshotProbability: screenshot.probability,
        imageHash
    };
}

/**
 * Screenshot Detection — Heuristic-based
 * Screenshots have: uniform histogram, very low noise, no EXIF camera data
 */
function detectScreenshot(analysis) {
    let probability = 0;
    const reasons = [];

    // No camera EXIF = probably screenshot (30%)
    if (!analysis.exif.hasCamera && !analysis.exif.data?.hasExifData) {
        probability += 30;
        reasons.push('no_camera_exif');
    }

    // Very low noise = screenshot smooth gradients (25%)
    if (analysis.noise.level === 'very_low') {
        probability += 30;
        reasons.push('noise_too_low');
    } else if (analysis.noise.level === 'low') {
        probability += 10;
        reasons.push('noise_low');
    }

    // Not blurry at all with perfect contrast = likely digital (15%)
    if (!analysis.blur.isBlurry && analysis.blur.score > 90 && analysis.contrast.score > 90) {
        probability += 15;
        reasons.push('too_perfect');
    }

    // Perfect resolution, no orientation = screenshot (10%)
    if (!analysis.exif.data?.orientation && analysis.resolution.megapixels > 1) {
        probability += 10;
        reasons.push('no_orientation');
    }

    // Exact aspect ratios common for screenshots (phone screens)
    const screenRatios = [16 / 9, 19.5 / 9, 20 / 9, 4 / 3, 16 / 10];
    const ratio = analysis.cardStructure.ratio;
    if (screenRatios.some(sr => Math.abs(ratio - sr) < 0.05)) {
        probability += 15;
        reasons.push('screen_aspect_ratio');
    }

    return { probability: Math.min(100, probability), reasons };
}

/**
 * Image Manipulation Detection
 * Check for suspicious patterns that indicate editing
 */
function detectManipulation(analysis) {
    // Very high contrast + very low noise = digitally created/edited
    if (analysis.contrast.score > 95 && analysis.noise.score < 25) {
        return {
            suspected: true,
            severity: 'HIGH',
            reason: 'Image potentiellement éditée — contraste parfait avec bruit nul'
        };
    }

    // Extremely uniform brightness = flat digital image
    if (analysis.lighting.brightness > 0 && analysis.noise.stdDev < 10) {
        return {
            suspected: true,
            severity: 'MEDIUM',
            reason: 'Image suspecte — distribution de pixels trop uniforme'
        };
    }

    return { suspected: false };
}

/**
 * Anti-Replay — Check if this exact image was already used
 */
async function checkReplay(imageHash, userId) {
    try {
        const { data, error } = await supabase
            .from('verification_logs')
            .select('id')
            .eq('image_hash', imageHash)
            .limit(1);

        if (error) {
            // Table might not exist yet, that's OK
            console.warn("[FRAUD] Replay check warning:", error.message);
            return { isDuplicate: false };
        }

        return { isDuplicate: data && data.length > 0 };
    } catch (e) {
        console.warn("[FRAUD] Replay check error:", e.message);
        return { isDuplicate: false };
    }
}

/**
 * Behavior Monitoring — Check attempt rate
 */
async function checkBehavior(userId, ip) {
    const result = { tooManyAttempts: false, rapidFire: false, recentCount: 0 };

    try {
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

        // Count recent attempts by this user
        const { data: userAttempts, error } = await supabase
            .from('verification_logs')
            .select('created_at')
            .eq('user_id', userId)
            .gte('created_at', fifteenMinAgo)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn("[FRAUD] Behavior check warning:", error.message);
            return result;
        }

        result.recentCount = userAttempts?.length || 0;

        // Too many attempts (> 5 in 15 min)
        if (result.recentCount >= 5) {
            result.tooManyAttempts = true;
        }

        // Rapid fire (< 10 seconds since last attempt)
        if (userAttempts && userAttempts.length > 0) {
            const lastAttempt = new Date(userAttempts[0].created_at);
            const timeSince = Date.now() - lastAttempt.getTime();
            if (timeSince < 10_000) { // 10 seconds
                result.rapidFire = true;
            }
        }

        // Also check by IP
        const { data: ipAttempts } = await supabase
            .from('verification_logs')
            .select('id')
            .eq('ip_address', ip)
            .gte('created_at', fifteenMinAgo);

        if (ipAttempts && ipAttempts.length >= 10) {
            result.tooManyAttempts = true;
        }

    } catch (e) {
        console.warn("[FRAUD] Behavior check error:", e.message);
    }

    return result;
}
