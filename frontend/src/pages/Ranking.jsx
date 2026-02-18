import { useState, useEffect, useMemo, useRef } from 'react';
import { Trophy, Shield, CheckCircle, AlertCircle, Save, Settings, ChevronDown, ListFilter, Lock, Star, Sparkles, RefreshCcw, ArrowUp, ArrowDown, Users, Upload, ShieldCheck, Camera, X, Image, Loader2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from '../components/LoadingSpinner';

const SUBJECTS = [
    { name: 'general', i18nKey: 'Moyenne Générale' },
    { name: 'Analyse 03', i18nKey: 'Analyse 03' },
    { name: 'Algèbre 03', i18nKey: 'Algèbre 03' },
    { name: 'Économie d\'entreprise', i18nKey: 'Économie d\'entreprise' },
    { name: 'Probabilité et Statistique 01', i18nKey: 'Probabilité et Statistique 01' },
    { name: 'Anglais 02', i18nKey: 'Anglais 02' },
    { name: 'SFSD', i18nKey: 'SFSD' },
    { name: 'Architecture 02', i18nKey: 'Architecture 02' },
    { name: 'Électronique Fondamentale 02', i18nKey: 'Électronique Fondamentale 02' },
];

const Ranking = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [selectedSubject, setSelectedSubject] = useState('general');
    const [rankingData, setRankingData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [profileLoading, setProfileLoading] = useState(true);

    const [myAlias, setMyAlias] = useState('');
    const [displayMode, setDisplayMode] = useState('alias');
    const [aliasStatus, setAliasStatus] = useState('');
    const [isConfigured, setIsConfigured] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [filterMode, setFilterMode] = useState('all'); // all, top80, bottom20

    // Verification State
    const [isVerified, setIsVerified] = useState(null);
    const [verifying, setVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState('');
    const [manualId, setManualId] = useState('');
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [verifyDetails, setVerifyDetails] = useState(null);
    const [verifyResponse, setVerifyResponse] = useState(null); // Full response with trust score
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    const scrollToMyRank = () => {
        const element = document.getElementById('my-rank-row');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-4', 'ring-indigo-400');
            setTimeout(() => element.classList.remove('ring-4', 'ring-indigo-400'), 2000);
        }
    };

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const { data } = await api.get('/api/auth/me');
                setMyAlias(data.alias);
                setIsVerified(data.isVerified || false);
                if (data.displayMode) {
                    setDisplayMode(data.displayMode);
                    setIsConfigured(true);
                } else {
                    setSettingsOpen(true);
                    setIsConfigured(false);
                }
            } catch (error) {
                console.error("Error fetching profile:", error);
                setIsVerified(false);
            } finally {
                setProfileLoading(false);
            }
        };
        if (user) fetchProfile();
    }, [user]);

    const fetchRanking = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const endpoint = selectedSubject === 'general'
                ? `/api/rankings/general?_t=${Date.now()}`
                : `/api/rankings/subject/${selectedSubject}?_t=${Date.now()}`;

            const { data } = await api.get(endpoint);
            setRankingData(data);
        } catch (error) {
            console.error("Error fetching ranking:", error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    // 2. Fetch Ranking Data
    useEffect(() => {
        if (isConfigured) {
            const initRanking = async () => {
                // Force recalculation for the current user to ensure fresh data
                try {
                    await api.post('/api/grades/recalc');
                } catch (e) {
                    console.error("Recalc failed", e);
                }
                fetchRanking();
            };
            initRanking();

            const interval = setInterval(() => {
                fetchRanking(true);
            }, 30000);

            return () => clearInterval(interval);
        }
    }, [isConfigured, selectedSubject]);

    const handleRefresh = async () => {
        setLoading(true);
        try {
            await Promise.all([
                api.post('/api/rankings/refresh'),
                new Promise(resolve => setTimeout(resolve, 500))
            ]);
            await fetchRanking();
        } catch (error) {
            console.error("Refresh failed:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredData = useMemo(() => {
        if (filterMode === 'all') return rankingData;

        const total = rankingData.length;
        if (total === 0) return [];

        if (filterMode === 'top80') {
            const count = Math.ceil(total * 0.8);
            return rankingData.slice(0, count);
        }

        if (filterMode === 'bottom20') {
            const count = Math.ceil(total * 0.2);
            return rankingData.slice(-count);
        }
        return rankingData;
    }, [rankingData, filterMode]);

    const checkAliasUniqueness = async (alias) => {
        try {
            const { data } = await axios.get(`/api/auth/check-alias/${alias}`);
            setAliasStatus(data.available ? 'unique' : 'duplicate');
        } catch (error) {
            console.error("Error check alias", error);
        }
    };

    const handleAliasChange = (e) => {
        const value = e.target.value;
        setMyAlias(value);
        if (value.length > 2 && value !== (user?.alias || '')) {
            checkAliasUniqueness(value);
        } else {
            setAliasStatus('');
        }
    };

    const updateProfile = async () => {
        try {
            await axios.put('/api/auth/profile', {
                alias: myAlias,
                displayMode
            });
            setMessage(t('profileUpdated'));
            setIsConfigured(true);
            setSettingsOpen(false);
            setTimeout(() => setMessage(''), 3000);

            const currentSubj = selectedSubject;
            setSelectedSubject('');
            setTimeout(() => setSelectedSubject(currentSubj), 10);

        } catch (error) {
            setMessage(error.response?.data?.message || t('error'));
        }
    };

    // Handle file selection (from gallery or camera)
    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSelectedImage(file);
        setVerifyError('');
        setVerifyDetails(null);

        // Create preview
        const reader = new FileReader();
        reader.onload = (ev) => setImagePreview(ev.target.result);
        reader.readAsDataURL(file);
    };

    const clearImage = () => {
        setSelectedImage(null);
        setImagePreview(null);
        setVerifyDetails(null);
        setVerifyError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
    };

    const handleUploadVerify = async () => {
        if (verifying || isVerified) return;

        if (!manualId) {
            setVerifyError('Veuillez entrer votre matricule.');
            return;
        }
        if (!selectedImage) {
            setVerifyError('Veuillez prendre ou choisir une photo de votre carte.');
            return;
        }

        setVerifying(true);
        setVerifyError('');
        setVerifyDetails(null);
        setVerifyResponse(null);

        const formData = new FormData();
        formData.append('manualStudentId', manualId);
        formData.append('studentCard', selectedImage, 'student_card.jpg');

        try {
            const response = await axios.post('/api/auth/verify', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            console.log("✓ Verification SUCCESS:", response.data);
            setVerifyResponse(response.data);
            setVerifyDetails(response.data.details);
            setIsVerified(true);
            setSettingsOpen(true);
        } catch (err) {
            console.error("✗ Verification FAILED:", err);
            const data = err.response?.data;
            setVerifyResponse(data);
            setVerifyError(data?.message || 'Erreur de vérification.');
            if (data?.details) setVerifyDetails(data.details);
        } finally {
            setVerifying(false);
        }
    };

    if (profileLoading || isVerified === null) return <LoadingSpinner />;

    const selectedSubjectObj = SUBJECTS.find(s => s.name === selectedSubject);
    const selectedSubjectName = selectedSubjectObj ? t(selectedSubjectObj.i18nKey) : t('Moyenne Générale');

    return (
        <div className="w-full responsive-container py-[2rem] sm:py-[4rem]">

            {/* Header: Centered & Fluid */}
            <div className="text-center mb-[3.5rem] sm:mb-[5rem] px-4">
                <div className="inline-flex items-center justify-center w-[5.5rem] h-[5.5rem] sm:w-[7.5rem] sm:h-[7.5rem] bg-indigo-600 text-white rounded-[2.25rem] mb-[2rem] shadow-2xl shadow-indigo-100/50 transform rotate-3 hover:rotate-0 transition-all duration-500">
                    <Trophy size={40} />
                </div>
                <h1 className="text-[2.25rem] sm:text-[4rem] lg:text-[5rem] font-black text-gray-950 tracking-tighter mb-[1rem] leading-none uppercase">
                    {t('theRanking').split(' ')[0]} <span className="text-indigo-600">{t('theRanking').split(' ').slice(1).join(' ')}</span>
                </h1>

                <div className="mb-[1.5rem]">
                    <span className="bg-gray-950 text-white px-[1.5rem] py-[0.5rem] rounded-full font-black text-[0.625rem] sm:text-[0.75rem] uppercase tracking-[0.2em] shadow-xl inline-flex items-center gap-[0.75rem]">
                        <Sparkles size={14} className="animate-pulse" />
                        {t('promotionActive').toUpperCase()}
                    </span>
                </div>

                <p className="max-w-[28rem] mx-auto text-gray-400 font-bold text-[0.75rem] sm:text-[1rem] uppercase tracking-widest px-4">
                    {t('rankingDescription')}
                </p>
            </div>

            {/* VERIFICATION GATE */}
            {!isVerified && (
                <div className="bg-white shadow-3xl rounded-[2.5rem] p-[2rem] sm:p-[4rem] mb-[3.5rem] border-[0.25rem] border-amber-500 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-[15rem] h-[15rem] bg-amber-50 rounded-full -mr-[7rem] -mt-[7rem] blur-[5rem]"></div>
                    <div className="flex flex-col items-center text-center mb-[3rem] relative z-10">
                        <div className="p-[1.5rem] bg-amber-100 text-amber-600 rounded-[1.5rem] mb-[1.5rem]">
                            <ShieldCheck size={36} />
                        </div>
                        <h2 className="text-[1.75rem] sm:text-[2.5rem] font-black text-gray-950 mb-[1rem]">{t('verificationRequired')}</h2>
                        <p className="text-gray-500 font-bold text-[0.875rem] sm:text-[1rem] max-w-[30rem]">
                            {t('verificationInstruction')}
                        </p>
                    </div>

                    {/* Error Display */}
                    {verifyError && (
                        <div className="bg-red-50 border-2 border-red-100 text-red-600 p-[1rem] rounded-[1.25rem] mb-[2rem] text-[0.875rem] font-black whitespace-pre-line">
                            <div className="flex items-start gap-[0.75rem]">
                                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                                <span>{verifyError}</span>
                            </div>
                        </div>
                    )}

                    {/* Trust Score + Verification Details */}
                    {verifyResponse && (
                        <div className="mb-[2rem] max-w-[35rem] mx-auto space-y-[1.5rem]">

                            {/* Trust Score Gauge + Status Badge */}
                            <div className="flex items-center justify-center gap-[2rem] p-[1.5rem] rounded-[1.5rem] bg-gray-50 border-2 border-gray-100">
                                {/* Circular Score */}
                                <div className="relative w-[5rem] h-[5rem] flex-shrink-0">
                                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                                        <circle
                                            cx="50" cy="50" r="42" fill="none"
                                            strokeWidth="8" strokeLinecap="round"
                                            stroke={verifyResponse.confidence_score >= 70 ? '#22c55e' : verifyResponse.confidence_score >= 40 ? '#f59e0b' : '#ef4444'}
                                            strokeDasharray={`${(verifyResponse.confidence_score / 100) * 264} 264`}
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-[1.125rem] font-black text-gray-900">{verifyResponse.confidence_score}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className={`inline-flex px-[1rem] py-[0.375rem] rounded-full text-[0.75rem] font-black uppercase tracking-widest ${verifyResponse.validation_status === 'VALID' ? 'bg-green-100 text-green-700' :
                                        verifyResponse.validation_status === 'SUSPICIOUS' ? 'bg-amber-100 text-amber-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                        {verifyResponse.validation_status === 'VALID' ? '✅ VALIDE' :
                                            verifyResponse.validation_status === 'SUSPICIOUS' ? '⚠️ SUSPECT' : '❌ REJETÉ'}
                                    </div>
                                    <p className="text-[0.625rem] text-gray-400 font-bold mt-[0.5rem] uppercase tracking-widest">
                                        Score de confiance
                                    </p>
                                </div>
                            </div>

                            {/* Fraud Flags */}
                            {verifyResponse.fraud_flags && verifyResponse.fraud_flags.length > 0 && (
                                <div className="space-y-[0.5rem]">
                                    {verifyResponse.fraud_flags.map((flag, i) => (
                                        <div key={i} className={`flex items-start gap-[0.75rem] p-[1rem] rounded-[1rem] text-[0.8rem] font-bold border-2 ${flag.severity === 'CRITICAL' ? 'bg-red-50 border-red-200 text-red-700' :
                                            flag.severity === 'HIGH' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                                'bg-amber-50 border-amber-200 text-amber-700'
                                            }`}>
                                            <Shield size={16} className="flex-shrink-0 mt-0.5" />
                                            <span>{flag.message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Detail Checks */}
                            {verifyDetails && (
                                <div className="bg-gray-50 border-2 border-gray-100 rounded-[1.25rem] p-[1.5rem]">
                                    <p className="text-[0.625rem] font-black text-gray-400 uppercase tracking-[0.3em] mb-[1rem]">Détails de l'analyse</p>
                                    <div className="space-y-[0.625rem]">
                                        {[
                                            { ok: verifyDetails.qrFound, label: 'QR Code', detail: verifyDetails.qrFound ? 'détecté' : 'non détecté' },
                                            { ok: verifyDetails.nameFound, label: 'Nom', detail: verifyDetails.nameFound ? verifyDetails.detectedName : 'non trouvé' },
                                            { ok: verifyDetails.prenomFound, label: 'Prénom', detail: verifyDetails.prenomFound ? verifyDetails.detectedPrenom : 'non trouvé' },
                                            { ok: verifyDetails.matriculeMatch, label: 'Matricule', detail: verifyDetails.matriculeMatch ? 'correspond' : 'ne correspond pas' },
                                            { ok: verifyDetails.studentExists, label: 'Base de données', detail: verifyDetails.studentExists ? 'étudiant trouvé' : 'étudiant introuvable' },
                                        ].map((item, i) => (
                                            <div key={i} className={`flex items-center justify-between text-[0.8rem] font-bold ${item.ok ? 'text-green-600' : 'text-red-500'}`}>
                                                <div className="flex items-center gap-[0.5rem]">
                                                    {item.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                                    <span>{item.label}</span>
                                                </div>
                                                <span className="text-[0.7rem] opacity-80">{item.detail}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Image Quality + OCR Confidence mini bars */}
                                    {(verifyDetails.imageQuality != null || verifyDetails.ocrConfidence != null) && (
                                        <div className="mt-[1rem] pt-[1rem] border-t border-gray-200 space-y-[0.5rem]">
                                            {verifyDetails.imageQuality != null && (
                                                <div className="flex items-center gap-[0.75rem] text-[0.7rem] font-bold text-gray-500">
                                                    <span className="w-[6rem]">Qualité image</span>
                                                    <div className="flex-1 h-[0.375rem] bg-gray-200 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full transition-all ${verifyDetails.imageQuality >= 60 ? 'bg-green-500' : verifyDetails.imageQuality >= 35 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${verifyDetails.imageQuality}%` }} />
                                                    </div>
                                                    <span className="w-[2rem] text-right">{verifyDetails.imageQuality}%</span>
                                                </div>
                                            )}
                                            {verifyDetails.ocrConfidence != null && (
                                                <div className="flex items-center gap-[0.75rem] text-[0.7rem] font-bold text-gray-500">
                                                    <span className="w-[6rem]">OCR confiance</span>
                                                    <div className="flex-1 h-[0.375rem] bg-gray-200 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full transition-all ${verifyDetails.ocrConfidence >= 60 ? 'bg-green-500' : verifyDetails.ocrConfidence >= 35 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${verifyDetails.ocrConfidence}%` }} />
                                                    </div>
                                                    <span className="w-[2rem] text-right">{verifyDetails.ocrConfidence}%</span>
                                                </div>
                                            )}
                                            {verifyDetails.screenshotProbability != null && verifyDetails.screenshotProbability > 20 && (
                                                <div className="flex items-center gap-[0.75rem] text-[0.7rem] font-bold text-red-500">
                                                    <span className="w-[6rem]">Screenshot</span>
                                                    <div className="flex-1 h-[0.375rem] bg-gray-200 rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${verifyDetails.screenshotProbability}%` }} />
                                                    </div>
                                                    <span className="w-[2rem] text-right">{verifyDetails.screenshotProbability}%</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-[2rem] max-w-[35rem] mx-auto relative z-10">
                        {/* Student ID Input */}
                        <div>
                            <label className="block text-[0.625rem] font-black text-amber-600 uppercase tracking-[0.3em] mb-[1rem]">{t('enterStudentId')}</label>
                            <input
                                type="text"
                                className="w-full bg-gray-50 border-2 border-transparent rounded-[1.5rem] py-[1.25rem] px-[1.5rem] text-[1.125rem] font-black text-gray-900 focus:border-amber-500 focus:bg-white outline-none transition-all shadow-inner"
                                value={manualId}
                                onChange={(e) => setManualId(e.target.value)}
                                placeholder="202412345678"
                            />
                        </div>

                        {/* Photo Upload */}
                        <div>
                            <label className="block text-[0.625rem] font-black text-amber-600 uppercase tracking-[0.3em] mb-[1rem]">{t('uploadCardPhoto') || 'Photo de la carte'}</label>

                            {/* Hidden file inputs */}
                            <input
                                ref={cameraInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileSelect}
                                className="hidden"
                            />

                            {!imagePreview ? (
                                <div className="grid grid-cols-2 gap-[1rem]">
                                    <button
                                        type="button"
                                        onClick={() => cameraInputRef.current?.click()}
                                        disabled={verifying}
                                        className="flex flex-col items-center justify-center gap-[0.75rem] py-[2rem] px-[1rem] rounded-[1.5rem] border-2 border-dashed border-amber-200 bg-amber-50 text-amber-600 hover:border-amber-400 hover:bg-amber-100 font-black transition-all touch-feedback"
                                    >
                                        <Camera size={28} />
                                        <span className="text-[0.75rem] uppercase tracking-wider">Prendre Photo</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={verifying}
                                        className="flex flex-col items-center justify-center gap-[0.75rem] py-[2rem] px-[1rem] rounded-[1.5rem] border-2 border-dashed border-amber-200 bg-amber-50 text-amber-600 hover:border-amber-400 hover:bg-amber-100 font-black transition-all touch-feedback"
                                    >
                                        <Image size={28} />
                                        <span className="text-[0.75rem] uppercase tracking-wider">Galerie</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <img
                                        src={imagePreview}
                                        alt="Aperçu carte"
                                        className="w-full rounded-[1.5rem] border-2 border-amber-200 object-cover max-h-[20rem]"
                                    />
                                    <button
                                        onClick={clearImage}
                                        className="absolute top-[0.75rem] right-[0.75rem] p-[0.5rem] bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all"
                                    >
                                        <X size={16} />
                                    </button>
                                    <p className="mt-[0.75rem] text-center text-[0.625rem] text-green-600 font-black uppercase tracking-widest flex items-center justify-center gap-[0.5rem]">
                                        <CheckCircle size={12} /> Photo sélectionnée
                                    </p>
                                </div>
                            )}
                            <p className="mt-[0.75rem] text-center text-[0.625rem] text-gray-400 font-bold uppercase tracking-widest">
                                Prenez une photo nette de votre carte étudiante (QR code visible).
                            </p>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="button"
                            onClick={handleUploadVerify}
                            disabled={verifying || !manualId || !selectedImage}
                            className="w-full flex items-center justify-center gap-[1rem] py-[1.5rem] px-[2rem] rounded-[1.5rem] bg-amber-500 text-white font-black text-[0.875rem] uppercase tracking-widest shadow-xl hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all touch-feedback"
                        >
                            {verifying ? (
                                <>
                                    <Loader2 size={22} className="animate-spin" />
                                    Analyse en cours...
                                </>
                            ) : (
                                <>
                                    <Upload size={22} />
                                    Vérifier ma carte
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {isVerified && !isConfigured && (
                <div className="bg-white shadow-3xl rounded-[2.5rem] p-[2rem] sm:p-[4rem] mb-[3.5rem] border-[0.25rem] border-indigo-600 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-[15rem] h-[15rem] bg-indigo-50 rounded-full -mr-[7rem] -mt-[7rem] blur-[5rem]"></div>
                    <div className="flex flex-col items-center text-center mb-[3rem]">
                        <div className="p-[1.5rem] bg-indigo-50 text-indigo-600 rounded-[1.5rem] mb-[1.5rem]">
                            <Lock size={36} />
                        </div>
                        <h2 className="text-[1.75rem] sm:text-[2.5rem] font-black text-gray-950 mb-[1rem]">{t('accessRanking')}</h2>
                        <p className="text-gray-500 font-bold text-[0.875rem] sm:text-[1rem] max-w-[30rem]">
                            {t('identityInstruction')}
                        </p>
                    </div>

                    <div className="space-y-[2.5rem] max-w-[35rem] mx-auto">
                        <div>
                            <label className="block text-[0.625rem] font-black text-indigo-600 uppercase tracking-[0.3em] mb-[1rem]">{t('aliasLabel')}</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    className={`w-full bg-gray-50 border-2 rounded-[1.5rem] py-[1.25rem] px-[1.5rem] pr-[4rem] text-[1.125rem] font-black transition-all outline-none ${aliasStatus === 'unique' ? 'border-green-100 bg-green-50 text-green-700' :
                                        aliasStatus === 'duplicate' ? 'border-red-100 bg-red-50 text-red-700' :
                                            'border-transparent focus:border-indigo-500 focus:bg-white text-gray-900 shadow-inner'
                                        }`}
                                    value={myAlias}
                                    onChange={handleAliasChange}
                                    placeholder={t('aliasPlaceholder')}
                                />
                                <div className="absolute right-[1.5rem] top-1/2 -translate-y-1/2">
                                    {aliasStatus === 'unique' && <CheckCircle className="text-green-500" size={28} />}
                                    {aliasStatus === 'duplicate' && <AlertCircle className="text-red-500" size={28} />}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[0.625rem] font-black text-indigo-600 uppercase tracking-[0.3em] mb-[1rem]">{t('displayModeLabel')}</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[1rem]">
                                <button
                                    onClick={() => setDisplayMode('alias')}
                                    className={`flex items-center justify-center gap-[0.75rem] py-[1.25rem] px-[1.5rem] rounded-[1.5rem] border-2 font-black transition-all text-[0.75rem] uppercase tracking-widest touch-feedback ${displayMode === 'alias' ? 'border-indigo-600 bg-indigo-600 text-white shadow-xl' : 'border-gray-50 bg-gray-50 text-gray-400 font-bold'}`}
                                >
                                    🎭 {t('alias').toUpperCase()}
                                </button>
                                <button
                                    onClick={() => setDisplayMode('studentNumber')}
                                    className={`flex items-center justify-center gap-[0.75rem] py-[1.25rem] px-[1.5rem] rounded-[1.5rem] border-2 font-black transition-all text-[0.75rem] uppercase tracking-widest touch-feedback ${displayMode === 'studentNumber' ? 'border-indigo-600 bg-indigo-600 text-white shadow-xl' : 'border-gray-50 bg-gray-50 text-gray-400 font-bold'}`}
                                >
                                    🆔 {t('studentNumber').toUpperCase()}
                                </button>
                            </div>
                        </div>

                        <div className="pt-[2rem]">
                            <button
                                onClick={updateProfile}
                                disabled={aliasStatus === 'duplicate' || !myAlias}
                                className="w-full bg-gray-950 text-white py-[1.25rem] rounded-[1.5rem] font-black text-[0.875rem] sm:text-[1rem] uppercase tracking-[0.2em] shadow-2xl hover:bg-black disabled:opacity-30 transition-all touch-feedback flex items-center justify-center gap-[1rem]"
                            >
                                <Save size={20} /> {t('validateIdentity')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isVerified && isConfigured && (
                <>
                    {/* Action Bar */}
                    <div className="flex flex-col xl:flex-row gap-[1rem] mb-[2rem] sm:mb-[3rem] sticky top-[5.5rem] z-40">
                        {/* Subject Selector */}
                        <div className="flex-1 relative group bg-gray-50/80 backdrop-blur-xl rounded-2xl p-2">
                            <div className="relative">
                                <div className="absolute left-[1.5rem] top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none group-focus-within:text-indigo-600 transition-colors">
                                    <ListFilter size={24} />
                                </div>
                                <select
                                    className="w-full bg-white border-2 border-gray-100 rounded-[1.5rem] py-[1.25rem] pl-[4rem] pr-[3rem] font-black text-gray-900 text-[0.875rem] sm:text-[1rem] shadow-xl focus:border-indigo-500 transition-all outline-none appearance-none cursor-pointer"
                                    value={selectedSubject}
                                    onChange={(e) => setSelectedSubject(e.target.value)}
                                >
                                    {SUBJECTS.map(s => (
                                        <option key={s.name} value={s.name}>{t(s.i18nKey)}</option>
                                    ))}
                                </select>
                                <div className="absolute right-[1.5rem] top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                    <ChevronDown size={20} />
                                </div>
                            </div>
                        </div>

                        {/* Filter Buttons & Config */}
                        <div className="flex flex-wrap items-center gap-[0.75rem] bg-gray-50/80 backdrop-blur-xl p-2 rounded-2xl">
                            {/* Refresh Button */}
                            <button
                                onClick={handleRefresh}
                                title={t('refresh')}
                                className="p-[1.25rem] rounded-[1.5rem] bg-white border-2 border-gray-100 text-indigo-600 shadow-xl hover:bg-indigo-50 transition-all active:scale-95"
                            >
                                <RefreshCcw size={22} className={loading ? "animate-spin" : ""} />
                            </button>

                            <button
                                onClick={scrollToMyRank}
                                title={t('goToMyRank')}
                                className="p-[1.25rem] rounded-[1.5rem] bg-indigo-600 border-2 border-indigo-600 text-white shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
                            >
                                <ArrowDown size={22} />
                            </button>

                            {/* Filter Group */}
                            <div className="flex p-1 bg-white rounded-[1.5rem] border-2 border-gray-100 shadow-xl">
                                <button
                                    onClick={() => setFilterMode('all')}
                                    className={`px-[1.25rem] py-[1rem] rounded-[1.25rem] font-black text-[0.75rem] uppercase tracking-wider transition-all flex items-center gap-2 ${filterMode === 'all' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <Users size={18} />
                                    <span className="hidden sm:inline">{t('allStudents')}</span>
                                </button>
                                <button
                                    onClick={() => setFilterMode('top80')}
                                    className={`px-[1.25rem] py-[1rem] rounded-[1.25rem] font-black text-[0.75rem] uppercase tracking-wider transition-all flex items-center gap-2 ${filterMode === 'top80' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <ArrowUp size={18} />
                                    <span className="hidden sm:inline">{t('top80')}</span>
                                </button>
                                <button
                                    onClick={() => setFilterMode('bottom20')}
                                    className={`px-[1.25rem] py-[1rem] rounded-[1.25rem] font-black text-[0.75rem] uppercase tracking-wider transition-all flex items-center gap-2 ${filterMode === 'bottom20' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <ArrowDown size={18} />
                                    <span className="hidden sm:inline">{t('bottom20')}</span>
                                </button>
                            </div>

                            <button
                                onClick={() => setSettingsOpen(!settingsOpen)}
                                className={`flex items-center justify-center gap-[1rem] px-[1.5rem] py-[1.25rem] rounded-[1.5rem] font-black text-[0.75rem] uppercase tracking-widest transition-all border-2 shadow-xl touch-feedback ${settingsOpen ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-100' : 'bg-white border-gray-100 text-gray-600'
                                    }`}
                            >
                                <Settings size={22} />
                                <ChevronDown className={`transition-transform duration-500 ${settingsOpen ? 'rotate-180' : ''}`} size={18} />
                            </button>
                        </div>
                    </div>

                    {settingsOpen && (
                        <div className="bg-white shadow-3xl rounded-[2.5rem] p-[1.5rem] sm:p-[3rem] mb-[3rem] border border-indigo-50 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="space-y-[2rem]">
                                <div>
                                    <label className="block text-[0.625rem] font-black text-indigo-600 uppercase tracking-[0.3em] mb-[1rem]">{t('changeAlias')}</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            className={`w-full bg-gray-50 border-2 rounded-[1.25rem] py-[1.125rem] px-[1.5rem] pr-[3.5rem] text-[1.125rem] font-black outline-none transition-all ${aliasStatus === 'unique' ? 'border-green-100 bg-green-50 text-green-700' :
                                                aliasStatus === 'duplicate' ? 'border-red-100 bg-red-50 text-red-700' :
                                                    'border-transparent focus:border-indigo-500 focus:bg-white text-gray-900 shadow-inner'
                                                }`}
                                            value={myAlias}
                                            onChange={handleAliasChange}
                                        />
                                        <div className="absolute right-[1rem] top-1/2 -translate-y-1/2">
                                            {aliasStatus === 'unique' && <CheckCircle className="text-green-500" size={24} />}
                                            {aliasStatus === 'duplicate' && <AlertCircle className="text-red-500" size={24} />}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[0.625rem] font-black text-indigo-600 uppercase tracking-[0.3em] mb-[1rem]">{t('displayModeLabel')}</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-[1rem]">
                                        <button
                                            onClick={() => setDisplayMode('alias')}
                                            className={`flex items-center justify-center gap-[0.75rem] py-[1.125rem] px-[1.5rem] rounded-[1.25rem] border-2 font-black transition-all text-[0.7rem] uppercase tracking-widest touch-feedback ${displayMode === 'alias' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-50 bg-gray-50 text-gray-400'}`}
                                        >
                                            🎭 {t('alias').toUpperCase()}
                                        </button>
                                        <button
                                            onClick={() => setDisplayMode('studentNumber')}
                                            className={`flex items-center justify-center gap-[0.75rem] py-[1.125rem] px-[1.5rem] rounded-[1.25rem] border-2 font-black transition-all text-[0.7rem] uppercase tracking-widest touch-feedback ${displayMode === 'studentNumber' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-50 bg-gray-50 text-gray-400'}`}
                                        >
                                            🆔 {t('studentNumber').toUpperCase()}
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-[1.5rem] border-t border-gray-100 flex justify-end">
                                    <button
                                        onClick={updateProfile}
                                        disabled={aliasStatus === 'duplicate'}
                                        className="w-full sm:w-auto bg-gray-950 text-white px-[3rem] py-[1.125rem] rounded-[1.25rem] font-black text-[0.75rem] uppercase tracking-widest touch-feedback shadow-xl hover:bg-black"
                                    >
                                        <Save size={18} className="inline mr-[0.5rem]" /> {t('saveChanges')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Ranking Table: 100% Width */}
                    <div className="bg-white shadow-3xl rounded-[2.5rem] overflow-hidden border border-gray-100/50">
                        <div className="px-[1.5rem] sm:px-[3rem] py-[2rem] sm:py-[3.5rem] bg-gray-950 text-white relative">
                            <div className="absolute top-0 right-0 w-[10rem] h-[10rem] bg-indigo-600/20 rounded-full -mr-[5rem] -mt-[5rem] blur-[3rem]"></div>
                            <div className="flex items-center justify-between gap-[1rem] relative z-10">
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-[1.75rem] sm:text-[2.5rem] font-black tracking-tighter leading-none mb-[0.5rem] truncate">{selectedSubjectName}</h2>
                                    <p className="text-indigo-400 text-[0.625rem] sm:text-[0.75rem] font-black uppercase tracking-[0.2em]">{rankingData.length} {t('studentsCompeting')}</p>
                                </div>
                                <Star className="text-yellow-400/20 flex-shrink-0" size={48} />
                            </div>
                        </div>

                        {loading ? (
                            <div className="py-[4rem]">
                                <LoadingSpinner transparent />
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {filteredData.map((student) => {
                                    const isMyRow = myAlias && student.alias === myAlias;
                                    const rank = student.rank;

                                    return (
                                        <div key={student.rank} id={isMyRow ? "my-rank-row" : undefined} className={`flex items-center gap-[1rem] sm:gap-[2.5rem] px-[1.25rem] sm:px-[3rem] py-[1.5rem] sm:py-[2.5rem] border-b border-gray-50 transition-all ${isMyRow ? 'bg-indigo-50/50 border-l-[0.5rem] border-indigo-600' : 'hover:bg-gray-50/50'}`}>

                                            <div className="flex-shrink-0">
                                                <div className={`flex items-center justify-center w-[3rem] h-[3rem] sm:w-[4rem] sm:h-[4rem] rounded-[1rem] sm:rounded-[1.25rem] text-[1.125rem] sm:text-[1.5rem] font-black shadow-lg transition-transform ${rank === 1 ? 'bg-yellow-400 text-white rotate-6 scale-105' :
                                                    rank === 2 ? 'bg-gray-300 text-white -rotate-3' :
                                                        rank === 3 ? 'bg-orange-400 text-white rotate-12' :
                                                            'bg-white text-gray-400 border border-gray-100 shadow-sm'
                                                    }`}>
                                                    {rank}
                                                </div>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-[0.125rem] sm:gap-[1rem]">
                                                    <span className={`text-[1.125rem] sm:text-[1.5rem] font-black tracking-tight truncate ${isMyRow ? 'text-indigo-950' : 'text-gray-950'}`}>
                                                        {student.displayName}
                                                    </span>
                                                    {isMyRow && <span className="inline-flex w-fit px-[0.5rem] py-[0.125rem] bg-indigo-600 text-white text-[0.5rem] font-black uppercase tracking-widest rounded-md">{t('you')}</span>}
                                                </div>
                                                <p className="text-[0.55rem] sm:text-[0.625rem] font-bold text-gray-300 uppercase tracking-widest mt-0.5">{t('semester')}</p>
                                            </div>

                                            <div className="flex-shrink-0 text-right">
                                                <div className={`px-[1rem] sm:px-[1.5rem] py-[0.5rem] sm:py-[0.875rem] rounded-[1rem] text-[1.25rem] sm:text-[2rem] font-black border-2 shadow-sm ${parseFloat(student.average) >= 10
                                                    ? 'bg-green-50 text-green-600 border-green-100'
                                                    : 'bg-red-50 text-red-600 border-red-100 font-bold'
                                                    }`}>
                                                    {parseFloat(student.average).toFixed(2)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}

            <footer className="mt-[5rem] text-center opacity-30 pb-[2rem]">
            </footer>
        </div>
    );
};

export default Ranking;
