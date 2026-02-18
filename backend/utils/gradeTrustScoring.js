/**
 * ═══════════════════════════════════════════════════════════════
 * GRADE TRUST SCORING — Trust score for grade screenshots
 * ═══════════════════════════════════════════════════════════════
 * 
 * Weights (as specified by user):
 *   Valid verification code:    40%
 *   OCR structure valid:        25%
 *   Correct module matching:    20%
 *   Low tampering probability:  15%
 * 
 * Thresholds:
 *   >= 85% → VERIFIED
 *   60-84% → PENDING REVIEW
 *   < 60%  → REJECTED
 */

/**
 * Calculate grade verification trust score
 * @param {Object} params
 * @param {Object} params.codeResult - { found, exact, confidence, expired }
 * @param {Object} params.structureResult - { valid, structureScore, modulesFound, modulesExpected }
 * @param {Object} params.tamperingResult - { tamperingProbability, summary }
 * @param {Array}  params.modulesFound - list of module names found
 * @returns {Object} { trustScore, status, breakdown, issues }
 */
export function calculateGradeTrustScore({ codeResult, structureResult, tamperingResult, modulesFound }) {
    const breakdown = {};
    const issues = [];

    // ─── 1. Verification Code (40%) ───
    let codeScore = 0;
    if (codeResult.expired) {
        codeScore = 0;
        issues.push('Code de vérification expiré');
    } else if (codeResult.found && codeResult.exact) {
        codeScore = 40;
    } else if (codeResult.found && codeResult.confidence >= 75) {
        codeScore = 30;
    } else if (codeResult.found && codeResult.confidence >= 50) {
        codeScore = 20;
    } else {
        codeScore = 0;
        issues.push('Code de vérification non trouvé dans l\'image');
    }
    breakdown.verificationCode = { score: codeScore, max: 40, details: codeResult };

    // ─── 2. OCR Structure (25%) ───
    let structureScore = 0;
    if (structureResult.valid && structureResult.structureScore >= 80) {
        structureScore = 25;
    } else if (structureResult.structureScore >= 60) {
        structureScore = 18;
    } else if (structureResult.structureScore >= 40) {
        structureScore = 10;
    } else {
        structureScore = 0;
        issues.push('Structure des notes invalide ou incomplète');
    }
    breakdown.ocrStructure = { score: structureScore, max: 25, details: { structureScore: structureResult.structureScore } };

    // ─── 3. Module Matching (20%) ───
    let moduleScore = 0;
    const expectedModules = 8; // S3 has 8 modules
    const foundCount = modulesFound?.length || 0;
    const matchRatio = foundCount / expectedModules;

    if (matchRatio >= 1.0) {
        moduleScore = 20;
    } else if (matchRatio >= 0.75) {
        moduleScore = 15;
    } else if (matchRatio >= 0.5) {
        moduleScore = 10;
    } else {
        moduleScore = Math.round(matchRatio * 10);
        issues.push(`Seulement ${foundCount}/${expectedModules} modules trouvés`);
    }
    breakdown.moduleMatching = { score: moduleScore, max: 20, details: { found: foundCount, expected: expectedModules, ratio: matchRatio } };

    // ─── 4. Tampering (15%) ───
    let tamperingScore = 0;
    const tamperProb = tamperingResult?.tamperingProbability || 50;

    if (tamperProb < 20) {
        tamperingScore = 15;
    } else if (tamperProb < 40) {
        tamperingScore = 10;
    } else if (tamperProb < 60) {
        tamperingScore = 5;
        issues.push(`Probabilité de manipulation: ${tamperProb}%`);
    } else {
        tamperingScore = 0;
        issues.push(`Manipulation d'image probable: ${tamperProb}%`);
    }
    breakdown.tampering = { score: tamperingScore, max: 15, details: { probability: tamperProb, summary: tamperingResult?.summary } };

    // ─── Total ───
    const trustScore = codeScore + structureScore + moduleScore + tamperingScore;

    let status;
    if (trustScore >= 85) {
        status = 'VERIFIED';
    } else if (trustScore >= 60) {
        status = 'PENDING';
    } else {
        status = 'REJECTED';
    }

    console.log(`[GRADE-TRUST] Score: ${trustScore}/100 → ${status}`);
    console.log(`[GRADE-TRUST] Code: ${codeScore}/40, Structure: ${structureScore}/25, Modules: ${moduleScore}/20, Tampering: ${tamperingScore}/15`);

    return {
        trustScore,
        status,
        breakdown,
        issues
    };
}

/**
 * Get status message in French
 */
export function getGradeStatusMessage(status, score) {
    switch (status) {
        case 'VERIFIED':
            return `✅ Notes vérifiées avec succès (confiance: ${score}%)`;
        case 'PENDING':
            return `⏳ Vérification en attente de révision (confiance: ${score}%)`;
        case 'REJECTED':
            return `❌ Vérification rejetée (confiance: ${score}%)`;
        default:
            return `Statut inconnu`;
    }
}
