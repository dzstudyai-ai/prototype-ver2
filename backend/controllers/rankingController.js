import { supabase } from '../config/db.js';

// Get general ranking
export const getGeneralRanking = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('averages')
            .select(`
        general_average,
        user_id,
        users!inner(alias, student_id, display_mode)
      `)
            .order('general_average', { ascending: false });

        if (error) throw error;

        const ranking = data.map((item, index) => ({
            rank: index + 1,
            alias: item.users.alias,
            displayName: item.users.display_mode === 'studentNumber'
                ? item.users.student_id
                : item.users.alias,
            average: item.general_average,
        }));

        res.json(ranking);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const SUBJECTS_CONFIG = [
    { name: 'Analyse 03', coefficient: 5 },
    { name: 'Algèbre 03', coefficient: 3 },
    { name: 'Économie d\'entreprise', coefficient: 2 },
    { name: 'Probabilité et Statistique 01', coefficient: 4 },
    { name: 'Anglais 02', coefficient: 2 },
    { name: 'SFSD', coefficient: 4 },
    { name: 'Architecture 02', coefficient: 4 },
    { name: 'Électronique Fondamentale 02', coefficient: 4 },
];

const TOTAL_COEF = 28;

// Force Refresh Rankings
export const refreshRankings = async (req, res) => {
    try {
        // 1. Get all users
        const { data: users, error: userError } = await supabase.from('users').select('id');
        if (userError) throw userError;

        // 2. Get all grades - Optimized: One query
        const { data: grades, error: gradesError } = await supabase.from('grades').select('*');
        if (gradesError) throw gradesError;

        const updatesAverages = [];
        const updatesSubjectAverages = [];

        users.forEach(user => {
            const userGrades = grades.filter(g => g.user_id === user.id);
            let totalWeightedSum = 0;
            let hasGrades = false;

            SUBJECTS_CONFIG.forEach(subject => {
                const grade = userGrades.find(g => g.subject === subject.name);
                if (grade) {
                    let avg = (grade.exam_score * 0.6) + (grade.td_score * 0.4);
                    // Standardize precision: Round to 2 decimal places BEFORE weighting
                    avg = Math.round(avg * 100) / 100;

                    // Add subject average update
                    updatesSubjectAverages.push({
                        user_id: user.id,
                        subject: subject.name,
                        average: avg
                    });
                    totalWeightedSum += avg * subject.coefficient;
                    hasGrades = true;
                }
            });

            if (hasGrades) {
                const generalAverage = totalWeightedSum / TOTAL_COEF;
                updatesAverages.push({
                    user_id: user.id,
                    general_average: generalAverage,
                    last_calculated: new Date().toISOString()
                });
            }
        });

        // Bulk upsert subject averages
        if (updatesSubjectAverages.length > 0) {
            const { error: subError } = await supabase
                .from('subject_averages')
                .upsert(updatesSubjectAverages, { onConflict: 'user_id,subject' });
            if (subError) throw subError;
        }

        // Bulk upsert general averages
        if (updatesAverages.length > 0) {
            const { error: avgError } = await supabase
                .from('averages')
                .upsert(updatesAverages, { onConflict: 'user_id' });
            if (avgError) throw avgError;
        }

        res.json({ message: 'Rankings updated successfully', count: updatesAverages.length });
    } catch (error) {
        console.error('Refresh Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get ranking by subject
export const getSubjectRanking = async (req, res) => {
    try {
        const { subject } = req.params;

        const { data, error } = await supabase
            .from('subject_averages')
            .select(`
        average,
        subject,
        user_id,
        users!inner(alias, student_id, display_mode)
      `)
            .eq('subject', subject)
            .order('average', { ascending: false });

        if (error) throw error;

        const ranking = data.map((item, index) => ({
            rank: index + 1,
            alias: item.users.alias,
            displayName: item.users.display_mode === 'studentNumber'
                ? item.users.student_id
                : item.users.alias,
            average: item.average,
            subject: item.subject,
        }));

        res.json(ranking);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
