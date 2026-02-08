import { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token') || null);
    const [loading, setLoading] = useState(true);

    // Configure Axios defaults
    if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    useEffect(() => {
        const checkUser = async () => {
            if (token) {
                try {
                    const { data } = await axios.get('/api/auth/me');
                    setUser(data);
                } catch (error) {
                    console.error("Auth check failed", error);
                    logout();
                }
            }
            setLoading(false);
        };
        checkUser();
    }, [token]);

    const login = async (studentId, password) => {
        const { data } = await axios.post('/api/auth/login', { studentId, password });
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data);
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
        return data;
    };

    const register = async (studentId, password) => {
        // Migration: check if there are guest grades in localStorage
        const guestGrades = localStorage.getItem('guest_grades');
        let initialGrades = null;
        if (guestGrades) {
            try {
                const parsed = JSON.parse(guestGrades);
                // Convert object { 'Analyse 03': {exam, td}, ... } to array for backend
                initialGrades = Object.entries(parsed).map(([subject, scores]) => ({
                    subject,
                    exam: parseFloat(scores.exam) || 0,
                    td: parseFloat(scores.td) || 0
                }));
            } catch (e) {
                console.error("Migration parse error", e);
            }
        }

        const { data } = await axios.post('/api/auth/register', {
            studentId,
            password,
            initialGrades
        });

        localStorage.setItem('token', data.token);
        // Clear guest data after successful migration
        localStorage.removeItem('guest_grades');

        setToken(data.token);
        setUser(data);
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
        return data;
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        delete axios.defaults.headers.common['Authorization'];
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
