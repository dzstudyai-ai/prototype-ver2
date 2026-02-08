import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend directory
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use Service Key for write access to protected table

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Adjust path to point to the CSV file in the root 'prototype' folder
const CSV_FILE = path.join(__dirname, '../notes_examne_A2S1_ALGEBRE3_MI2_A.csv');

async function importStudents() {
    try {
        console.log(`Reading CSV from: ${CSV_FILE}`);
        const data = fs.readFileSync(CSV_FILE, 'utf8');
        const lines = data.split('\n');

        const students = [];

        // Skip header (line 0)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(';');
            if (parts.length < 7) continue;

            const matricule = parts[0].trim();
            const nom_fr = parts[3].trim();
            const nom_ar = parts[4].trim();
            const prenom_fr = parts[5].trim();
            const prenom_ar = parts[6].trim();

            if (matricule && nom_fr) {
                students.push({
                    matricule,
                    nom_fr,
                    nom_ar,
                    prenom_fr,
                    prenom_ar
                });
            }
        }

        console.log(`Found ${students.length} students to import.`);

        // Batch insert (Supabase limit is usually 1000 rows per request)
        const batchSize = 100;
        for (let i = 0; i < students.length; i += batchSize) {
            const batch = students.slice(i, i + batchSize);
            const { error } = await supabase
                .from('students_list')
                .upsert(batch, { onConflict: 'matricule' });

            if (error) {
                console.error(`Error importing batch ${i}:`, error);
            } else {
                console.log(`Imported batch ${i} - ${i + batch.length}`);
            }
        }

        console.log('Import completed successfully!');

    } catch (err) {
        console.error('Import failed:', err);
    }
}

importStudents();
