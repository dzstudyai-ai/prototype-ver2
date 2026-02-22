/**
 * ═══════════════════════════════════════════════════════════════
 * VIDEO TRUST SCORING — Trust score for video verification
 * ═══════════════════════════════════════════════════════════════
 * 
 * Weights (per user specification):
 *   OCR Agreement Accuracy:          50%
 *   Correct arithmetic of averages:  30%
 *   Video/temporal consistency:      20%
 * 
 * Tampering flags apply penalty deductions.
 * 
 * Thresholds:
 *   >= 85% → VERIFIED
 *   60-84% → PENDING REVIEW
 *   < 60%  → REJECTED
 */

import { calculateAverages } from './gradeOCRExtractor.js';
import { MODULE_NAME_MAP } from './gradeComparator.js';

const S3_COEFFICIENTS = {
    'Analyse 03': 5,
    'Algèbre 03': 3,
    'Économie d\'entreprise': 2,
    'Probabilité et Statistique 01': 4,
    'Anglais 02': 2,
    'SFSD': 4,
    'Architecture 02': 4,
    'Électronique Fondamentale 02': 4,
};

/**
 * Calculate video-based trust score
 * 
 * @param {Object} params
 * @param {Object} params.ocrAgreement - { agreements[], disagreements[], confidence }
 * @param {Object} params.extractedGrades - Final aggregated grades { module: { exam, td } }
 * @param {Object} params.portalGrades - Grades student entered { module: { exam, td } }
 * @param {Object} params.temporalResult - { consistency, flags[] }
 * @param {Object} params.tamperingResult - { tamperingProbability }
 * @param {Object} params.codeResult - { found, exact, confidence }
 * @returns {Object} { trustScore, status, breakdown, issues }
 */
