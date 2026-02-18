/**
 * TRUST SCORING ENGINE — Score de confiance 0-100
 * 
 * Combines 5 sub-scores:
 *   OCR Confidence   (25 pts max)
 *   QR Validity      (25 pts max)
 *   Image Quality    (20 pts max)
 *   Metadata Trust   (15 pts max)
 *   Fraud Penalty    (15 pts max, subtracted)
 */

/**
 * Calculate trust score from all verification data
 * @param {Object} params
 * @param {Object} params.ocrResults  - { nameFound, prenomFound, matriculeMatch, ocrConfidence }
 * @param {Object} params.qrResults   - { qrFound }
 * @param {Object} params.imageAnalysis - from imageProcessor.analyzeImage()
 * @param {Object} params.fraudResults - from fraudDetector.detectFraud()
 * @param {Object} params.dbResults   - { studentExists }
 * @returns {Object} { totalScore, status, subScores, breakdown }
 */
export function calculateTrustScore({ ocrResults, qrResults, imageAnalysis, fraudResults, dbResults }) {
    const subScores = {
        ocr: calculateOCRScore(ocrResults),
        qr: calculateQRScore(qrResults),
        imageQuality: calculateImageScore(imageAnalysis),
        metadata: calculateMetadataScore(imageAnalysis),
        fraudPenalty: calculateFraudPenalty(fraudResults)
    };

    // DB bonus: if student exists in database, strong boost
    const dbBonus = dbResults.studentExists ? 10 : 0;

    const rawTotal = subScores.ocr.score
        + subScores.qr.score
        + subScores.imageQuality.score
        + subScores.metadata.score
        + dbBonus
        - subScores.fraudPenalty.penalty;

    const totalScore = Math.max(0, Math.min(100, Math.round(rawTotal)));

    // Determine status
    let status;
    if (fraudResults.isBlocked) {
        status = 'REJECTED';
    } else if (totalScore >= 65) {
        status = 'VALID';
    } else if (totalScore >= 40) {
        status = 'SUSPICIOUS';
    } else {
        status = 'REJECTED';
    }

    return {
        totalScore,
        status,
        subScores: {
            ocr: subScores.ocr.score,
            qr: subScores.qr.score,
            imageQuality: subScores.imageQuality.score,
            metadata: subScores.metadata.score,
            dbBonus,
            fraudPenalty: subScores.fraudPenalty.penalty
        },
        breakdown: {
            ocr: subScores.ocr.details,
            qr: subScores.qr.details,
            imageQuality: subScores.imageQuality.details,
            metadata: subScores.metadata.details,
            fraud: subScores.fraudPenalty.details
        }
    };
}

/**
 * OCR Confidence Score (max 35 pts)
 */
function calculateOCRScore(ocr) {
    let score = 0;
    const details = [];

    if (ocr.nameFound) {
        score += 8;
        details.push('nom_found');
    }
    if (ocr.prenomFound) {
        score += 8;
        details.push('prenom_found');
    }
    // Boosted weight for matricule match on virtual cards
    if (ocr.matriculeMatch) {
        score += 15;
        details.push('matricule_match');
    }

    // Confidence bonus from Tesseract
    if (ocr.ocrConfidence && ocr.ocrConfidence > 60) {
        const bonus = Math.min(5, Math.round((ocr.ocrConfidence - 60) / 10));
        // Already capped at 35 total
    }

    return { score: Math.min(35, score), details };
}

/**
 * QR Validity Score (max 25 pts -> boosted to 30)
 */
function calculateQRScore(qr) {
    let score = 0;
    const details = [];

    if (qr.qrFound) {
        score += 15;
        details.push('qr_detected');

        // QR contains valid URL structure
        if (qr.qrContent && (qr.qrContent.includes('http') || qr.qrContent.includes('checkInscription'))) {
            score += 5;
            details.push('valid_url');
        }

        // QR matches the input ID (STRONG signal)
        if (qr.inputMatch) {
            score += 15;
            details.push('qr_match_input');
        }
    }

    return { score: Math.min(30, score), details };
}

/**
 * Image Quality Score (max 20 pts)
 */
function calculateImageScore(analysis) {
    let score = 0;
    const details = [];

    // Based on overall quality from imageProcessor
    const q = analysis.overallQuality || 50;

    if (q >= 70) {
        score = 18;
        details.push('high_quality');
    } else if (q >= 50) {
        score = 12;
        details.push('medium_quality');
    } else if (q >= 30) {
        score = 6;
        details.push('low_quality');
    } else {
        score = 2;
        details.push('very_low_quality');
    }

    // Resolution bonus
    if (analysis.resolution.sufficient) {
        score += 2;
        details.push('good_resolution');
    }

    return { score: Math.min(20, score), details };
}

/**
 * Metadata Trust Score (max 15 pts)
 */
function calculateMetadataScore(analysis) {
    let score = 0;
    const details = [];

    // Has camera EXIF = real photo
    if (analysis.exif.hasCamera) {
        score += 8;
        details.push('camera_exif');
    }

    // Has EXIF data at all
    if (analysis.exif.data?.hasExifData) {
        score += 4;
        details.push('has_exif');
    }

    // Card aspect ratio is valid
    if (analysis.cardStructure.aspectRatioValid) {
        score += 3;
        details.push('valid_card_ratio');
    }

    return { score: Math.min(15, score), details };
}

/**
 * Fraud Penalty (0-100 pts subtracted based on fraud score)
 */
function calculateFraudPenalty(fraud) {
    // Convert fraud score (0-100) to penalty points
    const penalty = Math.round(fraud.fraudScore * 0.4); // Max 40 pts penalty
    const details = fraud.flags.map(f => f.type);

    return { penalty, details };
}

/**
 * Get human-readable status description
 */
export function getStatusMessage(status, score) {
    switch (status) {
        case 'VALID':
            return `✅ Vérification réussie (confiance: ${score}/100)`;
        case 'SUSPICIOUS':
            return `⚠️ Vérification suspecte (confiance: ${score}/100) — veuillez réessayer avec une meilleure photo`;
        case 'REJECTED':
            return `❌ Vérification rejetée (confiance: ${score}/100)`;
        default:
            return `Statut inconnu`;
    }
}
