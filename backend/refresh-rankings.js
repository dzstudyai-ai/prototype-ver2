import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SUBJECTS = [
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

const refreshRankings = async () => {
    console.log('🚀 Calcul des moyennes et mise à jour du classement...');

    // 1. Get all users
    const { data: users, error: userError } = await supabase.from('users').select('id');
    if (userError) {
        console.error('❌ Erreur récupération utilisateurs:', userError.message);
        return;
    }

    console.log(`👤 Traitement de ${users.length} étudiants...`);

    let count = 0;
    const batchSize = 50;

    for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        const userIds = batch.map(u => u.id);

        // Get grades for this batch
        const { data: grades } = await supabase
            .from('grades')
            .select('*')
            .in('user_id', userIds);

        const updatesAverages = [];
        const updatesSubjectAverages = [];

        // Process each user
        batch.forEach(user => {
            const userGrades = grades.filter(g => g.user_id === user.id);

            let totalWeightedSum = 0;
            let hasGrades = false;

            // Calculate subject averages
            SUBJECTS.forEach(subject => {
                const grade = userGrades.find(g => g.subject === subject.name);
                if (grade) {
                    const avg = (grade.exam_score * 0.6) + (grade.td_score * 0.4);
                    updatesSubjectAverages.push({
                        user_id: user.id,
                        subject: subject.name,
                        average: avg
                    });
                    totalWeightedSum += avg * subject.coefficient;
                    hasGrades = true;
                }
            });

            // Calculate general average
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
            // Check duplicates logic if needed, but upsert with user_id,subject conflict should work if constraint exists
            // Assuming primary key or unique constraint on (user_id, subject) for subject_averages
            const { error: subError } = await supabase
                .from('subject_averages')
                .upsert(updatesSubjectAverages, { onConflict: 'user_id,subject' });

            if (subError) console.error('  ⚠️ Erreur subject_averages:', subError.message);
        }

        // Bulk upsert general averages
        if (updatesAverages.length > 0) {
            const { error: avgError } = await supabase
                .from('averages')
                .upsert(updatesAverages, { onConflict: 'user_id' });

            if (avgError) console.error('  ⚠️ Erreur averages:', avgError.message);
        }

        count += batch.length;
        console.log(`  ✅ ${Math.min(count, users.length)}/${users.length} traités`);
    }

    console.log('🎉 Classement mis à jour avec succès!');
    process.exit(0);
};

refreshRankings().catch(e => { console.error(e); process.exit(1); });
