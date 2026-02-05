import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, Menu, X, LayoutDashboard, Trophy, Globe, Sun, Moon } from 'lucide-react';
import { useState, useEffect } from 'react';

const Navbar = () => {
    const { t, i18n } = useTranslation();
    const { user, logout } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const location = useLocation();

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    // Auto-close menu on route change
    useEffect(() => {
        setIsOpen(false);
    }, [location]);

    // Responsive cleanup: Close menu when screen size expands to desktop
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) setIsOpen(false);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Prevent body scroll when menu is active
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
    }, [isOpen]);

    const activeLinkClass = "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20";
    const inactiveLinkClass = "text-gray-300 hover:text-white";

    return (
        <nav className="w-full bg-gray-950 text-white sticky top-0 z-[100] border-b border-white/10 shadow-lg transition-all">
            <div className="w-full max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-[4.5rem] sm:h-[6rem]">

                    {/* Branding */}
                    <Link to="/" className="flex items-center active:scale-95 transition-transform">
                        <span className="font-black text-[1.125rem] sm:text-[1.5rem] tracking-tighter uppercase">
                            {t('rankings')}<span className="text-indigo-500">.</span>
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden lg:flex items-center gap-[0.5rem]">
                        {user && (
                            <div className="flex items-center gap-[0.5rem] mr-[1.5rem] border-r border-white/10 pr-[1.5rem]">
                                <Link to="/" className={`flex items-center gap-[0.5rem] px-[1.5rem] py-[0.75rem] rounded-[1rem] text-[0.7rem] font-black uppercase tracking-widest transition-all ${location.pathname === '/' ? activeLinkClass : inactiveLinkClass}`}>
                                    <LayoutDashboard size={16} /> {t('dashboard')}
                                </Link>
                                <Link to="/rankings" className={`flex items-center gap-[0.5rem] px-[1.5rem] py-[0.75rem] rounded-[1rem] text-[0.7rem] font-black uppercase tracking-widest transition-all ${location.pathname === '/rankings' ? activeLinkClass : inactiveLinkClass}`}>
                                    <Trophy size={16} /> {t('rankings')}
                                </Link>
                            </div>
                        )}

                        <div className="flex items-center gap-[1rem]">
                            {user ? (
                                <div className="flex items-center gap-[1.5rem]">
                                    <div className="flex flex-col items-end">
                                        <span className="text-[0.55rem] font-black uppercase text-indigo-400 tracking-[0.2em]">{t('online')}</span>
                                        <span className="text-[0.875rem] font-black opacity-90 truncate max-w-[8rem]">@{user.alias}</span>
                                    </div>
                                    <button onClick={logout} className="bg-red-500/10 border border-red-500/20 hover:bg-red-500 p-[0.75rem] rounded-[1rem] transition-all touch-feedback">
                                        <LogOut size={20} className="text-red-500 hover:text-white" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-[1rem]">
                                    <Link to="/login" className="px-[1.5rem] py-[0.75rem] text-[0.7rem] font-black tracking-widest uppercase hover:text-indigo-400 transition-colors">{t('login')}</Link>
                                    <Link to="/register" className="bg-indigo-600 hover:bg-indigo-500 px-[2rem] py-[0.875rem] rounded-[1rem] text-[0.7rem] font-black shadow-lg shadow-indigo-600/20 uppercase tracking-widest transition-all touch-feedback">{t('register')}</Link>
                                </div>
                            )}

                            {/* Dark Mode Toggle */}
                            <button
                                onClick={toggleTheme}
                                className="p-[0.75rem] rounded-[1rem] bg-white/5 border border-white/10 hover:bg-white/10 transition-all touch-feedback"
                                aria-label={isDark ? t('lightMode') : t('darkMode')}
                            >
                                {isDark ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-indigo-400" />}
                            </button>

                            {/* Language Selector */}
                            <div className="flex bg-white/5 rounded-[1rem] p-[0.25rem] border border-white/10">
                                <button onClick={() => changeLanguage('fr')} className={`px-[0.75rem] py-[0.375rem] rounded-[0.75rem] text-[0.625rem] font-black transition-all ${i18n.language === 'fr' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-white'}`}>FR</button>
                                <button onClick={() => changeLanguage('en')} className={`px-[0.75rem] py-[0.375rem] rounded-[0.75rem] text-[0.625rem] font-black transition-all ${i18n.language === 'en' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-white'}`}>EN</button>
                            </div>
                        </div>
                    </div>

                    {/* Mobile Toggle */}
                    <div className="lg:hidden flex items-center gap-[0.5rem]">
                        {/* Mobile Dark Mode Toggle */}
                        <button
                            onClick={toggleTheme}
                            className="p-[0.625rem] rounded-[0.75rem] bg-white/5 border border-white/10 transition-all"
                            aria-label={isDark ? t('lightMode') : t('darkMode')}
                        >
                            {isDark ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-indigo-400" />}
                        </button>
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="p-[0.75rem] text-gray-400 hover:text-white transition-colors flex items-center justify-center outline-none"
                            aria-expanded={isOpen}
                            aria-label="Toggle Menu"
                        >
                            {isOpen ? <X size={32} /> : <Menu size={32} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* SIDE-DRAWER MOBILE MENU */}
            <div className={`fixed inset-0 z-[120] lg:hidden transition-all duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                {/* Backdrop */}
                <div className="absolute inset-0 bg-gray-950/90" onClick={() => setIsOpen(false)} />

                <div className={`absolute top-0 right-0 h-full w-[17rem] bg-gray-950 border-l border-white/10 shadow-2xl transition-transform duration-300 transform ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    <div className="flex flex-col h-full pt-[5rem] px-[1.5rem] pb-[2rem]">

                        {/* User Header */}
                        {user && (
                            <div className="mb-[2rem] p-[1.5rem] bg-indigo-600 rounded-[1.5rem] shadow-xl shadow-indigo-900/40 text-center flex flex-col items-center">
                                <div className="w-[3.5rem] h-[3.5rem] bg-white/20 rounded-[1rem] flex items-center justify-center mb-3">
                                    <Trophy size={24} className="text-white" />
                                </div>
                                <div>
                                    <p className="text-[0.55rem] font-black text-white/60 tracking-[0.2em] mb-[0.125rem]">{t('myProfile')}</p>
                                    <p className="text-[1.125rem] font-black text-white truncate max-w-[12rem]">@{user.alias}</p>
                                </div>
                            </div>
                        )}

                        {/* Navigation Links */}
                        <div className="flex flex-col gap-[0.75rem] mb-auto">
                            <Link to="/" className={`flex items-center gap-[1rem] p-[1.125rem] rounded-[1.25rem] text-[0.875rem] font-black transition-all ${location.pathname === '/' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
                                <LayoutDashboard size={20} /> {t('dashboard')}
                            </Link>

                            <Link to="/rankings" className={`flex items-center gap-[1rem] p-[1.125rem] rounded-[1.25rem] text-[0.875rem] font-black transition-all ${location.pathname === '/rankings' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
                                <Trophy size={20} /> {t('rankings')}
                            </Link>

                            {!user && (
                                <div className="flex flex-col gap-[1rem] mt-[1rem]">
                                    <Link to="/login" className="text-center p-[1rem] text-gray-400 font-black text-[0.875rem] hover:text-white border border-white/10 rounded-[1.25rem] transition-colors">{t('login')}</Link>
                                    <Link to="/register" className="text-center p-[1rem] bg-indigo-600 text-white rounded-[1.25rem] font-black text-[0.875rem] uppercase tracking-widest shadow-lg active:scale-95 transition-transform">{t('register')}</Link>
                                </div>
                            )}
                        </div>

                        {/* Theme Selector */}
                        <div className="mt-[2rem] pt-[1.5rem] border-t border-white/5">
                            <div className="flex items-center gap-[1rem] mb-[1rem] text-gray-500">
                                {isDark ? <Moon size={16} /> : <Sun size={16} />}
                                <span className="text-[0.625rem] font-black uppercase tracking-[0.2em]">{t('themeSelector')}</span>
                            </div>
                            <div className="flex bg-white/5 rounded-[1.125rem] p-[0.375rem] border border-white/10">
                                <button onClick={() => isDark && toggleTheme()} className={`flex-1 py-[0.75rem] rounded-[0.875rem] text-[0.75rem] font-black transition-all flex items-center justify-center gap-[0.5rem] ${!isDark ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500'}`}>
                                    <Sun size={14} /> {t('lightMode')}
                                </button>
                                <button onClick={() => !isDark && toggleTheme()} className={`flex-1 py-[0.75rem] rounded-[0.875rem] text-[0.75rem] font-black transition-all flex items-center justify-center gap-[0.5rem] ${isDark ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500'}`}>
                                    <Moon size={14} /> {t('darkMode')}
                                </button>
                            </div>
                        </div>

                        {/* Language Selector */}
                        <div className="mt-[1.5rem] pt-[1.5rem] border-t border-white/5">
                            <div className="flex items-center gap-[1rem] mb-[1rem] text-gray-500">
                                <Globe size={16} />
                                <span className="text-[0.625rem] font-black uppercase tracking-[0.2em]">{t('languageSelector')}</span>
                            </div>
                            <div className="flex bg-white/5 rounded-[1.125rem] p-[0.375rem] border border-white/10">
                                <button onClick={() => changeLanguage('fr')} className={`flex-1 py-[0.75rem] rounded-[0.875rem] text-[0.75rem] font-black transition-all ${i18n.language === 'fr' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500'}`}>{t('french')}</button>
                                <button onClick={() => changeLanguage('en')} className={`flex-1 py-[0.75rem] rounded-[0.875rem] text-[0.75rem] font-black transition-all ${i18n.language === 'en' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500'}`}>{t('english')}</button>
                            </div>
                        </div>

                        {/* Logout Button */}
                        {user && (
                            <button onClick={logout} className="mt-[2rem] flex items-center justify-center gap-[0.75rem] w-full p-[1.125rem] bg-red-500/10 text-red-500 border border-red-500/20 rounded-[1.25rem] font-black text-[0.875rem] active:scale-95 transition-all">
                                <LogOut size={18} /> {t('logout')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
