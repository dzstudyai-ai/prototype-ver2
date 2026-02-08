import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, UserPlus, ShieldCheck, Mail, Lock, RefreshCcw, Eye, EyeOff, Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../App';

const Login = () => {
    const { t } = useTranslation();
    const { login } = useAuth();
    const { setDemoMode } = useDemo();
    const [studentId, setStudentId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await login(studentId, password);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || t('credentialsInvalid'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full responsive-container min-h-[calc(100vh-6rem)] flex items-center justify-center py-[2rem]">
            <div className="w-full max-w-[28rem] bg-white shadow-3xl rounded-[2.5rem] p-[2rem] sm:p-[3rem] border border-gray-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[12rem] h-[12rem] bg-indigo-50 rounded-full -mr-[6rem] -mt-[6rem] blur-[4rem]"></div>

                <div className="relative z-10">
                    <div className="flex flex-col items-center mb-[2.5rem] text-center">
                        <div className="p-[1.25rem] bg-indigo-600 text-white rounded-[1.25rem] mb-[1.5rem] shadow-xl shadow-indigo-100 transform -rotate-3">
                            <LogIn size={32} />
                        </div>
                        <h1 className="text-[2rem] sm:text-[2.5rem] font-black text-gray-950 tracking-tighter leading-none mb-2">{t('welcomeBack')}</h1>
                        <p className="text-gray-400 font-bold text-[0.75rem] uppercase tracking-widest">{t('studentVersion')}</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border-2 border-red-100 text-red-600 p-[1rem] rounded-[1.25rem] mb-[2rem] text-[0.875rem] font-black flex items-center gap-[0.75rem] animate-in fade-in slide-in-from-top-2">
                            <ShieldCheck size={18} /> {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-[1.5rem]">
                        <div className="space-y-[0.75rem]">
                            <label className="block text-[0.625rem] font-black text-indigo-600 uppercase tracking-[0.2em] ml-1">{t('matriculeHelp')}</label>
                            <div className="relative group">
                                <div className="absolute left-[1.25rem] top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors">
                                    <Mail size={18} />
                                </div>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-gray-50 border-2 border-transparent rounded-[1.25rem] py-[1.125rem] pl-[3.5rem] pr-[1.25rem] text-[1rem] font-black text-gray-950 focus:bg-white focus:border-indigo-600 outline-none transition-all shadow-inner"
                                    value={studentId}
                                    onChange={(e) => setStudentId(e.target.value)}
                                    placeholder="2024XXXXXXXX"
                                />
                            </div>
                        </div>

                        <div className="space-y-[0.75rem]">
                            <label className="block text-[0.625rem] font-black text-indigo-600 uppercase tracking-[0.2em] ml-1">{t('password')}</label>
                            <div className="relative group">
                                <div className="absolute left-[1.25rem] top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    className="w-full bg-gray-50 border-2 border-transparent rounded-[1.25rem] py-[1.125rem] pl-[3.5rem] pr-[3.5rem] text-[1rem] font-black text-gray-950 focus:bg-white focus:border-indigo-600 outline-none transition-all shadow-inner"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-[1.25rem] top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors p-1 touch-feedback"
                                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 text-white py-[1.25rem] rounded-[1.25rem] font-black text-[1rem] uppercase tracking-widest shadow-2xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all touch-feedback flex items-center justify-center gap-[0.75rem]"
                        >
                            {loading ? <RefreshCcw className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
                            {loading ? t('authenticating') : t('loginNow')}
                        </button>
                    </form>

                    <div className="mt-[2.5rem] pt-[2rem] border-t border-gray-50 text-center flex flex-col items-center gap-[1.25rem]">
                        <p className="text-gray-400 font-bold text-[0.875rem]">{t('noAccount')}</p>
                        <div className="flex flex-wrap items-center justify-center gap-[0.75rem]">
                            <Link to="/register" className="inline-flex items-center gap-[0.5rem] px-[1.5rem] py-[1rem] bg-gray-950 text-white rounded-[1.25rem] font-black text-[0.75rem] uppercase tracking-widest hover:bg-black transition-all shadow-xl touch-feedback">
                                <UserPlus size={18} /> {t('createAccount')}
                            </Link>
                            <button
                                onClick={() => {
                                    setDemoMode(true);
                                    navigate('/');
                                }}
                                className="inline-flex items-center gap-[0.5rem] px-[1.5rem] py-[1rem] bg-amber-500 text-white rounded-[1.25rem] font-black text-[0.75rem] uppercase tracking-widest hover:bg-amber-600 transition-all shadow-xl touch-feedback"
                            >
                                <Calculator size={18} /> {t('tryGuestMode')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;

