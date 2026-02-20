/**
 * ═══════════════════════════════════════════════════════════════
 * GRADE COMPARATOR — Compare OCR-extracted grades vs user-entered grades
 * ═══════════════════════════════════════════════════════════════
 * 
 * Scoring: 1 point per correct grade slot → /15 total
 * Threshold: ≥14/15 to pass
 * 
 * Mandatory: ALL grades EXCEPT TD Probabilités
 * If any mandatory grade mismatches → instant REJECTED
 * 
 * Tolerance: ±0.5 for OCR rounding errors
 */

// Module name mapping: OCR extractor names → DB subject names
const MODULE_NAME_MAP = {
    'Analyse 03': 'Analyse 03',
    'Algèbre 03': 'Algèbre 03',
    'SFSD': 'SFSD',
    'Architecture 02': 'Architecture 02',
    'Électronique Fondamentale 02': 'Électronique Fondamentale 02',
    'Probabilités et Statistiques 01': 'Probabilité et Statistique 01',
    'Économie d\'entreprise': 'Économie d\'entreprise',
    'Anglais 02': 'Anglais 02',
};

// Define which grade slots exist for each module and if they're mandatory
const GRADE_SLOTS = [
    { module: 'Analyse 03', type: 'exam', mandatory: true, coefficient: 5 },
    { module: 'Analyse 03', type: 'td', mandatory: true, coefficient: 5 },
    { module: 'Algèbre 03', type: 'exam', mandatory: true, coefficient: 3 },
    { module: 'Algèbre 03', type: 'td', mandatory: true, coefficient: 3 },
    { module: 'SFSD', type: 'exam', mandatory: true, coefficient: 4 },
    { module: 'SFSD', type: 'td', mandatory: true, coefficient: 4 },
    { module: 'Architecture 02', type: 'exam', mandatory: true, coefficient: 4 },
    { module: 'Architecture 02', type: 'td', mandatory: true, coefficient: 4 },
    { module: 'Électronique Fondamentale 02', type: 'exam', mandatory: true, coefficient: 4 },
    { module: 'Électronique Fondamentale 02', type: 'td', mandatory: true, coefficient: 4 },
    { module: 'Probabilités et Statistiques 01', type: 'exam', mandatory: true, coefficient: 4 },
    { module: 'Probabilités et Statistiques 01', type: 'td', mandatory: false, coefficient: 4 }, // ONLY tolerated slot
    { module: 'Économie d\'entreprise', type: 'exam', mandatory: true, coefficient: 2 },
    { module: 'Économie d\'entreprise', type: 'td', mandatory: true, coefficient: 2 },
    { module: 'Anglais 02', type: 'exam', mandatory: true, coefficient: 2 },
    // Anglais has no TD → 15 total slots
];

const TOTAL_SLOTS = GRADE_SLOTS.length; // 15
const PASS_THRESHOLD = 14;
const TOLERANCE = 0.5; // ±0.5 for OCR rounding

/**
 * Compare extracted grades (from OCR) vs user-entered grades (from DB)
 * 
 * @param {Object} extractedGrades - From OCR: { "Analyse 03": { exam: 14.5, td: 12 }, ... }
 * @param {Array}  userGrades      - From DB grades table: [{ subject, exam_score, td_score }, ...]
 * @returns {Object} { score, total, passed, details[], mandatoryFailures[], summary }
 */
export function compareGrades(extractedGrades, userGrades) {
    // Build user grades lookup by subject name
    const userLookup = {};
    for (const g of userGrades) {
        userLookup[g.subject] = {
            exam: g.exam_score !== null && g.exam_score !== undefined ? parseFloat(g.exam_score) : null,
            td: g.td_score !== null && g.td_score !== undefined ? parseFloat(g.td_score) : null
        };
    }

    let score = 0;
    const details = [];
    const mandatoryFailures = [];

    console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║           GRADE COMPARISON — Credibility Check                      ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════╣');
    console.log('║ Module                          │ Type │  OCR  │  User │ Match │ Req ║');
    console.log('╠─────────────────────────────────┼──────┼───────┼───────┼───────┼─────╣');

    for (const slot of GRADE_SLOTS) {
        const ocrModuleName = slot.module;
        const dbSubjectName = MODULE_NAME_MAP[ocrModuleName] || ocrModuleName;

        // Get OCR value
        const ocrData = extractedGrades[ocrModuleName];
        const ocrValue = ocrData ? ocrData[slot.type] : null;

        // Get user-entered value
        const userData = userLookup[dbSubjectName];
        const userValue = userData ? userData[slot.type] : null;

        // Compare with tolerance
        let match = false;
        if (ocrValue !== null && userValue !== null) {
            match = Math.abs(ocrValue - userValue) <= TOLERANCE;
        } else if (ocrValue === null && userValue === null) {
            // Both null = match (no grade on either side)
            match = true;
        }
        // If OCR couldn't read but user entered a value → no match (unless non-mandatory)

        if (match) {
            score++;
        }

        const mandatoryLabel = slot.mandatory ? 'YES' : 'no';
        const matchLabel = match ? '✅' : '❌';
        const ocrDisplay = ocrValue !== null ? ocrValue.toFixed(1).padStart(5) : '  N/A';
        const userDisplay = userValue !== null ? userValue.toFixed(1).padStart(5) : '  N/A';
        const modulePadded = ocrModuleName.substring(0, 31).padEnd(31);
        const typePadded = slot.type.toUpperCase().padEnd(4);

        console.log(`║ ${modulePadded} │ ${typePadded} │ ${ocrDisplay} │ ${userDisplay} │  ${matchLabel}   │ ${mandatoryLabel.padEnd(3)} ║`);

        const detail = {
            module: ocrModuleName,
            dbSubject: dbSubjectName,
            type: slot.type,
            ocrValue,
            userValue,
            match,
            mandatory: slot.mandatory,
            coefficient: slot.coefficient
        };

        details.push(detail);

        // Track mandatory failures
        if (!match && slot.mandatory) {
            mandatoryFailures.push(detail);
        }
    }

    const passed = score >= PASS_THRESHOLD && mandatoryFailures.length === 0;
    const statusEmoji = passed ? '✅ PASSED' : '❌ REJECTED';

    console.log('╠═══════════════════════════════════════════════════════════════════════╣');
    console.log(`║ CREDIBILITY SCORE: ${score}/${TOTAL_SLOTS} — ${statusEmoji}`.padEnd(72) + '║');

    if (mandatoryFailures.length > 0) {
        console.log(`║ ⚠️  ${mandatoryFailures.length} mandatory grade(s) failed!`.padEnd(72) + '║');
        for (const f of mandatoryFailures) {
            const msg = `║   → ${f.module} ${f.type.toUpperCase()}: OCR=${f.ocrValue ?? 'N/A'} vs User=${f.userValue ?? 'N/A'}`;
            console.log(msg.padEnd(72) + '║');
        }
    }

    console.log('╚═══════════════════════════════════════════════════════════════════════╝');

    return {
        score,
        total: TOTAL_SLOTS,
        passed,
        threshold: PASS_THRESHOLD,
        mandatoryFailures,
        details,
        summary: `${score}/${TOTAL_SLOTS} — ${passed ? 'VALIDÉ' : 'REJETÉ'}${mandatoryFailures.length > 0 ? ` (${mandatoryFailures.length} note(s) obligatoire(s) incorrecte(s))` : ''}`
    };
}

export { GRADE_SLOTS, TOTAL_SLOTS, PASS_THRESHOLD, MODULE_NAME_MAP };
