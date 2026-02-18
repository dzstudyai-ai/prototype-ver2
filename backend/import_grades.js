import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const CSV_FILENAME = 'notes_examne_A2S1_ALGEBRE3_MI2_A.csv';
const CSV_PATH = path.join(__dirname, `../${CSV_FILENAME}`); // Assumes file is in project root
const MODULE_NAME = 'Algèbre 3';
const SEMESTRE = 'S3';

async function importGrades() {
    try {
        console.log(`Reading CSV from: ${CSV_PATH}`);
        if (!fs.existsSync(CSV_PATH)) {
            console.error(`File not found: ${CSV_PATH}`);
            console.log("Please make sure the CSV file is named correctly and placed in the project root.");
            return;
        }

        const data = fs.readFileSync(CSV_PATH, 'utf8');
        const lines = data.split('\n');

        const grades = [];
        let skipped = 0;

        // Skip metadata (line 0) and header (line 1) -> Start at line 2?
        // User provided file content:
        // Line 1: formation de base...
        // Line 2: Matricule;Nom...
        // Line 3: Data...
        const START_LINE = 2;

        for (let i = START_LINE; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Handle CSV splitting with regex to respect quotes (e.g., "10;25")
            // This regex matches a semicolon only if it's followed by an even number of quotes
            const parts = line.split(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/);

            if (parts.length < 4) {
                skipped++;
                continue; // Not data line
            }

            const matricule = parts[0].trim();
            // Note is at index 3

            // Check formatted note
            let rawNote = parts[3] ? parts[3].trim() : '';

            // Remove surrounding quotes if present
            if (rawNote.startsWith('"') && rawNote.endsWith('"')) {
                rawNote = rawNote.slice(1, -1);
            }

            // Normalize decimal (10,5 -> 10.5, 10;25 -> 10.25)
            // If rawNote came from "10;25", it is now 10;25. Replace ; with .
            rawNote = rawNote.replace(',', '.').replace(';', '.');

            let note = null;
            let absent = false;

            if (rawNote === '' || rawNote.toLowerCase() === 'absent') {
                // Check 'Absent' column (index 4) or if Note itself says Absent
                if ((parts[4] && parts[4].trim() !== '') || rawNote.toLowerCase() === 'absent') {
                    absent = true;
                }
            } else {
                note = parseFloat(rawNote);
                if (isNaN(note)) {
                    // Maybe it's not a number check for observation?
                    if (rawNote.length > 5) { // Assuming notes are short
                        // Log warning but continue
                    }
                }
            }

            // Only add if we have a valid matricule (digits or ES...)
            if (matricule && (matricule.match(/^\d+$/) || matricule.startsWith('ES'))) {
                grades.push({
                    matricule,
                    module: MODULE_NAME,
                    semestre: SEMESTRE,
                    note: isNaN(note) ? null : note,
                    absent: absent,
                    observation: parts[6] ? parts[6].trim() : null
                });
            }
        }

        console.log(`Parsed ${grades.length} grades.`);

        // Batch upsert
        const batchSize = 100;
        for (let i = 0; i < grades.length; i += batchSize) {
            const batch = grades.slice(i, i + batchSize);
            const { error } = await supabase
                .from('exam_results')
                .upsert(batch, { onConflict: 'matricule, module, semestre' });

            if (error) {
                console.error(`Error processing batch ${i}:`, error.message);
            } else {
                console.log(`Processed batch ${i} - ${i + batch.length}`);
            }
        }

        console.log('Import complete.');

    } catch (err) {
        console.error('Import error:', err);
    }
}

importGrades();
