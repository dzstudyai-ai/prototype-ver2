/**
 * ═══════════════════════════════════════════════════════════════
 * MULTI-OCR ENGINE — Tesseract + OCR.space with consensus
 * ═══════════════════════════════════════════════════════════════
 * 
 * Pipeline per frame:
 *   1. Run Tesseract.js (local, French + English)
 *   2. Run OCR.space API (cloud, French + English + Arabic)
 *   3. Extract grades from each engine's output
 *   4. Build consensus: ≥2 engines agree → accept
 */

import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { extractGrades, findVerificationCode } from './gradeOCRExtractor.js';

const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';

// ─── Multi-Key Load Balancer ────────────────────────────────
// Round-robin between multiple free OCR.space keys to double daily quota
const OCR_SPACE_KEYS = [
    'K81525746288957',
    'K88836846188957',
    process.env.OCR_SPACE_API_KEY // Optional 3rd key from env
].filter(Boolean); // Remove empty/undefined

let _keyIndex = 0;
const _keyUsage = {}; // Track usage per key

/**
 * Get next OCR.space API key (round-robin)
 * @returns {string|null} API key or null if none available
 */
function getNextKey() {
    if (OCR_SPACE_KEYS.length === 0) return null;
    const key = OCR_SPACE_KEYS[_keyIndex % OCR_SPACE_KEYS.length];
    _keyIndex++;
    _keyUsage[key] = (_keyUsage[key] || 0) + 1;
    const masked = key.slice(0, 4) + '...' + key.slice(-4);
    console.log(`[OCR-SPACE] Using key ${masked} (call #${_keyUsage[key]})`);
    return key;
}

// ─── Tesseract OCR ──────────────────────────────────────────

/**
 * Run Tesseract OCR on an image buffer
 * @param {Buffer} imageBuffer
 * @param {Object} [existingWorker] - Optional pre-warmed worker
 * @returns {Promise<{text: string, confidence: number, engine: string, words: Array}>}
 */
export async function runTesseract(imageBuffer, existingWorker = null) {
    let worker = existingWorker;
    let autoTerminate = false;

    try {
        const processed = await sharp(imageBuffer)
            .resize(1200, null, { withoutEnlargement: true })
            .grayscale()
            .normalize()
            .toBuffer();

        if (!worker) {
            worker = await createWorker('fra+eng');
            autoTerminate = true;
        }

        const { data } = await worker.recognize(processed);

        if (autoTerminate) await worker.terminate();

        return {
            text: data.text,
            confidence: data.confidence,
            engine: 'tesseract',
            // Return layout data for structural analysis
            words: data.words?.map(w => ({
                text: w.text,
                confidence: w.confidence,
                bbox: w.bbox // { x0, y0, x1, y1 }
            })) || []
        };
    } catch (err) {
        console.error('[OCR-TESSERACT] Error:', err.message);
        if (autoTerminate && worker) await worker.terminate().catch(() => { });
        return { text: '', confidence: 0, engine: 'tesseract', words: [] };
    }
}


// ─── OCR.space API ──────────────────────────────────────────

/**
 * Run OCR.space API on an image buffer
 * @param {Buffer} imageBuffer
 * @returns {Promise<{text: string, confidence: number, engine: string, overlay: Object}>}
 */
export async function runOCRSpace(imageBuffer) {
    const apiKey = getNextKey();
    if (!apiKey) return { text: '', confidence: 0, engine: 'ocrspace', overlay: null };

    try {
        const base64 = imageBuffer.toString('base64');
        const dataUri = `data:image/jpeg;base64,${base64}`;

        const response = await fetch(OCR_SPACE_URL, {
            method: 'POST',
            headers: {
                'apikey': apiKey,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                base64Image: dataUri,
                language: 'fre',
                isOverlayRequired: 'true', // REQUIRED for structural parsing
                detectOrientation: 'true',
                scale: 'true',
                OCREngine: '2'
            })
        });

        const result = await response.json();

        if (result.ParsedResults && result.ParsedResults.length > 0) {
            const parsed = result.ParsedResults[0];
            return {
                text: parsed.ParsedText || '',
                confidence: parsed.TextOverlay?.HasOverlay ? 85 : 60,
                engine: 'ocrspace',
                overlay: parsed.TextOverlay // Contains Lines with Words and coordinates
            };
        }

        return { text: '', confidence: 0, engine: 'ocrspace', overlay: null };

    } catch (err) {
        console.error('[OCR-SPACE] Error:', err.message);
        return { text: '', confidence: 0, engine: 'ocrspace', overlay: null };
    }
}

// ─── Multi-OCR Runner ───────────────────────────────────────

/**
 * Run all OCR engines on a single frame
 * @param {Buffer} imageBuffer
 * @param {Object} [worker] - Optional Tesseract worker
 * @returns {Promise<{results: Array, gradeExtractions: Array}>}
 */
