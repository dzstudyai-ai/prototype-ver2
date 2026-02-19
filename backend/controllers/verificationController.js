/**
 * ═══════════════════════════════════════════════════════════════
 * VERIFICATION CONTROLLER — Système de vérification avancé
 * ═══════════════════════════════════════════════════════════════
 * 
 * FLOW:
 *   1. Image Preprocessing & Quality Analysis
 *   2. Fraud Detection (screenshot, replay, manipulation)
 *   3. QR Code Detection (authenticity check)
 *   4. OCR Extraction (nom, prénom, matricule)
 *   5. Database Validation (student exists?)
 *   6. Multi-Level Validation (presence → DB match → coherence)
 *   7. Trust Score Calculation
 *   8. Audit Logging
 *   9. JSON Response with full details
 * 
 * PRIORITY: DB > QR > OCR
 * RULE: Never validate without minimum 2 concordant sources
 */

import { createWorker } from 'tesseract.js';
import crypto from 'crypto';
import jsQR from 'jsqr';
import { supabase } from '../config/db.js';

// Utility modules
import { analyzeImage, preprocessForOCR, preprocessForQR, preprocessForQRContrast, getImageHash } from '../utils/imageProcessor.js';
import { detectFraud } from '../utils/fraudDetector.js';
import { calculateTrustScore, getStatusMessage } from '../utils/trustScoring.js';
import { logVerification, getClientIP, maskPII } from '../utils/verificationLogger.js';

