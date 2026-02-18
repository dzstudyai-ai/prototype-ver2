/**
 * ═══════════════════════════════════════════════════════════════
 * GRADE OCR EXTRACTOR — Extract & validate grades from Progrès screenshots
 * ═══════════════════════════════════════════════════════════════
 * 
 * Responsibilities:
 *   1. Parse OCR text to find module names (fuzzy match)
 *   2. Extract associated grades (exam + TD)
 *   3. Validate grade structure against S3 official list
 *   4. Detect missing/extra modules
 *   5. Validate grade ranges and decimal format
 */

// Official S3 module definitions
const S3_MODULES = [
    { name: 'Probabilités et Statistiques 01', aliases: ['probabilit', 'statistique', 'proba', 'prob stat'], coefficient: 4, hasTD: true },
    { name: 'Économie d\'entreprise', aliases: ['economie', 'économie', 'entreprise', 'eco entreprise'], coefficient: 2, hasTD: true },
    { name: 'Anglais 02', aliases: ['anglais', 'english'], coefficient: 2, hasTD: false },
    { name: 'Électronique Fondamentale 02', aliases: ['electronique', 'électronique', 'fondamentale'], coefficient: 4, hasTD: true },
    { name: 'SFSD', aliases: ['sfsd', 'structure fichier', 'structures de donn', 'fichiers'], coefficient: 4, hasTD: true },
    { name: 'Analyse 03', aliases: ['analyse math', 'analyse 3', 'analyse 03', 'analyse'], coefficient: 5, hasTD: true },
    { name: 'Architecture 02', aliases: ['architecture', 'ordinateur', 'arch 02', 'arch 2'], coefficient: 4, hasTD: true },
    { name: 'Algèbre 03', aliases: ['algèbre', 'algebre', 'algébre', 'alg 03', 'alg 3'], coefficient: 3, hasTD: true },
];

// Modules that may legitimately have empty grades
const ALLOWED_EMPTY = [
    { module: 'Anglais 02', field: 'exam' },
    { module: 'Économie d\'entreprise', field: 'exam' },
    { module: 'Économie d\'entreprise', field: 'td' },
    { module: 'Probabilités et Statistiques 01', field: 'td' },
];

/**
 * Levenshtein distance for fuzzy matching
 */
function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Calculate similarity percentage between two strings
 */
function similarity(a, b) {
    const aLow = a.toLowerCase().trim();
    const bLow = b.toLowerCase().trim();
    const maxLen = Math.max(aLow.length, bLow.length);
    if (maxLen === 0) return 100;
    const dist = levenshtein(aLow, bLow);
    return Math.round((1 - dist / maxLen) * 100);
}

/**
 * Try to match an OCR line to a known module
 */
function matchModule(ocrText) {
    const normalized = ocrText.toLowerCase().trim();

    for (const mod of S3_MODULES) {
        // Direct name match (fuzzy 85%)
        if (similarity(normalized, mod.name.toLowerCase()) >= 85) {
            return mod;
        }
        // Alias match
        for (const alias of mod.aliases) {
            if (normalized.includes(alias.toLowerCase())) {
                return mod;
            }
        }
    }
    return null;
}

/**
 * Extract grades from OCR text
 * @param {string} ocrText - Full OCR text from Tesseract
 * @returns {Object} extraction results
 */
export function extractGrades(ocrText) {
    const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const extractedGrades = {};
    const issues = [];
    const modulesFound = [];

    console.log('[GRADE-OCR] Parsing', lines.length, 'lines');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const matched = matchModule(line);

        if (matched) {
            modulesFound.push(matched.name);

            // Look for grades in the same line and next lines
            const gradeContext = [line, lines[i + 1] || '', lines[i + 2] || ''].join(' ');
            const gradeNumbers = gradeContext.match(/\b(\d{1,2}[.,]\d{1,2})\b|\b(\d{1,2})\b/g);

            let examGrade = null;
            let tdGrade = null;

            if (gradeNumbers) {
                const validGrades = gradeNumbers
                    .map(g => parseFloat(g.replace(',', '.')))
                    .filter(g => g >= 0 && g <= 20);

                // First valid grade is typically exam, second is TD
                if (validGrades.length >= 1) examGrade = validGrades[0];
                if (validGrades.length >= 2 && matched.hasTD) tdGrade = validGrades[1];
            }

            extractedGrades[matched.name] = {
                exam: examGrade,
                td: tdGrade,
                coefficient: matched.coefficient,
                hasTD: matched.hasTD
            };

            console.log(`[GRADE-OCR] Found: ${matched.name} → exam=${examGrade}, td=${tdGrade}`);
        }
    }

    return {
        grades: extractedGrades,
        modulesFound,
        issues,
        lineCount: lines.length
    };
}

