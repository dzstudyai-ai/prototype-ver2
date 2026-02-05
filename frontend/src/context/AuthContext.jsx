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
        const { data } = await axios.post('/api/auth/register', { studentId, password });
        localStorage.setItem('token', data.token);
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
