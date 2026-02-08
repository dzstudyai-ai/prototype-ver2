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

// Add or update grade
export const addGrade = async (req, res) => {
    try {
        const { subject, examScore, tdScore } = req.body;
        const userId = req.user.id;
        const coefficient = COEFFICIENTS[subject] || 1;

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
                .update({ exam_score: examScore, td_score: tdScore, updated_at: new Date() })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) throw error;
            grade = data;
        } else {
            const { data, error } = await supabase
                .from('grades')
                .insert({ user_id: userId, subject, exam_score: examScore, td_score: tdScore, coefficient })
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

        // Safer approach: Process sequentially to avoid constraint issues if unique index is missing
        for (const g of grades) {
            const coefficient = COEFFICIENTS[g.subject] || 1;

            // Check existence
            const { data: existing } = await supabase
                .from('grades')
                .select('id')
                .eq('user_id', userId)
                .eq('subject', g.subject)
                .maybeSingle(); // Safely check

            if (existing) {
                await supabase
                    .from('grades')
                    .update({
                        exam_score: g.examScore,
                        td_score: g.tdScore,
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
                        coefficient
                    });
            }
        }

        // Recalculate averages ONCE
        await calculateAverages(userId);

        res.json({ message: 'Batch update successful' });
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
        let subjectAvg = (0.6 * grade.exam_score) + (0.4 * grade.td_score);
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