/**
 * Validate extracted grade structure against S3 requirements
 * @param {Object} extractedGrades - From extractGrades()
 * @returns {Object} validation results
 */
export function validateGradeStructure(extractedGrades) {
    const issues = [];
    let structureScore = 100;

    // Check all 8 modules present
    const foundNames = Object.keys(extractedGrades);
    const missingModules = S3_MODULES.filter(m => !foundNames.includes(m.name));
    const extraModules = foundNames.filter(name => !S3_MODULES.find(m => m.name === name));

    if (missingModules.length > 0) {
        const penalty = missingModules.length * 12;
        structureScore -= penalty;
        issues.push({
            type: 'MISSING_MODULES',
            severity: 'HIGH',
            message: `Modules manquants: ${missingModules.map(m => m.name).join(', ')}`,
            count: missingModules.length
        });
    }

    if (extraModules.length > 0) {
        structureScore -= 15;
        issues.push({
            type: 'EXTRA_MODULES',
            severity: 'MEDIUM',
            message: `Modules non reconnus: ${extraModules.join(', ')}`,
            count: extraModules.length
        });
    }

    // Check grade ranges and mandatory fields
    for (const [moduleName, grade] of Object.entries(extractedGrades)) {
        const moduleDef = S3_MODULES.find(m => m.name === moduleName);
        if (!moduleDef) continue;

        // Exam grade validation
        if (grade.exam !== null) {
            if (grade.exam < 0 || grade.exam > 20) {
                structureScore -= 10;
                issues.push({
                    type: 'INVALID_GRADE_RANGE',
                    severity: 'HIGH',
                    message: `${moduleName}: note exam ${grade.exam} hors limites [0-20]`
                });
            }
        } else {
            // Check if this module is allowed to be empty
            const isAllowed = ALLOWED_EMPTY.some(a => a.module === moduleName && a.field === 'exam');
            if (!isAllowed) {
                structureScore -= 5;
                issues.push({
                    type: 'MISSING_GRADE',
                    severity: 'MEDIUM',
                    message: `${moduleName}: note exam manquante`
                });
            }
        }

        // TD grade validation
        if (moduleDef.hasTD) {
            if (grade.td !== null) {
                if (grade.td < 0 || grade.td > 20) {
                    structureScore -= 10;
                    issues.push({
                        type: 'INVALID_GRADE_RANGE',
                        severity: 'HIGH',
                        message: `${moduleName}: note TD ${grade.td} hors limites [0-20]`
                    });
                }
            } else {
                const isAllowed = ALLOWED_EMPTY.some(a => a.module === moduleName && a.field === 'td');
                if (!isAllowed) {
                    structureScore -= 5;
                    issues.push({
                        type: 'MISSING_GRADE',
                        severity: 'MEDIUM',
                        message: `${moduleName}: note TD manquante`
                    });
                }
            }
        }

        // Coefficient validation
        if (moduleDef && grade.coefficient !== moduleDef.coefficient) {
            structureScore -= 8;
            issues.push({
                type: 'WRONG_COEFFICIENT',
                severity: 'HIGH',
                message: `${moduleName}: coefficient ${grade.coefficient} au lieu de ${moduleDef.coefficient}`
            });
        }
    }

    return {
        valid: structureScore >= 60,
        structureScore: Math.max(0, structureScore),
        modulesExpected: S3_MODULES.length,
        modulesFound: foundNames.length,
        missingModules: missingModules.map(m => m.name),
        extraModules,
        issues
    };
}

/**
 * Check if verification code is present in OCR text
 * @param {string} ocrText - Full OCR text
 * @param {string} expectedCode - The expected code (e.g., "AG-S3-48291")
 * @returns {Object} code verification result
 */
