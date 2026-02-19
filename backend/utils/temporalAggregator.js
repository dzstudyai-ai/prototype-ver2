/**
 * ═══════════════════════════════════════════════════════════════
 * TEMPORAL AGGREGATOR — Cross-frame grade consistency
 * ═══════════════════════════════════════════════════════════════
 * 
 * Pipeline:
 *   1. Collect per-frame consensus grades
 *   2. Majority vote across all frames for each module
 *   3. Detect improbable fluctuations (e.g., 0→20 between frames)
 *   4. Compute consistency score
 */

/**
 * Aggregate grades across multiple frames using majority vote
 * 
 * @param {Array} frameResults - Array of { frameIndex, timestamp, consensus: { consensusGrades } }
 * @returns {Object} { finalGrades, consistency, flags[], framesAnalyzed }
 */
export function aggregateTemporalResults(frameResults) {
    if (!frameResults || frameResults.length === 0) {
        return { finalGrades: {}, consistency: 0, flags: [], framesAnalyzed: 0 };
    }

    // Collect all observed module grades across frames
    const moduleObservations = {}; // { moduleName: [{ frame, exam, td }] }

    for (const frame of frameResults) {
        const grades = frame.consensus?.consensusGrades || {};
        for (const [module, data] of Object.entries(grades)) {
            if (!moduleObservations[module]) moduleObservations[module] = [];
            moduleObservations[module].push({
                frameIndex: frame.frameIndex,
                timestamp: frame.timestamp,
                exam: data.exam,
                td: data.td,
                certainty: data.certainty
            });
        }
    }

    const finalGrades = {};
    const flags = [];
    let totalConsistency = 0;
    let moduleCount = 0;

    for (const [module, observations] of Object.entries(moduleObservations)) {
        // ─── Majority Vote for Exam ───
        const examVotes = observations.map(o => o.exam).filter(v => v !== null && v !== undefined);
        const tdVotes = observations.map(o => o.td).filter(v => v !== null && v !== undefined);

        const examResult = majorityVote(examVotes);
        const tdResult = majorityVote(tdVotes);

        finalGrades[module] = {
            exam: examResult.value,
            td: tdResult.value,
            examConsistency: examResult.consistency,
            tdConsistency: tdResult.consistency,
            framesFound: observations.length
        };

        // ─── Detect Fluctuations ───
        const examFluc = detectFluctuations(observations.map(o => ({ value: o.exam, frame: o.frameIndex, ts: o.timestamp })));
        const tdFluc = detectFluctuations(observations.map(o => ({ value: o.td, frame: o.frameIndex, ts: o.timestamp })));

        if (examFluc.length > 0) {
            flags.push({ module, type: 'exam', fluctuations: examFluc, severity: 'high' });
        }
        if (tdFluc.length > 0) {
            flags.push({ module, type: 'td', fluctuations: tdFluc, severity: 'high' });
        }

        // Average consistency for this module
        totalConsistency += (examResult.consistency + tdResult.consistency) / 2;
        moduleCount++;
    }

    const consistency = moduleCount > 0 ? Math.round(totalConsistency / moduleCount) : 0;

    console.log(`[TEMPORAL] Aggregated ${Object.keys(finalGrades).length} modules from ${frameResults.length} frames`);
    console.log(`[TEMPORAL] Consistency: ${consistency}%, Flags: ${flags.length}`);

    return {
        finalGrades,
        consistency,
        flags,
        framesAnalyzed: frameResults.length
    };
}

/**
 * Majority vote from an array of numeric values
 * @param {Array<number>} values
 * @returns {{ value: number|null, consistency: number }}
 */
function majorityVote(values) {
    if (values.length === 0) return { value: null, consistency: 0 };

    // Group values with ±0.5 tolerance
    const groups = {};
    for (const v of values) {
        const key = Math.round(v * 2) / 2;
        groups[key] = (groups[key] || 0) + 1;
    }

    // Find the most frequent value
    let bestKey = null;
    let bestCount = 0;
    for (const [key, count] of Object.entries(groups)) {
        if (count > bestCount) {
            bestKey = parseFloat(key);
            bestCount = count;
        }
    }

    const consistency = Math.round((bestCount / values.length) * 100);
    return { value: bestKey, consistency };
}

/**
 * Detect improbable grade fluctuations across frames
 * A fluctuation is suspicious if a grade changes by more than 2 points between consecutive frames
 * 
 * @param {Array} observations - Array of { value, frame, ts }
 * @returns {Array} Array of detected fluctuations
 */
export function detectFluctuations(observations) {
    const valid = observations.filter(o => o.value !== null && o.value !== undefined);
    if (valid.length < 2) return [];

    const sorted = valid.sort((a, b) => a.frame - b.frame);
    const fluctuations = [];

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const diff = Math.abs(curr.value - prev.value);

        if (diff > 2) {
            fluctuations.push({
                fromFrame: prev.frame,
                toFrame: curr.frame,
                fromValue: prev.value,
                toValue: curr.value,
                change: diff,
                suspicious: diff > 5 // Very suspicious if >5 point jump
            });
        }
    }

    return fluctuations;
}

/**
 * Cross-check extracted grades with what the student entered in the portal
 * 
 * @param {Object} extractedGrades - Final aggregated grades { moduleName: { exam, td } }
 * @param {Array} portalGrades - Array of { subject, examScore, tdScore } from the portal
 * @returns {Object} { matches[], mismatches[], missing[], suspicious[] }
 */
export function crossCheckWithPortal(extractedGrades, portalGrades) {
    const matches = [];
    const mismatches = [];
    const missing = [];
    const suspicious = [];

    // Build portal lookup
    const portalLookup = {};
    for (const g of portalGrades) {
        portalLookup[g.subject] = { exam: g.examScore, td: g.tdScore };
    }

    // Check each extracted module against portal data
    for (const [module, data] of Object.entries(extractedGrades)) {
        const portal = portalLookup[module];

        if (!portal) {
            missing.push({ module, status: 'not_in_portal', extracted: data });
            continue;
        }

        const examMatch = data.exam !== null && Math.abs(data.exam - portal.exam) <= 0.5;
        const tdMatch = data.td !== null && Math.abs(data.td - portal.td) <= 0.5;

        if (examMatch && tdMatch) {
            matches.push({ module, extracted: data, portal });
        } else {
            const entry = { module, extracted: data, portal };

            if (!examMatch && data.exam !== null) {
                entry.examDiff = Math.abs(data.exam - portal.exam);
            }
            if (!tdMatch && data.td !== null) {
                entry.tdDiff = Math.abs(data.td - portal.td);
            }

            mismatches.push(entry);

            // Flag as suspicious if difference is large (>3 points)
            if ((entry.examDiff && entry.examDiff > 3) || (entry.tdDiff && entry.tdDiff > 3)) {
                suspicious.push({
                    module,
                    reason: 'large_discrepancy',
                    ...entry
                });
            }
        }
    }

    // Check for portal grades not found in video
    for (const [module, portal] of Object.entries(portalLookup)) {
        if (!extractedGrades[module]) {
            missing.push({ module, status: 'not_in_video', portal });
        }
    }

    console.log(`[CROSS-CHECK] Matches: ${matches.length}, Mismatches: ${mismatches.length}, Missing: ${missing.length}, Suspicious: ${suspicious.length}`);

    return { matches, mismatches, missing, suspicious };
}
