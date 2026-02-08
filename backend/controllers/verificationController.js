import { createWorker } from 'tesseract.js';
import crypto from 'crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { supabase } from '../config/db.js';
import { calculateAverages } from './gradeController.js';

export const verifyStudent = async (req, res) => {
    console.log("=================================================");
    console.log("[BACKEND] /api/auth/verify HIT!");
    console.log("[BACKEND] User ID:", req.user?.id);
    console.log("[BACKEND] Body:", req.body);
    console.log("[BACKEND] Files:", Object.keys(req.files || {}));
    console.log("=================================================");

    let worker = null;
    let timeoutId = null;

    try {
        const { manualStudentId, qrData } = req.body;
        const idPartBuffer = req.files?.['studentCard']?.[0]?.buffer;
        const namePartBuffer = req.files?.['nameCard']?.[0]?.buffer;

        if (!manualStudentId || !idPartBuffer) {
            console.log("[BACKEND] Missing data - manualStudentId:", !!manualStudentId, "idPartBuffer:", !!idPartBuffer);
            return res.status(400).json({ message: 'Données de scan incomplètes.' });
        }

        // 1. KERNEL EXTRACTION
        const idKernel = manualStudentId.substring(4); // Remove 2024
        console.log(`[VERIFY-WIZARD] Input: ${manualStudentId} -> Kernel: ${idKernel}`);

        // 2. DB LOOKUP
        const { data: students, error: dbError } = await supabase
            .from('students_list')
            .select('*')
            .ilike('matricule', `%${idKernel}`);

        if (dbError || !students || students.length === 0) {
            return res.status(404).json({ message: "Étudiant inconnu dans la liste officielle." });
        }

        const student = students[0];

        const ocrPromise = (async () => {
            worker = await createWorker(['fra', 'eng']);
            let points = 0;

            // --- TEST 1: QR DATA ---
            // A. Check frontend decoded string
            if (qrData && qrData.includes(idKernel)) {
                console.log(`[VERIFY-STEP] ✅ QR Match Found (Frontend)`);
                points += 2;
            }
            // B. Check manual QR photo if available (Fallback)
            else if (req.files?.['qrCard']) {
                try {
                    const qrBuffer = req.files['qrCard'][0].buffer;
                    const { data: rawData, info: rawInfo } = await sharp(qrBuffer)
                        .ensureAlpha()
                        .resize(800)
                        .raw()
                        .toBuffer({ resolveWithObject: true });

                    const code = jsQR(new Uint8ClampedArray(rawData), rawInfo.width, rawInfo.height);
                    if (code && code.data.includes(idKernel)) {
                        console.log(`[VERIFY-STEP] ✅ QR Match Found (Backend Manual)`);
                        points += 2;
                    }
                } catch (e) {
                    console.warn("[QR-MANUAL] Failed", e.message);
                }
            }

            // --- TEST 2: ID PART OCR ---
            try {
                const processedIdBuffer = await sharp(idPartBuffer)
                    .resize(1500)
                    .grayscale()
                    .normalize()
                    .toBuffer();

                const { data: { text: idText } } = await worker.recognize(processedIdBuffer);
                if (idText.replace(/[^0-9]/g, '').includes(idKernel)) {
                    console.log(`[VERIFY-STEP] ✅ ID OCR Match Found`);
                    points += 1;
                }
            } catch (e) { console.warn("[OCR-ID] Failed", e.message); }

            // --- TEST 3: NAME PART OCR ---
            if (namePartBuffer) {
                try {
                    const processedNameBuffer = await sharp(namePartBuffer)
                        .resize(1800)
                        .grayscale()
                        .sharpen()
                        .toBuffer();

                    const { data: { text: nameText } } = await worker.recognize(processedNameBuffer);
                    const normText = nameText.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ");
                    const namesToCheck = [student.nom_fr, student.prenom_fr].filter(Boolean);

                    if (namesToCheck.some(name => normText.includes(name.toLowerCase()))) {
                        console.log(`[VERIFY-STEP] ✅ NAME OCR Match Found`);
                        points += 1;
                    }
                } catch (e) { console.warn("[OCR-NAME] Failed", e.message); }
            }

            console.log(`[VERIFY-RESULT] Total Points: ${points}/4`);
            return { success: points >= 2, points };
        })();

        const result = await Promise.race([
            ocrPromise,
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error("TIMEOUT_OCR")), 60000);
            })
        ]);

        if (timeoutId) clearTimeout(timeoutId);

        if (!result.success) {
            return res.status(422).json({
                message: "Vérification échouée. Assurez-vous de bien cadrer les étapes (QR, Matricule, Nom)."
            });
        }

        // SUCCESS - Proceed with verification
        const studentIdHash = crypto.createHash('sha256').update(manualStudentId).digest('hex');

        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('student_id_hash', studentIdHash)
            .neq('id', req.user.id)
            .single();

        if (existingUser) {
            return res.status(409).json({ message: 'Ce compte est déjà vérifié par un autre étudiant.' });
        }

        const { error } = await supabase
            .from('users')
            .update({ is_verified: true, student_id_hash: studentIdHash })
            .eq('id', req.user.id);

        if (error) throw error;

        await calculateAverages(req.user.id);

        res.json({
            success: true,
            message: `Vérification réussie (${result.points}/4 pts). Bienvenue ${student.prenom_fr} !`
        });

    } catch (error) {
        console.error('Verify Error:', error);
        if (!res.headersSent) res.status(500).json({ message: "Erreur technique lors du scan." });
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (worker) try { await worker.terminate(); } catch { }
    }
};
