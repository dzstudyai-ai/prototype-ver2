import jwt from 'jsonwebtoken';
import { supabase } from '../config/db.js';

export const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization?.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            const { data: user, error } = await supabase
                .from('users')
                .select('id, student_id, alias, is_verified')
                .eq('id', decoded.id)
                .single();

            if (error || !user) {
                return res.status(401).json({ message: 'Non autorisé' });
            }

            req.user = { id: user.id, studentId: user.student_id, alias: user.alias, isVerified: user.is_verified };
            next();
        } catch (error) {
            res.status(401).json({ message: 'Non autorisé, token invalide' });
        }
    } else {
        res.status(401).json({ message: 'Non autorisé, pas de token' });
    }
};

// Middleware to restrict access to verified users only
export const verifiedOnly = (req, res, next) => {
    if (req.user && req.user.isVerified) {
        next();
    } else {
        res.status(403).json({ message: 'Accès refusé. Vérification requise.' });
    }
};