export async function runAllOCR(imageBuffer, worker = null) {
    // Run engines in parallel but reuse Tesseract worker
    const [tesseractResult, ocrSpaceResult] = await Promise.all([
        runTesseract(imageBuffer, worker),
        runOCRSpace(imageBuffer)
    ]);


    const results = [tesseractResult, ocrSpaceResult].filter(r => r.text.length > 0);

    // Extract grades from each engine's text (now passing structural data)
    const gradeExtractions = results.map(r => ({
        engine: r.engine,
        confidence: r.confidence,
        grades: extractGrades(r.text, {
            words: r.words,   // Tesseract layout
            overlay: r.overlay // OCR.space layout
        }),
        text: r.text
    }));

    return { results, gradeExtractions };
}

// ─── Consensus Builder ──────────────────────────────────────

/**
 * Build consensus from multiple OCR engine results for a single frame
 * For each module: if ≥2 engines agree on a grade → accept
 * 
 * @param {Array} gradeExtractions - Array of { engine, grades: { extractedGrades } }
 * @returns {Object} { consensusGrades, agreements, disagreements, confidence }
 */
export function buildFrameConsensus(gradeExtractions) {
    const allModules = new Set();
    const gradesByModule = {};

    // Collect all grades per module from each engine
    for (const extraction of gradeExtractions) {
        const extracted = extraction.grades?.extractedGrades || {};
        for (const [module, grades] of Object.entries(extracted)) {
            allModules.add(module);
            if (!gradesByModule[module]) gradesByModule[module] = [];
            gradesByModule[module].push({
                engine: extraction.engine,
                confidence: extraction.confidence,
                exam: grades.exam,
                td: grades.td
            });
        }
    }

    const consensusGrades = {};
    const agreements = [];
    const disagreements = [];

    for (const module of allModules) {
        const entries = gradesByModule[module] || [];

        if (entries.length === 0) continue;

        if (entries.length === 1) {
            // Only one engine found this module — use it but mark as uncertain
            consensusGrades[module] = {
                exam: entries[0].exam,
                td: entries[0].td,
                certainty: 'single_engine',
                source: entries[0].engine
            };
            disagreements.push({ module, reason: 'single_engine', entries });
            continue;
        }

        // Compare exam grades across engines
        const examValues = entries.map(e => e.exam).filter(v => v !== null && v !== undefined);
        const tdValues = entries.map(e => e.td).filter(v => v !== null && v !== undefined);

        const examConsensus = findMajority(examValues);
        const tdConsensus = findMajority(tdValues);

        consensusGrades[module] = {
            exam: examConsensus.value,
            td: tdConsensus.value,
            certainty: (examConsensus.agreed && tdConsensus.agreed) ? 'consensus' : 'partial',
            sources: entries.map(e => e.engine)
        };

        if (examConsensus.agreed && tdConsensus.agreed) {
            agreements.push({ module, exam: examConsensus.value, td: tdConsensus.value });
        } else {
            disagreements.push({
                module,
                reason: 'value_mismatch',
                examValues,
                tdValues
            });
        }
    }

    const totalModules = allModules.size || 1;
    const confidence = Math.round((agreements.length / totalModules) * 100);

    return { consensusGrades, agreements, disagreements, confidence };
}

/**
 * Find majority value from an array of numbers
 * @param {Array<number>} values
 * @returns {{ value: number|null, agreed: boolean }}
 */
function findMajority(values) {
    if (values.length === 0) return { value: null, agreed: false };
    if (values.length === 1) return { value: values[0], agreed: false };

    // Count occurrences (with tolerance of ±0.5 for OCR errors)
    const groups = {};
    for (const v of values) {
        const key = Math.round(v * 2) / 2; // Round to nearest 0.5
        groups[key] = (groups[key] || 0) + 1;
    }

    // Find the most common value
    let bestKey = null;
    let bestCount = 0;
    for (const [key, count] of Object.entries(groups)) {
        if (count > bestCount) {
            bestKey = parseFloat(key);
            bestCount = count;
        }
    }

    return {
        value: bestKey,
        agreed: bestCount >= 2
    };
}

/**
 * Check for verification code across OCR results
 * @param {Array} ocrResults - Array of { text, engine }
 * @param {string} expectedCode
 * @returns {Object} Best code check result
 */
export function checkCodeInResults(ocrResults, expectedCode) {
    let bestResult = { found: false, exact: false, confidence: 0 };

    for (const result of ocrResults) {
        const check = findVerificationCode(result.text, expectedCode);
        if (check.confidence > bestResult.confidence) {
            bestResult = { ...check, engine: result.engine };
        }
    }

    return bestResult;
}