export function calculateVideoTrustScore({
    ocrAgreement,
    extractedGrades,
    portalGrades,
    temporalResult,
    tamperingResult,
    codeResult
}) {
    const breakdown = {};
    const issues = [];
    let penalties = 0;

    // ─── 1. OCR Agreement Accuracy (50%) ───
    let ocrScore = 0;
    const ocrConfidence = ocrAgreement?.confidence || 0;

    if (ocrConfidence >= 90) {
        ocrScore = 50;
    } else if (ocrConfidence >= 75) {
        ocrScore = 40;
    } else if (ocrConfidence >= 60) {
        ocrScore = 30;
    } else if (ocrConfidence >= 40) {
        ocrScore = 20;
    } else if (ocrConfidence >= 20) {
        ocrScore = 10;
    } else {
        ocrScore = 0;
        issues.push(`Faible accord OCR: ${ocrConfidence}%`);
    }

    const disagreementCount = ocrAgreement?.disagreements?.length || 0;
    if (disagreementCount > 3) {
        const penalty = Math.min(15, disagreementCount * 3);
        ocrScore = Math.max(0, ocrScore - penalty);
        issues.push(`${disagreementCount} modules en désaccord entre les moteurs OCR`);
    }

    breakdown.ocrAgreement = {
        score: ocrScore,
        max: 50,
        details: { confidence: ocrConfidence, disagreements: disagreementCount }
    };

    // ─── 2. Arithmetic Accuracy (30%) ───
    let arithmeticScore = 0;

    if (extractedGrades && portalGrades) {
        // Calculate expected averages from extracted grades
        const extractedForCalc = {};
        for (const [module, data] of Object.entries(extractedGrades)) {
            const dbName = MODULE_NAME_MAP[module] || module;
            extractedForCalc[dbName] = {
                exam: data.exam,
                td: data.td,
                coefficient: S3_COEFFICIENTS[dbName] || 1,
                hasTD: data.hasTD ?? true
            };
        }

        const calculated = calculateAverages(extractedForCalc);

        // Compare with portal averages
        if (calculated && calculated.modules) {
            const portalForCalc = {};
            for (const [module, data] of Object.entries(portalGrades)) {
                portalForCalc[module] = {
                    exam: data.exam ?? data.examScore,
                    td: data.td ?? data.tdScore,
                    coefficient: S3_COEFFICIENTS[module] || 1,
                    hasTD: S3_COEFFICIENTS[module] === 2 && module === 'Anglais 02' ? false : true // Logic for hasTD
                };
            }
            const portalCalc = calculateAverages(portalForCalc);

            // Compare semester averages
            if (calculated.semesterAverage && portalCalc?.semesterAverage) {
                const diff = Math.abs(calculated.semesterAverage - portalCalc.semesterAverage);

                if (diff <= 0.5) {
                    arithmeticScore = 30;
                } else if (diff <= 1.0) {
                    arithmeticScore = 22;
                } else if (diff <= 2.0) {
                    arithmeticScore = 15;
                } else if (diff <= 3.0) {
                    arithmeticScore = 8;
                    issues.push(`Différence de moyenne: ${diff.toFixed(2)} points`);
                } else {
                    arithmeticScore = 0;
                    issues.push(`Différence de moyenne importante: ${diff.toFixed(2)} points`);
                }
            } else {
                arithmeticScore = 10; // Partial — couldn't compare fully
                issues.push('Impossible de calculer la moyenne complète');
            }
        } else {
            arithmeticScore = 5;
            issues.push('Données insuffisantes pour vérifier les calculs');
        }
    } else {
        arithmeticScore = 0;
        issues.push('Notes non disponibles pour comparaison');
    }

    breakdown.arithmeticAccuracy = {
        score: arithmeticScore,
        max: 30,
        details: { extractedModules: Object.keys(extractedGrades || {}).length }
    };

    // ─── 3. Video/Temporal Consistency (20%) ───
    let temporalScore = 0;
    const consistency = temporalResult?.consistency || 0;
    const flagCount = temporalResult?.flags?.length || 0;

    if (consistency >= 90 && flagCount === 0) {
        temporalScore = 20;
    } else if (consistency >= 75) {
        temporalScore = 15;
    } else if (consistency >= 60) {
        temporalScore = 10;
    } else if (consistency >= 40) {
        temporalScore = 5;
    } else {
        temporalScore = 0;
        issues.push(`Consistance temporelle faible: ${consistency}%`);
    }

    // Penalty for suspicious fluctuations
    if (flagCount > 0) {
        const flagPenalty = Math.min(10, flagCount * 3);
        temporalScore = Math.max(0, temporalScore - flagPenalty);
        issues.push(`${flagCount} fluctuation(s) suspecte(s) détectée(s)`);
    }

    breakdown.temporalConsistency = {
        score: temporalScore,
        max: 20,
        details: { consistency, flags: flagCount }
    };

    // ─── Tampering Penalties ───
    const tamperProb = tamperingResult?.tamperingProbability || 0;
    if (tamperProb >= 60) {
        penalties += 20;
        issues.push(`Manipulation probable détectée: ${tamperProb}%`);
    } else if (tamperProb >= 40) {
        penalties += 10;
        issues.push(`Signes de manipulation possibles: ${tamperProb}%`);
    } else if (tamperProb >= 25) {
        penalties += 5;
    }

    // ─── Code Penalty ───
    if (!codeResult?.found) {
        penalties += 15;
        issues.push('Code de vérification non trouvé dans la vidéo');
    } else if (codeResult.expired) {
        penalties += 20;
        issues.push('Code de vérification expiré');
    } else if (!codeResult.exact && codeResult.confidence < 70) {
        penalties += 8;
        issues.push('Code de vérification partiellement détecté');
    }

    breakdown.penalties = {
        total: penalties,
        details: { tamperingProbability: tamperProb, codeFound: codeResult?.found }
    };

    // ─── Total ───
    const rawScore = ocrScore + arithmeticScore + temporalScore;
    const trustScore = Math.max(0, Math.min(100, rawScore - penalties));

    let status;
    if (trustScore >= 85) {
        status = 'VERIFIED';
    } else if (trustScore >= 60) {
        status = 'PENDING';
    } else {
        status = 'REJECTED';
    }

    console.log(`[VIDEO-TRUST] Score: ${trustScore}/100 (raw: ${rawScore}, penalties: -${penalties}) → ${status}`);
    console.log(`[VIDEO-TRUST] OCR: ${ocrScore}/50, Arithmetic: ${arithmeticScore}/30, Temporal: ${temporalScore}/20`);

    return {
        trustScore,
        status,
        breakdown,
        issues,
        penalties
    };
}

/**
 * Get status message in French
 */
export function getVideoStatusMessage(status, score) {
    switch (status) {
        case 'VERIFIED':
            return `✅ Notes vérifiées par vidéo avec succès (confiance: ${score}%)`;
        case 'PENDING':
            return `⏳ Vérification en attente de révision manuelle (confiance: ${score}%)`;
        case 'REJECTED':
            return `❌ Vérification rejetée — notes non confirmées (confiance: ${score}%)`;
        default:
            return `Statut inconnu`;
    }
}