export function findVerificationCode(ocrText, expectedCode) {
    const normalized = ocrText.replace(/\s+/g, ' ').toUpperCase();
    const codeUpper = expectedCode.toUpperCase();

    // Exact match
    if (normalized.includes(codeUpper)) {
        return { found: true, exact: true, confidence: 100 };
    }

    // Try without dashes (OCR might miss them)
    const codePlain = codeUpper.replace(/-/g, '');
    const textPlain = normalized.replace(/-/g, '');
    if (textPlain.includes(codePlain)) {
        return { found: true, exact: false, confidence: 90 };
    }

    // Fuzzy match — check each segment
    const segments = codeUpper.split('-');
    let segmentsFound = 0;
    for (const seg of segments) {
        if (normalized.includes(seg)) segmentsFound++;
    }

    if (segmentsFound === segments.length) {
        return { found: true, exact: false, confidence: 75 };
    }

    if (segmentsFound >= 2) {
        return { found: true, exact: false, confidence: 50 };
    }

    return { found: false, exact: false, confidence: 0 };
}

/**
 * Merge TD and Exam extractions from two separate images
 * @param {Object} tdExtraction - extractGrades() result from TD screenshot
 * @param {Object} examExtraction - extractGrades() result from Exam screenshot
 * @returns {Object} merged grades
 */
export function mergeGrades(tdExtraction, examExtraction) {
    const merged = {};
    const allModules = new Set([
        ...Object.keys(tdExtraction.grades),
        ...Object.keys(examExtraction.grades)
    ]);

    for (const moduleName of allModules) {
        const tdData = tdExtraction.grades[moduleName] || {};
        const examData = examExtraction.grades[moduleName] || {};
        const moduleDef = S3_MODULES.find(m => m.name === moduleName);

        merged[moduleName] = {
            td: tdData.td ?? tdData.exam ?? null,       // TD screenshot: first number is typically TD
            exam: examData.exam ?? null,                  // Exam screenshot: first number is exam
            coefficient: moduleDef?.coefficient ?? tdData.coefficient ?? examData.coefficient ?? 1,
            hasTD: moduleDef?.hasTD ?? true
        };
    }

    return {
        grades: merged,
        modulesFound: [...allModules],
        tdModulesFound: Object.keys(tdExtraction.grades),
        examModulesFound: Object.keys(examExtraction.grades)
    };
}

/**
 * Calculate module averages and semester average
 * Formula: Module avg = (TD * td_coef + Exam * exam_coef) / (td_coef + exam_coef)
 * Semester avg = sum(module_avg * coefficient) / sum(coefficients)
 * 
 * For S3: TD weight = 0.40, Exam weight = 0.60
 * Modules without TD: average = exam grade
 * 
 * @param {Object} grades - Merged grades object
 * @returns {Object} averages result
 */
export function calculateAverages(grades) {
    const TD_WEIGHT = 0.40;
    const EXAM_WEIGHT = 0.60;
    const moduleAverages = {};
    let totalWeightedSum = 0;
    let totalCoef = 0;

    for (const [moduleName, grade] of Object.entries(grades)) {
        const coef = grade.coefficient || 1;
        let avg = null;

        if (grade.hasTD && grade.td !== null && grade.exam !== null) {
            avg = parseFloat(((grade.td * TD_WEIGHT + grade.exam * EXAM_WEIGHT)).toFixed(2));
        } else if (grade.exam !== null) {
            avg = grade.exam;
        } else if (grade.td !== null) {
            avg = grade.td;
        }

        moduleAverages[moduleName] = {
            td: grade.td,
            exam: grade.exam,
            average: avg,
            coefficient: coef
        };

        if (avg !== null) {
            totalWeightedSum += avg * coef;
            totalCoef += coef;
        }
    }

    const semesterAverage = totalCoef > 0 ? parseFloat((totalWeightedSum / totalCoef).toFixed(2)) : null;

    return {
        modules: moduleAverages,
        semesterAverage,
        totalCoefficients: totalCoef,
        modulesCalculated: Object.values(moduleAverages).filter(m => m.average !== null).length
    };
}

export { S3_MODULES, ALLOWED_EMPTY };
