import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, LogIn, Mail, Lock, ShieldCheck, RefreshCcw, Eye, EyeOff, Check, X, Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../App';

const Register = () => {
    const { t } = useTranslation();
    const { register } = useAuth();
    const { setDemoMode } = useDemo();
    const [studentId, setStudentId] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // Password strength calculation
    const passwordStrength = useMemo(() => {
        if (!password) return { level: 0, label: '', color: '' };

        let strength = 0;

        // Length checks
        if (password.length >= 6) strength += 1;
        if (password.length >= 10) strength += 1;

        // Character variety checks
        if (/[a-z]/.test(password)) strength += 1;
        if (/[A-Z]/.test(password)) strength += 1;
        if (/[0-9]/.test(password)) strength += 1;
        if (/[^a-zA-Z0-9]/.test(password)) strength += 1;

        if (strength <= 2) {
            return { level: 1, label: t('passwordWeak'), color: 'bg-red-500' };
        } else if (strength <= 4) {
            return { level: 2, label: t('passwordMedium'), color: 'bg-yellow-500' };
        } else {
            return { level: 3, label: t('passwordStrong'), color: 'bg-green-500' };
        }
    }, [password, t]);

    // Password match check
    const passwordsMatch = useMemo(() => {
        if (!confirmPassword) return null;
        return password === confirmPassword;
    }, [password, confirmPassword]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate passwords match
        if (password !== confirmPassword) {
            setError(t('passwordMismatch'));
            return;
        }

        setLoading(true);
        setError('');
        try {
            await register(studentId, password);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || t('registrationError'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full responsive-container min-h-[calc(100vh-6rem)] flex items-center justify-center py-[2rem]">
            <div className="w-full max-w-[30rem] bg-white shadow-3xl rounded-[2.5rem] p-[2rem] sm:p-[3.5rem] border border-gray-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[14rem] h-[14rem] bg-indigo-50 rounded-full -mr-[7rem] -mt-[7rem] blur-[5rem]"></div>

                <div className="relative z-10">
                    <div className="flex flex-col items-center mb-[2.5rem] text-center">
                        <div className="p-[1.25rem] bg-indigo-600 text-white rounded-[1.25rem] mb-[1.5rem] shadow-xl shadow-indigo-100 transform rotate-3">
                            <UserPlus size={32} />
                        </div>
                        <h1 className="text-[2rem] sm:text-[2.5rem] font-black text-gray-950 tracking-tighter leading-none mb-2">{t('registration')}</h1>
                        <p className="text-gray-400 font-bold text-[0.75rem] uppercase tracking-widest">{t('promotionMI')}</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border-2 border-red-100 text-red-600 p-[1rem] rounded-[1.25rem] mb-[2.5rem] text-[0.875rem] font-black flex items-center gap-[0.75rem] animate-in fade-in slide-in-from-top-2">
                            <ShieldCheck size={18} /> {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-[1.5rem]">
                        <div className="space-y-[0.75rem]">
                            <label className="block text-[0.625rem] font-black text-indigo-600 uppercase tracking-[0.2em] ml-1">{t('studentMatricule')}</label>
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
                                    placeholder={t('passwordMin')}
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

                            {/* Password Strength Indicator */}
                            {password && (
                                <div className="mt-[0.75rem] space-y-[0.5rem]">
                                    <div className="flex gap-[0.25rem]">
                                        <div className={`h-[0.25rem] flex-1 rounded-full transition-all ${passwordStrength.level >= 1 ? passwordStrength.color : 'bg-gray-200'}`}></div>
                                        <div className={`h-[0.25rem] flex-1 rounded-full transition-all ${passwordStrength.level >= 2 ? passwordStrength.color : 'bg-gray-200'}`}></div>
                                        <div className={`h-[0.25rem] flex-1 rounded-full transition-all ${passwordStrength.level >= 3 ? passwordStrength.color : 'bg-gray-200'}`}></div>
                                    </div>
                                    <p className={`text-[0.625rem] font-black uppercase tracking-wider ${passwordStrength.level === 1 ? 'text-red-500' :
                                        passwordStrength.level === 2 ? 'text-yellow-600' :
                                            'text-green-600'
                                        }`}>
                                        {t('passwordStrength')}: {passwordStrength.label}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Confirm Password Field */}
                        <div className="space-y-[0.75rem]">
                            <label className="block text-[0.625rem] font-black text-indigo-600 uppercase tracking-[0.2em] ml-1">{t('confirmPassword')}</label>
                            <div className="relative group">
                                <div className="absolute left-[1.25rem] top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    required
                                    className={`w-full bg-gray-50 border-2 rounded-[1.25rem] py-[1.125rem] pl-[3.5rem] pr-[3.5rem] text-[1rem] font-black text-gray-950 focus:bg-white outline-none transition-all shadow-inner ${confirmPassword
                                        ? passwordsMatch
                                            ? 'border-green-500 focus:border-green-500'
                                            : 'border-red-500 focus:border-red-500'
                                        : 'border-transparent focus:border-indigo-600'
                                        }`}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder={t('confirmPassword')}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-[1.25rem] top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors p-1 touch-feedback"
                                    aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')}
                                >
                                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            {/* Password Match Indicator */}
                            {confirmPassword && (
                                <div className={`flex items-center gap-[0.5rem] mt-[0.5rem] ${passwordsMatch ? 'text-green-600' : 'text-red-500'}`}>
                                    {passwordsMatch ? <Check size={14} /> : <X size={14} />}
                                    <span className="text-[0.625rem] font-black uppercase tracking-wider">
                                        {passwordsMatch ? t('passwordMatch') : t('passwordMismatch')}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="bg-indigo-50/50 p-[1.25rem] rounded-[1.25rem] border border-indigo-100 mb-[1rem]">
                            <p className="text-[0.625rem] font-bold text-indigo-400 leading-relaxed uppercase tracking-wider">
                                <span className="text-indigo-600 font-black">Note :</span> {t('privacyNotice').split(': ').slice(1).join(': ')}
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || (confirmPassword && !passwordsMatch)}
                            className="w-full bg-indigo-600 text-white py-[1.25rem] rounded-[1.25rem] font-black text-[1rem] uppercase tracking-widest shadow-2xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all touch-feedback flex items-center justify-center gap-[0.75rem]"
                        >
                            {loading ? <RefreshCcw className="animate-spin" size={20} /> : <UserPlus size={20} />}
                            {loading ? t('registering') : t('registerNow')}
                        </button>
                    </form>

                    <div className="mt-[2.5rem] pt-[2rem] border-t border-gray-50 text-center flex flex-col items-center gap-[1.25rem]">
                        <p className="text-gray-400 font-bold text-[0.875rem]">{t('hasAccount')}</p>
                        <div className="flex flex-wrap items-center justify-center gap-[0.75rem]">
                            <Link to="/login" className="inline-flex items-center gap-[0.5rem] px-[1.5rem] py-[1.125rem] bg-gray-950 text-white rounded-[1.25rem] font-black text-[0.75rem] uppercase tracking-widest hover:bg-black transition-all shadow-xl touch-feedback">
                                <LogIn size={18} /> {t('loginNow')}
                            </Link>
                            <button
                                onClick={() => {
                                    setDemoMode(true);
                                    navigate('/');
                                }}
                                className="inline-flex items-center gap-[0.5rem] px-[1.5rem] py-[1.125rem] bg-amber-500 text-white rounded-[1.25rem] font-black text-[0.75rem] uppercase tracking-widest hover:bg-amber-600 transition-all shadow-xl touch-feedback"
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

export default Register;


