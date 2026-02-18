
const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'data.txt');
const outputFile = path.join(__dirname, 'seed_grades.sql');

const data = fs.readFileSync(inputFile, 'utf8');
const lines = data.split('\n');

const subject = 'Algèbre 03';
const semestre = 'S3';

let sql = `
-- Recreate table (Global Grades)
DROP TABLE IF EXISTS official_grades;
CREATE TABLE official_grades (
    id bigint generated always as identity primary key,
    matricule text not null,
    subject text not null,
    semestre text not null,
    exam_score numeric(4,2),
    td_score numeric(4,2), -- Added for completeness if needed, or just single 'note'
    final_note numeric(4,2), -- The one in CSV seems to be Exam or Final?
    absent boolean default false,
    observation text,
    created_at timestamp with time zone default now(),
    unique(matricule, subject, semestre)
);

ALTER TABLE official_grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read" ON official_grades FOR SELECT USING (true);
CREATE POLICY "Service Write" ON official_grades FOR ALL USING (true) WITH CHECK (true);

INSERT INTO official_grades (matricule, subject, semestre, final_note, absent, observation) VALUES
`;

const values = [];

for (const line of lines) {
    const parts = line.split(';');
    if (parts.length < 4) continue;

    const matricule = parts[0].trim();
    if (!matricule || matricule.startsWith('Matricule') || matricule.includes('formation')) continue;

    let rawNote = parts[3] ? parts[3].trim() : '';
    let absent = false;

    // Clean note
    if (rawNote.includes('"')) rawNote = rawNote.replace(/"/g, '');
    rawNote = rawNote.replace(',', '.').replace(';', '.');

    let noteVal = 'NULL';

    if (rawNote === '' || rawNote.toLowerCase() === 'absent') {
        const absCol = parts[4] ? parts[4].trim() : '';
        if (absCol || rawNote.toLowerCase() === 'absent') {
            absent = true;
        }
    } else {
        const parsed = parseFloat(rawNote);
        if (!isNaN(parsed)) {
            noteVal = parsed;
        }
    }

    // Observation
    const obs = parts[6] ? parts[6].trim() : '';
    const safeObs = obs ? `'${obs.replace(/'/g, "''")}'` : 'NULL';

    if (matricule.match(/^\d+$/) || matricule.startsWith('ES')) {
        values.push(`('${matricule}', '${subject}', '${semestre}', ${noteVal}, ${absent}, ${safeObs})`);
    }
}

if (values.length > 0) {
    sql += values.join(',\n') + ';';
    fs.writeFileSync(outputFile, sql);
    console.log(`Generated SQL with ${values.length} inserts.`);
} else {
    console.log('No data found.');
}