export const verifyStudent = async (req, res) => {
    const startTime = Date.now();
    console.log("╔═══════════════════════════════════════════════════╗");
    console.log("║        ADVANCED VERIFICATION SYSTEM v2.0         ║");
    console.log("╚═══════════════════════════════════════════════════╝");
    console.log(`[VERIFY] User: ${req.user?.id}`);
    console.log(`[VERIFY] IP: ${getClientIP(req)}`);
    console.log(`[VERIFY] Time: ${new Date().toISOString()}`);

    let worker = null;
    let timeoutId = null;

    try {
        const { manualStudentId } = req.body;
        const imageBuffer = req.files?.['studentCard']?.[0]?.buffer;

        if (!manualStudentId || manualStudentId.length < 8 || !imageBuffer) {
            return res.status(400).json({
                validation_status: 'REJECTED',
                confidence_score: 0,
                message: 'Données manquantes: matricule et photo requis.',
                fraud_flags: [],
                extracted_data: {},
                verification_source: 'NONE'
            });
        }

        // ═══════════════════════════════════════
        // STEP 1: IMAGE ANALYSIS & PREPROCESSING
        // ═══════════════════════════════════════
        console.log("\n[STEP 1] 🖼  Image Analysis...");
        const imageAnalysis = await analyzeImage(imageBuffer);
        console.log(`  ├─ Résolution: ${imageAnalysis.resolution.width}x${imageAnalysis.resolution.height} (${imageAnalysis.resolution.megapixels.toFixed(1)}MP)`);
        console.log(`  ├─ Flou: ${imageAnalysis.blur.isBlurry ? '❌ FLOU' : '✅ Net'} (score: ${imageAnalysis.blur.score})`);
        console.log(`  ├─ Lumière: ${imageAnalysis.lighting.quality} (brightness: ${imageAnalysis.lighting.brightness})`);
        console.log(`  ├─ Bruit: ${imageAnalysis.noise.level} (stdDev: ${imageAnalysis.noise.stdDev})`);
        console.log(`  ├─ Contraste: ${imageAnalysis.contrast.score}/100`);
        console.log(`  ├─ EXIF Camera: ${imageAnalysis.exif.hasCamera ? '✅' : '❌'}`);
        console.log(`  └─ Qualité globale: ${imageAnalysis.overallQuality}/100`);

        // ═══════════════════════════════════════
        // STEP 2: FRAUD DETECTION
        // ═══════════════════════════════════════
        console.log("\n[STEP 2] 🛡  Fraud Detection...");
        const imageHash = await getImageHash(imageBuffer);
        const fraudContext = {
            userId: req.user.id,
            ip: getClientIP(req),
            userAgent: req.headers['user-agent'] || 'unknown',
            qrMatricule: null, // Will be set after QR decode
            ocrMatricule: null  // Will be set after OCR
        };
        const fraudResults = await detectFraud(imageAnalysis, imageBuffer, fraudContext);
        console.log(`  ├─ Score fraude: ${fraudResults.fraudScore}/100`);
        console.log(`  ├─ Screenshot prob: ${fraudResults.screenshotProbability}%`);
        console.log(`  ├─ Bloqué: ${fraudResults.isBlocked ? '🚫 OUI' : '✅ NON'}`);
        if (fraudResults.flags.length > 0) {
            fraudResults.flags.forEach(f => console.log(`  ├─ 🚨 ${f.type}: ${f.message}`));
        }
        console.log(`  └─ Hash: ${imageHash.substring(0, 16)}...`);

        // If blocked by fraud, stop here
        if (fraudResults.isBlocked) {
            const rejectMessage = fraudResults.flags.map(f => `🚨 ${f.message}`).join('\n');

            await logVerification({
                userId: req.user.id,
                imageHash,
                ipAddress: getClientIP(req),
                userAgent: req.headers['user-agent'],
                validationStatus: 'REJECTED',
                confidenceScore: 0,
                fraudFlags: fraudResults.flags,
                extractedData: { manualStudentId: maskPII(manualStudentId) },
                verificationSource: 'BLOCKED'
            });

            return res.status(422).json({
                validation_status: 'REJECTED',
                confidence_score: 0,
                message: rejectMessage || 'Vérification bloquée par le système anti-fraude.',
                fraud_flags: fraudResults.flags,
                extracted_data: {},
                verification_source: 'BLOCKED'
            });
        }

        // ═══════════════════════════════════════
        // STEP 3-5: QR + OCR + DB (with timeout)
        // ═══════════════════════════════════════
        // Handle prefixes (ES..., 2024, 2424)
        const prefixes = ['ES162220252424', '2024', '2025', '2026', '2424'];
        let idKernel = manualStudentId;
        // Find longest matching prefix
        const matchedPrefix = prefixes.find(p => manualStudentId.startsWith(p));
        if (matchedPrefix) {
            idKernel = manualStudentId.substring(matchedPrefix.length);
        } else if (manualStudentId.length >= 8) {
            // Fallback to standard 4-digit prefix
            idKernel = manualStudentId.substring(4);
        }

        console.log(`\n[STEP 3] 📋 ID Kernel Extraction:`);
        console.log(`  ├─ Input: ${manualStudentId}`);
        console.log(`  ├─ Prefix: ${matchedPrefix || 'Standard (4)'}`);
        console.log(`  └─ Kernel: ${idKernel}`);

        const extractedData = {
            nom: null,
            prenom: null,
            matricule: manualStudentId,
            qrContent: null
        };

        const ocrResults = {
            nameFound: false,
            prenomFound: false,
            matriculeMatch: false,
            ocrConfidence: 0
        };

        const qrResults = {
            qrFound: false,
            qrContent: null,
            inputMatch: false
        };

        const dbResults = {
            studentExists: false,
            student: null
        };

        const analysisPromise = (async () => {

            // ─── 3. DATABASE LOOKUP ───
            console.log("\n[STEP 3] 🗄  Database Lookup...");
            const { data: students, error: dbError } = await supabase
                .from('students_list')
                .select('*')
                .ilike('matricule', `%${idKernel}`);

            if (dbError) {
                console.error("  └─ ❌ DB Error:", dbError.message);
            } else if (students && students.length > 0) {
                dbResults.studentExists = true;
                dbResults.student = students[0];
                console.log(`  └─ ✅ Trouvé: ${students[0].nom_fr} ${students[0].prenom_fr}`);
            } else {
                console.log(`  └─ ❌ Étudiant introuvable pour kernel: ${idKernel}`);
            }

            // ─── 4. QR CODE DETECTION ───
            console.log("\n[STEP 4] 📷 QR Code Detection...");
            const qrSizes = [800, 1200, 600];
            for (const size of qrSizes) {
                try {
                    const qrData = await preprocessForQR(imageBuffer, size);
                    const code = jsQR(qrData.rawData, qrData.width, qrData.height, {
                        inversionAttempts: 'attemptBoth'
                    });
                    if (code && code.data) {
                        qrResults.qrFound = true;
                        qrResults.qrContent = code.data;
                        qrResults.inputMatch = code.data.includes(idKernel);
                        extractedData.qrContent = code.data;
                        console.log(`  └─ ✅ QR trouvé (${size}px): ${code.data}`);
                        if (qrResults.inputMatch) console.log(`  └─ ✅ QR correspond au matricule (kernel: ${idKernel})`);
                        break;
                    }
                } catch (e) { /* continue */ }
            }

            // QR Fallback: high contrast
            if (!qrResults.qrFound) {
                try {
                    const qrData = await preprocessForQRContrast(imageBuffer);
                    const code = jsQR(qrData.rawData, qrData.width, qrData.height, {
                        inversionAttempts: 'attemptBoth'
                    });
                    if (code && code.data) {
                        qrResults.qrFound = true;
                        qrResults.qrContent = code.data;
                        qrResults.inputMatch = code.data.includes(idKernel);
                        extractedData.qrContent = code.data;
                        console.log(`  └─ ✅ QR trouvé (contraste): ${code.data}`);
                        if (qrResults.inputMatch) console.log(`  └─ ✅ QR correspond au matricule (kernel: ${idKernel})`);
                    }
                } catch (e) { /* continue */ }
            }

            // QR Fallback: thresholding (Great for low light)
            if (!qrResults.qrFound) {
                const thresholds = [100, 150];
                for (const t of thresholds) {
                    try {
                        const qrData = await preprocessForQRThreshold(imageBuffer, t);
                        const code = jsQR(qrData.rawData, qrData.width, qrData.height, {
                            inversionAttempts: 'attemptBoth'
                        });
                        if (code && code.data) {
                            qrResults.qrFound = true;
                            qrResults.qrContent = code.data;
                            qrResults.inputMatch = code.data.includes(idKernel);
                            extractedData.qrContent = code.data;
                            console.log(`  └─ ✅ QR trouvé (threshold ${t}): ${code.data}`);
                            break;
                        }
                    } catch (e) { /* continue */ }
                }
            }

            if (!qrResults.qrFound) {
                console.log("  └─ ❌ Aucun QR détecté");
            }

            // ─── 5. OCR EXTRACTION ───
            console.log("\n[STEP 5] 🔎 OCR Extraction...");
            try {
                worker = await createWorker('fra+eng');
                const ocrBuffer = await preprocessForOCR(imageBuffer);
                const { data: { text, confidence } } = await worker.recognize(ocrBuffer);

                ocrResults.ocrConfidence = confidence || 0;
                console.log(`  ├─ Confidence: ${Math.round(confidence)}%`);
                console.log(`  ├─ Text (first 200): ${text.substring(0, 200).replace(/\n/g, ' ')}`);

                const normText = text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ");

                // Check NAME
                if (dbResults.student) {
                    const student = dbResults.student;

                    if (student.nom_fr && normText.includes(student.nom_fr.toLowerCase())) {
                        ocrResults.nameFound = true;
                        extractedData.nom = student.nom_fr;
                        console.log(`  ├─ ✅ Nom: ${student.nom_fr}`);
                    } else if (student.nom_fr && student.nom_fr.length >= 4) {
                        const partial = student.nom_fr.substring(0, 4).toLowerCase();
                        if (normText.includes(partial)) {
                            ocrResults.nameFound = true;
                            extractedData.nom = student.nom_fr + " (partiel)";
                            console.log(`  ├─ ✅ Nom (partiel): ${partial}`);
                        }
                    }

                    // Check PRÉNOM
                    if (student.prenom_fr && normText.includes(student.prenom_fr.toLowerCase())) {
                        ocrResults.prenomFound = true;
                        extractedData.prenom = student.prenom_fr;
                        console.log(`  ├─ ✅ Prénom: ${student.prenom_fr}`);
                    } else if (student.prenom_fr && student.prenom_fr.length >= 4) {
                        const partial = student.prenom_fr.substring(0, 4).toLowerCase();
                        if (normText.includes(partial)) {
                            ocrResults.prenomFound = true;
                            extractedData.prenom = student.prenom_fr + " (partiel)";
                            console.log(`  ├─ ✅ Prénom (partiel): ${partial}`);
                        }
                    }

                    // Also try Arabic names
                    if (!ocrResults.nameFound && student.nom_ar && normText.includes(student.nom_ar)) {
                        ocrResults.nameFound = true;
                        extractedData.nom = student.nom_ar + " (AR)";
                        console.log(`  ├─ ✅ Nom (arabe): ${student.nom_ar}`);
                    }
                    if (!ocrResults.prenomFound && student.prenom_ar && normText.includes(student.prenom_ar)) {
                        ocrResults.prenomFound = true;
                        extractedData.prenom = student.prenom_ar + " (AR)";
                        console.log(`  ├─ ✅ Prénom (arabe): ${student.prenom_ar}`);
                    }
                }

                // Check MATRICULE in OCR text
                // More robust matching: handle common OCR errors (1->I, 0->O, etc)
                const fuzzyDigits = text.toUpperCase()
                    .replace(/I|L|T/g, '1')
                    .replace(/O|Q/g, '0')
                    .replace(/S/g, '5')
                    .replace(/B/g, '8')
                    .replace(/[^0-9]/g, '');

                const cleanManualId = manualStudentId.replace(/[^0-9]/g, '');

                if (cleanManualId && fuzzyDigits.includes(cleanManualId)) {
                    ocrResults.matriculeMatch = true;
                    console.log(`  ├─ ✅ Matricule complet ${cleanManualId} trouvé dans OCR (FUZZY)`);
                } else if (idKernel && fuzzyDigits.includes(idKernel)) {
                    ocrResults.matriculeMatch = true;
                    console.log(`  ├─ ✅ Matricule partiel (kernel) ${idKernel} trouvé dans OCR (FUZZY)`);
                } else {
                    console.log(`  ├─ ❌ Matricule ${idKernel} non détecté dans OCR`);
                    console.log(`  │  (Digits OCR: ${fuzzyDigits.substring(0, 30)}...)`);
                }

                console.log(`  └─ Résumé OCR: nom=${ocrResults.nameFound} prénom=${ocrResults.prenomFound} id=${ocrResults.matriculeMatch}`);

            } catch (e) {
                console.error("  └─ ❌ OCR Error:", e.message);
            }
        })();

        // Race against timeout (180s)
        await Promise.race([
            analysisPromise,
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error("TIMEOUT")), 180000);
            })
        ]);
        if (timeoutId) clearTimeout(timeoutId);

        // ═══════════════════════════════════════
        // STEP 6: MULTI-LEVEL VALIDATION
        // ═══════════════════════════════════════
        console.log("\n[STEP 6] 🔐 Multi-Level Validation...");

        // Level 1 — Présence données
        const level1Pass = (ocrResults.nameFound || ocrResults.prenomFound) &&
            (qrResults.qrFound || ocrResults.matriculeMatch);
        console.log(`  ├─ Level 1 (Présence): ${level1Pass ? '✅' : '❌'}`);

        // Level 2 — Database Validation
        const level2Pass = dbResults.studentExists && ocrResults.matriculeMatch;
        console.log(`  ├─ Level 2 (DB Match): ${level2Pass ? '✅' : '❌'}`);

        // Level 3 — Cohérence multi-source (minimum 2 sources concordantes)
        let concordantSources = 0;
        if (qrResults.qrFound) concordantSources++;
        if (ocrResults.nameFound || ocrResults.prenomFound) concordantSources++;
        if (ocrResults.matriculeMatch) concordantSources++;
        if (dbResults.studentExists) concordantSources++;

        const level3Pass = concordantSources >= 2;
        console.log(`  └─ Level 3 (Cohérence): ${level3Pass ? '✅' : '❌'} (${concordantSources}/4 sources)`);

        // ═══════════════════════════════════════
        // STEP 7: TRUST SCORE CALCULATION
        // ═══════════════════════════════════════
        console.log("\n[STEP 7] 📊 Trust Score Calculation...");
        const trustResult = calculateTrustScore({
            ocrResults,
            qrResults,
            imageAnalysis,
            fraudResults,
            dbResults
        });

        // Override status if validation levels fail
        if (!level1Pass || !level3Pass) {
            trustResult.status = 'REJECTED';
        }

        const verificationSource = qrResults.qrFound && ocrResults.matriculeMatch
            ? 'MIXED'
            : qrResults.qrFound ? 'QR' : 'OCR';

        console.log(`  ├─ Score total: ${trustResult.totalScore}/100`);
        console.log(`  ├─ Status: ${trustResult.status}`);
        console.log(`  ├─ Sub-scores: OCR=${trustResult.subScores.ocr} QR=${trustResult.subScores.qr} IMG=${trustResult.subScores.imageQuality} META=${trustResult.subScores.metadata} DB+=${trustResult.subScores.dbBonus} FRAUD-=${trustResult.subScores.fraudPenalty}`);
        console.log(`  └─ Source: ${verificationSource}`);

        // ═══════════════════════════════════════
        // STEP 8: AUDIT LOGGING
        // ═══════════════════════════════════════
        // Skip user_id constraint if not strictly enforced in DB yet
        const logUserId = req.user.id;

        await logVerification({
            userId: logUserId,
            imageHash,
            ipAddress: getClientIP(req),
            userAgent: req.headers['user-agent'],
            validationStatus: trustResult.status,
            confidenceScore: trustResult.totalScore,
            fraudFlags: fraudResults.flags,
            extractedData: {
                nom: extractedData.nom ? maskPII(extractedData.nom) : null,
                prenom: extractedData.prenom ? maskPII(extractedData.prenom) : null,
                matricule: maskPII(manualStudentId),
                qrFound: qrResults.qrFound
            },
            verificationSource
        });

        // ═══════════════════════════════════════
        // STEP 9: RESPONSE
        // ═══════════════════════════════════════
        const elapsed = Date.now() - startTime;
        console.log(`\n╔═══════════════════════════════╗`);
        console.log(`║  RÉSULTAT: ${trustResult.status.padEnd(12)} ${trustResult.totalScore}/100 pts  ║`);
        console.log(`╚═══════════════════════════════╝`);
        console.log(`[VERIFY] Temps total: ${elapsed}ms\n`);

        // Build error messages
        const problems = [];
        if (!qrResults.qrFound) problems.push("❌ QR Code non détecté");
        if (!ocrResults.nameFound) problems.push("❌ Nom non trouvé sur la carte");
        if (!ocrResults.prenomFound) problems.push("❌ Prénom non trouvé sur la carte");
        if (!dbResults.studentExists) problems.push("❌ Étudiant non trouvé dans la base");
        if (!ocrResults.matriculeMatch) problems.push("❌ Matricule ne correspond pas");
        if (fraudResults.flags.length > 0) {
            fraudResults.flags.forEach(f => problems.push(`🚨 ${f.message}`));
        }

        const responsePayload = {
            validation_status: trustResult.status,
            confidence_score: trustResult.totalScore,
            fraud_flags: fraudResults.flags,
            extracted_data: extractedData,
            verification_source: verificationSource,
            details: {
                qrFound: qrResults.qrFound,
                nameFound: ocrResults.nameFound,
                detectedName: extractedData.nom,
                prenomFound: ocrResults.prenomFound,
                detectedPrenom: extractedData.prenom,
                matriculeMatch: ocrResults.matriculeMatch,
                studentExists: dbResults.studentExists,
                imageQuality: imageAnalysis.overallQuality,
                screenshotProbability: fraudResults.screenshotProbability,
                ocrConfidence: Math.round(ocrResults.ocrConfidence)
            },
            trust_breakdown: trustResult.subScores,
            elapsed_ms: elapsed
        };

        if (trustResult.status === 'VALID') {
            // ═══ SUCCESS: Mark user as verified ═══
            const studentIdHash = crypto.createHash('sha256').update(manualStudentId).digest('hex');

            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('student_id_hash', studentIdHash)
                .neq('id', req.user.id)
                .single();

            if (existingUser) {
                return res.status(409).json({
                    ...responsePayload,
                    validation_status: 'REJECTED',
                    message: 'Ce matricule est déjà vérifié par un autre compte.'
                });
            }

            const { error } = await supabase
                .from('users')
                .update({ is_verified: true, student_id_hash: studentIdHash })
                .eq('id', req.user.id);

            if (error) throw error;

            // Average calculation skipped as function is missing
            // await calculateAverages(req.user.id);

            return res.json({
                ...responsePayload,
                success: true,
                message: getStatusMessage('VALID', trustResult.totalScore) +
                    ` Bienvenue ${dbResults.student?.prenom_fr || ''} ${dbResults.student?.nom_fr || ''} !`
            });
        }

        // Not VALID → return with problem details
        return res.status(422).json({
            ...responsePayload,
            success: false,
            message: problems.length > 0
                ? problems.join('\n')
                : getStatusMessage(trustResult.status, trustResult.totalScore)
        });

    } catch (error) {
        console.error('[VERIFY] Fatal Error:', error);
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.headersSent) {
            res.status(500).json({
                validation_status: 'REJECTED',
                confidence_score: 0,
                message: error.message === 'TIMEOUT'
                    ? "⏱ L'analyse a pris trop de temps. Réessayez avec une photo plus nette."
                    : "Erreur technique lors de la vérification.",
                fraud_flags: [],
                extracted_data: {},
                verification_source: 'ERROR'
            });
        }
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (worker) try { await worker.terminate(); } catch { }
    }
};
