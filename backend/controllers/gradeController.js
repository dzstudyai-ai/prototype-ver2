import { supabase } from '../config/db.js';

// Coefficients des matières
const COEFFICIENTS = {
    'Analyse 03': 5,
    'Algèbre 03': 3,
    'Économie d\'entreprise': 2,
    'Probabilité et Statistique 01': 4,
    'Anglais 02': 2,
    'SFSD': 4,
    'Architecture 02': 4,
    'Électronique Fondamentale 02': 4,
};

const TOTAL_COEF = 28;

// Subjects with official grade verification — map app name to possible DB names
const VERIFIED_SUBJECTS = {
    'Analyse 03': ['Analyse 03', 'Analyse 3'],
    'Algèbre 03': ['Algèbre 03', 'Algèbre 3'],
    'Probabilité et Statistique 01': ['Probabilité et Statistique 01', 'Probabilités et Statistiques 01'],
    'Architecture 02': ['Architecture 02', 'Architecture 2'],
    'SFSD': ['SFSD'],
    'Électronique Fondamentale 02': ['Électronique Fondamentale 02', 'Électronique 02'],
    'Économie d\'entreprise': ['Économie d\'entreprise'],
    'Anglais 02': ['Anglais 02'],
};

// Add or update grade
export const addGrade = async (req, res) => {
    try {
        const { subject, examScore, tdScore } = req.body;
        const userId = req.user.id;
        const coefficient = COEFFICIENTS[subject] || 1;
        let isExamVerified = null;
        let isTdVerified = null;

        // Check Official Grades - Separate Exam & TD Validation
        const dbVariants = VERIFIED_SUBJECTS[subject];
        if (dbVariants) {
            const { data: userProfile } = await supabase
                .from('users')
                .select('student_id')
                .eq('id', userId)
                .single();

            if (userProfile?.student_id) {
                const suffix = userProfile.student_id.slice(-8);
                const { data: official } = await supabase
                    .from('official_grades')
                    .select('final_note, td_note, subject, matricule')
                    .like('matricule', `%${suffix}`)
                    .in('subject', dbVariants)
                    .limit(1)
                    .maybeSingle();

                if (official) {
                    if (official.final_note !== null && examScore !== null && examScore !== undefined) {
                        isExamVerified = Math.abs(parseFloat(official.final_note) - parseFloat(examScore)) <= 0.05;
                    }
                    if (official.td_note !== null && tdScore !== null && tdScore !== undefined) {
                        isTdVerified = Math.abs(parseFloat(official.td_note) - parseFloat(tdScore)) <= 0.05;
                    }
                    console.log(`[VERIFY][${subject}] Exam:`, isExamVerified, '| TD:', isTdVerified);
                }
            }
        }

        // Upsert: insert or update if exists
        const { data: existing } = await supabase
            .from('grades')
            .select('id')
            .eq('user_id', userId)
            .eq('subject', subject)
            .single();

        let grade;
        if (existing) {
            const { data, error } = await supabase
                .from('grades')
                .update({
                    exam_score: examScore,
                    td_score: tdScore,
                    is_exam_verified: isExamVerified,
                    is_td_verified: isTdVerified,
                    updated_at: new Date()
                })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) throw error;
            grade = data;
        } else {
            const { data, error } = await supabase
                .from('grades')
                .insert({
                    user_id: userId,
                    subject,
                    exam_score: examScore,
                    td_score: tdScore,
                    coefficient,
                    is_exam_verified: isExamVerified,
                    is_td_verified: isTdVerified
                })
                .select()
                .single();
            if (error) throw error;
            grade = data;
        }

        // Recalculate averages
        await calculateAverages(userId);

        res.status(201).json(grade);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Batch update grades (Atomic & Race-free)
export const batchAddGrades = async (req, res) => {
    try {
        const { grades } = req.body; // Array of { subject, examScore, tdScore }
        const userId = req.user.id;

        // Get User Profile once for batch
        const { data: userProfile } = await supabase
            .from('users')
            .select('student_id')
            .eq('id', userId)
            .single();

        console.log('[BATCH] User ID:', userId, '| student_id:', userProfile?.student_id);

        // DEBUG: Check if official_grades has any data at all
        const { data: sampleGrades, count } = await supabase
            .from('official_grades')
            .select('matricule, subject, final_note', { count: 'exact' })
            .limit(3);
        console.log('[BATCH] official_grades sample:', sampleGrades, '| total rows:', count);

        const results = [];

        // Safer approach: Process sequentially
        for (const g of grades) {
            const coefficient = COEFFICIENTS[g.subject] || 1;
            let isExamVerified = null;
            let isTdVerified = null;

            // Verification Logic — Separate Exam & TD
            const dbVariants = VERIFIED_SUBJECTS[g.subject];
            console.log(`[BATCH] Processing ${g.subject} | Variants:`, dbVariants);

            if (dbVariants && userProfile?.student_id) {
                const suffix = userProfile.student_id.slice(-8);
                console.log(`[BATCH] Searching for matricule %${suffix} with variants:`, dbVariants);

                const { data: official, error: offError } = await supabase
                    .from('official_grades')
                    .select('final_note, td_note, subject, matricule')
                    .like('matricule', `%${suffix}`)
                    .in('subject', dbVariants)
                    .limit(1)
                    .maybeSingle();

                if (offError) console.error(`[BATCH] DB Error searching official grades for ${g.subject}:`, offError);

                if (official) {
                    console.log(`[BATCH] Found official record for ${g.subject}:`, official);
                    if (official.final_note !== null) {
                        isExamVerified = Math.abs(parseFloat(official.final_note) - parseFloat(g.examScore)) <= 0.05;
                    }
                    if (official.td_note !== null) {
                        isTdVerified = Math.abs(parseFloat(official.td_note) - parseFloat(g.tdScore)) <= 0.05;
                    }
                    console.log(`[BATCH-VERIFY][${g.subject}] Exam:`, isExamVerified, '| TD:', isTdVerified);
                } else {
                    console.log(`[BATCH] No official record found for ${g.subject} with variants ${dbVariants} and suffix ${suffix}`);
                }
            }

            // Check existence
            const { data: existing } = await supabase
                .from('grades')
                .select('id')
                .eq('user_id', userId)
                .eq('subject', g.subject)
                .maybeSingle();

            if (existing) {
                await supabase
                    .from('grades')
                    .update({
                        exam_score: g.examScore,
                        td_score: g.tdScore,
                        is_exam_verified: isExamVerified,
                        is_td_verified: isTdVerified,
                        updated_at: new Date()
                    })
                    .eq('id', existing.id);
            } else {
                await supabase
                    .from('grades')
                    .insert({
                        user_id: userId,
                        subject: g.subject,
                        exam_score: g.examScore,
                        td_score: g.tdScore,
                        coefficient,
                        is_exam_verified: isExamVerified,
                        is_td_verified: isTdVerified
                    });
            }

            // Collect result for frontend
            results.push({
                subject: g.subject,
                is_exam_verified: isExamVerified,
                is_td_verified: isTdVerified
            });
        }

        // Recalculate averages ONCE
        await calculateAverages(userId);

        res.json(results);
    } catch (error) {
        console.error('Batch Update Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get my grades
export const getMyGrades = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('grades')
            .select('*')
            .eq('user_id', req.user.id);

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Calculate and store averages
export const calculateAverages = async (userId) => {
    const { data: grades } = await supabase
        .from('grades')
        .select('*')
        .eq('user_id', userId);

    if (!grades || grades.length === 0) return;

    let totalSum = 0;
    let totalCoef = 0;

    const updatesSubjectAverages = [];

    for (const grade of grades) {
        let subjectAvg;

        // SPECIFIC RULE: Anglais 02 has no TD (Exam Only)
        if (grade.subject === 'Anglais 02') {
            subjectAvg = Number(grade.exam_score) || 0;
        } else {
            // Default: (60% Exam + 40% TD)
            const exam = Number(grade.exam_score) || 0;
            const td = Number(grade.td_score) || 0;
            subjectAvg = (0.6 * exam) + (0.4 * td);
        }

        // Standardize precision: Round to 2 decimal places BEFORE weighting
        subjectAvg = Math.round(subjectAvg * 100) / 100;

        const coefficient = COEFFICIENTS[grade.subject] || grade.coefficient || 1;

        updatesSubjectAverages.push({
            user_id: userId,
            subject: grade.subject,
            average: subjectAvg
        });

        totalSum += subjectAvg * coefficient;
        totalCoef += coefficient; // Use the corrected coefficient
    }

    // Bulk upsert subject averages
    if (updatesSubjectAverages.length > 0) {
        await supabase
            .from('subject_averages')
            .upsert(updatesSubjectAverages, { onConflict: 'user_id,subject' });
    }

    const generalAvg = totalSum / TOTAL_COEF;

    // Upsert general average
    await supabase
        .from('averages')
        .upsert({ user_id: userId, general_average: generalAvg, last_calculated: new Date() }, { onConflict: 'user_id' });
};

// Force recalculate my averages
export const recalcAverages = async (req, res) => {
    try {
        await calculateAverages(req.user.id);
        res.json({ message: 'Averages recalculated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get my averages
export const getMyAverages = async (req, res) => {
    try {
        const { data: general } = await supabase
            .from('averages')
            .select('general_average')
            .eq('user_id', req.user.id)
            .single();

        const { data: subjects } = await supabase
            .from('subject_averages')
            .select('subject, average')
            .eq('user_id', req.user.id);

        res.json({
            generalAverage: general?.general_average || 0,
            subjectAverages: subjects || []
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
