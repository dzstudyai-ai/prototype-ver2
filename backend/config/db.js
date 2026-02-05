import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
    console.log('SUPABASE_URL:', supabaseUrl);
    console.log('SUPABASE_SERVICE_KEY:', supabaseServiceKey ? '[SET]' : '[NOT SET]');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const connectDB = async () => {
    try {
        const { data, error } = await supabase.from('subjects').select('count');
        if (error) throw error;
        console.log('✅ Supabase Connected');
    } catch (error) {
        console.error('❌ Supabase Connection Error:', error.message);
    }
};
