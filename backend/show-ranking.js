import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data } = await s.from('averages')
    .select('general_average, users(alias)')
    .order('general_average', { ascending: false })
    .limit(20);

// Map to same format
if (!data) {
    console.log('❌ Aucune donnée de classement trouvée.');
    process.exit(1);
}

const sorted = data.map(i => ({ alias: i.users.alias, avg: i.general_average }));

console.log('🏆 TOP 20 CLASSEMENT GÉNÉRAL (Depuis la table averages):\n');
sorted.forEach((u, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    console.log(`${medal} ${String(i + 1).padStart(2)}. @${u.alias.padEnd(20)} ${u.avg.toFixed(2)}`);
});

const { count } = await s.from('averages').select('*', { count: 'exact', head: true });

console.log('\n' + '='.repeat(45));
console.log(`📊 Total: ${count} étudiants dans le classement`);
console.log('='.repeat(45));
