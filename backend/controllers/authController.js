import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/db.js';
import { calculateAverages } from './gradeController.js';

const ADJECTIVES = ['Silent', 'Blue', 'Cosmic', 'Swift', 'Brave', 'Neon', 'Crimson', 'Shadow', 'Solar', 'Arctic'];
const NOUNS = ['Wolf', 'Eagle', 'Tiger', 'Falcon', 'Lion', 'Phoenix', 'Dragon', 'Bear', 'Shark', 'Raven'];

const generateUniqueAlias = async () => {
    let alias;
    let isUnique = false;

    while (!isUnique) {
        const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
        const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
        const num = Math.floor(Math.random() * 900) + 100;
        alias = `${adj}${noun}${num}`;

        const { data } = await supabase.from('users').select('id').eq('alias', alias).single();
        if (!data) isUnique = true;
    }

    return alias;
};

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Register
export const registerUser = async (req, res) => {
    const { studentId, password, initialGrades } = req.body;

    try {
        // Student ID validation
        if (!/^\d{12}$/.test(studentId)) {
            return res.status(400).json({ message: 'Le numéro étudiant doit contenir exactement 12 chiffres' });
        }

        if (!studentId.startsWith('2024')) {
            return res.status(400).json({ message: 'Le numéro étudiant doit commencer par 2024' });
        }

        // Check if user exists
        const { data: userExists } = await supabase
            .from('users')
            .select('student_id')
            .eq('student_id', studentId)
            .maybeSingle();

        if (userExists) {
            return res.status(400).json({ message: 'Utilisateur déjà existant' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const alias = await generateUniqueAlias();

        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{ student_id: studentId, password_hash: hashedPassword, alias }])
            .select()
            .single();

        if (error) throw error;

        // Migrate initial grades if provided (Guest Mode migration)
        if (initialGrades && Array.isArray(initialGrades)) {
            const gradesToInsert = initialGrades.map(g => ({
                user_id: newUser.id,
                subject: g.subject,
                exam_score: g.exam,
                td_score: g.td,
                coefficient: g.coefficient || 1
            }));

            const { error: gradeError } = await supabase
                .from('grades')
                .insert(gradesToInsert);

            if (gradeError) console.error("Migration error:", gradeError);
        }

        // Calculate averages immediately for the new user
        await calculateAverages(newUser.id);

        res.status(201).json({
            _id: newUser.id,
            studentId: newUser.student_id,
            alias: newUser.alias,
            token: generateToken(newUser.id),
        });
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: error.message || 'Une erreur est survenue lors de l\'inscription' });
    }
};

// Login
export const authUser = async (req, res) => {
    try {
        const { studentId, password } = req.body;

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('student_id', studentId)
            .single();

        if (error || !user) {
            return res.status(401).json({ message: 'Identifiants incorrects' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Identifiants incorrects' });
        }

        res.json({
            _id: user.id,
            studentId: user.student_id,
            alias: user.alias,
            token: generateToken(user.id),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get Profile
export const getUserProfile = async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, student_id, alias, display_mode, is_verified')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;

        res.json({
            _id: user.id,
            studentId: user.student_id,
            alias: user.alias,
            displayMode: user.display_mode,
            isVerified: user.is_verified || false,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Check alias uniqueness
export const checkAlias = async (req, res) => {
    try {
        const { alias } = req.params;

        const { data } = await supabase
            .from('users')
            .select('id')
            .ilike('alias', alias)
            .single();

        res.json({ available: !data });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update Profile
export const updateProfile = async (req, res) => {
    try {
        const { alias, displayMode } = req.body;
        const userId = req.user.id;

        const updates = {};
        if (displayMode) updates.display_mode = displayMode;

        // If updating alias, check uniqueness first (unless it's the same)
        if (alias) {
            const { data: existing } = await supabase
                .from('users')
                .select('id')
                .eq('alias', alias)
                .neq('id', userId) // Exclude self
                .single();

            if (existing) {
                return res.status(400).json({ message: 'Ce pseudonyme est déjà pris' });
            }
            updates.alias = alias;
        }

        if (Object.keys(updates).length > 0) {
            const { error } = await supabase
                .from('users')
                .update(updates)
                .eq('id', userId);

            if (error) throw error;
        }

        res.json({ message: 'Profil mis à jour' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
