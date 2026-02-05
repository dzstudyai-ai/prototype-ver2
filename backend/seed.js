import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SUBJECTS = [
    'Analyse 03', 'Algèbre 03', 'Économie d\'entreprise',
    'Probabilité et Statistique 01', 'Anglais 02', 'SFSD',
    'Architecture 02', 'Électronique Fondamentale 02'
];

const ADJECTIVES = ['Silent', 'Blue', 'Cosmic', 'Swift', 'Brave', 'Neon', 'Crimson', 'Shadow', 'Solar', 'Arctic', 'Golden', 'Iron', 'Steel', 'Thunder', 'Storm'];
const NOUNS = ['Wolf', 'Eagle', 'Tiger', 'Falcon', 'Lion', 'Phoenix', 'Dragon', 'Bear', 'Shark', 'Raven', 'Panther', 'Hawk', 'Viper', 'Fox', 'Cobra'];

const generateRandomGrade = () => Math.round((Math.random() * 13 + 5) * 100) / 100;

const generateAlias = (i) => {
    const adj = ADJECTIVES[i % ADJECTIVES.length];
    const noun = NOUNS[Math.floor(i / ADJECTIVES.length) % NOUNS.length];
    return `${adj}${noun}${100 + i}`;
};

const seedDatabase = async () => {
    console.log('🚀 FAST SEED: 150 étudiants avec bulk insert...\n');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('test123', salt);

    // Generate all 150 users
    const users = [];
    for (let i = 1; i <= 150; i++) {
        users.push({
            student_id: `2024${String(i).padStart(8, '0')}`,
            password_hash: passwordHash,
            alias: generateAlias(i),
            display_mode: 'alias'
        });
    }

    console.log('📦 Insertion de 150 utilisateurs...');

    // Bulk insert users (ignore conflicts)
    const { data: insertedUsers, error: userError } = await supabase
        .from('users')
        .upsert(users, { onConflict: 'student_id', ignoreDuplicates: false })
        .select('id, student_id');

    if (userError) {
        console.error('❌ Erreur users:', userError.message);
        // Try to get existing users
        const { data: existingUsers } = await supabase.from('users').select('id, student_id');
        if (!existingUsers) {
            console.error('Impossible de récupérer les utilisateurs');
            process.exit(1);
        }
        console.log(`✅ ${existingUsers.length} utilisateurs trouvés`);

        // Generate grades for existing users
        const grades = [];
        existingUsers.forEach(user => {
            SUBJECTS.forEach(subject => {
                grades.push({
                    user_id: user.id,
                    subject: subject,
                    exam_score: generateRandomGrade(),
                    td_score: generateRandomGrade()
                });
            });
        });

        console.log(`📊 Insertion de ${grades.length} notes...`);

        // Delete old grades first
        await supabase.from('grades').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        // Bulk insert grades in chunks of 500
        for (let i = 0; i < grades.length; i += 500) {
            const chunk = grades.slice(i, i + 500);
            const { error: gradeError } = await supabase.from('grades').insert(chunk);
            if (gradeError) console.error('⚠️ Chunk error:', gradeError.message);
            else console.log(`  ✅ ${i + chunk.length}/${grades.length} notes insérées`);
        }
    } else {
        console.log(`✅ ${insertedUsers?.length || 150} utilisateurs créés/mis à jour`);

        // Get all user IDs
        const { data: allUsers } = await supabase.from('users').select('id');

        // Generate grades
        const grades = [];
        allUsers.forEach(user => {
            SUBJECTS.forEach(subject => {
                grades.push({
                    user_id: user.id,
                    subject: subject,
                    exam_score: generateRandomGrade(),
                    td_score: generateRandomGrade()
                });
            });
        });

        console.log(`📊 Suppression anciennes notes...`);
        await supabase.from('grades').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        console.log(`📊 Insertion de ${grades.length} notes...`);
        for (let i = 0; i < grades.length; i += 500) {
            const chunk = grades.slice(i, i + 500);
            await supabase.from('grades').insert(chunk);
            console.log(`  ✅ ${i + chunk.length}/${grades.length}`);
        }
    }

    console.log('\n🎉 TERMINÉ! Vérifiez le classement sur le site.');
    process.exit(0);
};

seedDatabase().catch(e => { console.error(e); process.exit(1); });
