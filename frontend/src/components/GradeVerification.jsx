import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, Clock, Upload, CheckCircle2, XCircle, AlertTriangle, Camera, Copy, RefreshCcw, X, FileImage, Loader2 } from 'lucide-react';
import api from '../api';

const STEPS = [
    { id: 1, label: 'Code de vérification' },
    { id: 2, label: 'Analyse d\'images' },
    { id: 3, label: 'Extraction OCR' },
    { id: 4, label: 'Validation structure' },
    { id: 5, label: 'Détection falsification' },
    { id: 6, label: 'Calcul des moyennes' },
    { id: 7, label: 'Score de confiance' },
];

const GradeVerification = ({ isOpen, onClose, onCodeGenerated }) => {
    const [phase, setPhase] = useState('idle');
    const [code, setCode] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [currentStep, setCurrentStep] = useState(0);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [tdFile, setTdFile] = useState(null);
    const [examFile, setExamFile] = useState(null);
    const [tdPreview, setTdPreview] = useState(null);
    const [examPreview, setExamPreview] = useState(null);
    const tdInputRef = useRef(null);
    const examInputRef = useRef(null);
    const timerRef = useRef(null);

    // Countdown
    useEffect(() => {
        if (phase === 'code' && timeLeft > 0) {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        setError('Code expiré ! Générez un nouveau code.');
                        setPhase('idle');
                        if (onCodeGenerated) onCodeGenerated(null, 0);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timerRef.current);
        }
    }, [phase, timeLeft]);

    useEffect(() => {
        if (!isOpen) clearInterval(timerRef.current);
    }, [isOpen]);

    const generateCode = async () => {
        setError(null);
        setResult(null);
        setTdFile(null);
        setExamFile(null);
        setTdPreview(null);
        setExamPreview(null);
        try {
            const token = localStorage.getItem('token');
            const { data } = await api.get('/api/grades/verify/code', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCode(data.code);
            setTimeLeft(data.ttl_seconds);
            setPhase('code');
            if (onCodeGenerated) onCodeGenerated(data.code, data.ttl_seconds);
        } catch (err) {
            setError(err.response?.data?.error || 'Erreur lors de la génération du code');
        }
    };

    const handleFileSelect = (file, type) => {
        if (!file) return;
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            setError('Format invalide. Utilisez PNG, JPEG ou WebP.');
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            setError('Fichier trop volumineux (max 15 Mo).');
            return;
        }
        setError(null);
        const url = URL.createObjectURL(file);
        if (type === 'td') { setTdFile(file); setTdPreview(url); }
        else { setExamFile(file); setExamPreview(url); }
    };

    const submitVerification = async () => {
        if (!code || (!tdFile && !examFile)) {
            setError('Veuillez ajouter au moins une capture.');
            return;
        }

        setError(null);
        setPhase('processing');
        setCurrentStep(1);

        const stepInterval = setInterval(() => {
            setCurrentStep(prev => {
                if (prev >= 7) { clearInterval(stepInterval); return 7; }
                return prev + 1;
            });
        }, 1800);

        try {
            const formData = new FormData();
            formData.append('code', code);
            if (tdFile) formData.append('tdScreenshot', tdFile);
            if (examFile) formData.append('examScreenshot', examFile);

            const token = localStorage.getItem('token');
            const { data } = await api.post('/api/grades/verify/submit', formData, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });

            clearInterval(stepInterval);
            setCurrentStep(7);
            setResult(data);
            setPhase('result');
            if (onCodeGenerated) onCodeGenerated(null, 0);
        } catch (err) {
            clearInterval(stepInterval);
            const errData = err.response?.data;
            if (errData) { setResult(errData); setPhase('result'); }
            else { setError('Erreur de connexion au serveur.'); setPhase('code'); }
            if (onCodeGenerated) onCodeGenerated(null, 0);
        }
    };

    const reset = () => {
        setPhase('idle');
        setCode(null);
        setTimeLeft(0);
        setCurrentStep(0);
        setResult(null);
        setError(null);
        setTdFile(null);
        setExamFile(null);
        setTdPreview(null);
        setExamPreview(null);
        clearInterval(timerRef.current);
        if (onCodeGenerated) onCodeGenerated(null, 0);
    };

    if (!isOpen) return null;

    const timerPercentage = (timeLeft / 120) * 100;
    const timerColor = timeLeft > 40 ? 'text-green-400' : timeLeft > 15 ? 'text-amber-400' : 'text-red-400';
    const timerBg = timeLeft > 40 ? 'bg-green-400' : timeLeft > 15 ? 'bg-amber-400' : 'bg-red-400';

    return (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            <div
                className="relative w-full sm:max-w-[40rem] max-h-[95vh] overflow-y-auto bg-gray-950 rounded-t-[2rem] sm:rounded-[2rem] border border-gray-800 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-xl border-b border-gray-800 px-5 sm:px-6 py-4 sm:py-5 rounded-t-[2rem]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
                                <Shield size={18} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-white font-black text-base sm:text-lg tracking-tight">Vérification Notes</h2>
                                <p className="text-gray-500 text-[0.6rem] sm:text-xs font-bold uppercase tracking-widest">Anti-Triche S3</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center">
                            <X size={16} className="text-gray-400" />
                        </button>
                    </div>
                </div>

                <div className="p-5 sm:p-6">
                    {/* Error */}
                    {error && (
                        <div className="mb-4 p-3 sm:p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                            <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                            <p className="text-red-300 text-xs sm:text-sm font-bold">{error}</p>
                        </div>
                    )}

                    {/* ═══ IDLE ═══ */}
                    {phase === 'idle' && (
                        <div className="text-center py-6 sm:py-8">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-indigo-600/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                                <Shield size={30} className="text-indigo-400" />
                            </div>
                            <h3 className="text-white font-black text-lg sm:text-xl mb-2">Vérifier vos notes</h3>
                            <p className="text-gray-400 text-xs sm:text-sm mb-6 max-w-sm mx-auto leading-relaxed">
                                Vérifiez l'authenticité de vos notes via deux captures : <span className="text-indigo-400 font-bold">Notes TD</span> et <span className="text-indigo-400 font-bold">Notes Examen</span>.
                            </p>

                            <div className="bg-gray-900/50 rounded-2xl p-4 sm:p-5 mb-6 text-left">
                                <h4 className="text-white font-black text-xs uppercase tracking-wider mb-3">Comment ça marche</h4>
                                <div className="space-y-2.5">
                                    {['Générez un code — il s\'affiche en overlay', 'Ouvrez Progrès → notes TD S3',
                                        'Capturez l\'écran (le code est visible)', 'Ouvrez Progrès → notes Examen S3',
                                        'Capturez l\'écran (le code est visible)', 'Soumettez les 2 captures ici'].map((step, i) => (
                                            <div key={i} className="flex items-start gap-2.5">
                                                <span className="w-5 h-5 sm:w-6 sm:h-6 bg-indigo-600/20 text-indigo-400 rounded-md flex items-center justify-center text-[0.6rem] sm:text-xs font-black shrink-0">{i + 1}</span>
                                                <span className="text-gray-300 text-xs sm:text-sm">{step}</span>
                                            </div>
                                        ))}
                                </div>
                            </div>

                            <button
                                onClick={generateCode}
                                className="w-full py-3.5 sm:py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-black text-xs sm:text-sm uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                            >
                                <Shield size={16} />
                                Générer le code
                            </button>
                        </div>
                    )}

                    {/* ═══ CODE + DUAL UPLOAD ═══ */}
                    {phase === 'code' && (
                        <div className="py-3 sm:py-4">
                            {/* Code + Timer */}
                            <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/10 rounded-2xl p-4 sm:p-5 mb-5 border border-indigo-500/20 text-center">
                                <p className="text-indigo-300 text-[0.6rem] sm:text-xs font-black uppercase tracking-[0.3em] mb-2">Code de vérification</p>
                                <span className="text-white font-mono text-2xl sm:text-3xl font-black tracking-[0.15em] select-all block mb-3">{code}</span>
                                <div className="flex items-center justify-center gap-2">
                                    <Clock size={14} className={timerColor} />
                                    <span className={`font-mono font-black text-base sm:text-lg ${timerColor}`}>
                                        {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                                    </span>
                                </div>
                                <div className="mt-2 w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-1000 ${timerBg}`} style={{ width: `${timerPercentage}%` }} />
                                </div>
                            </div>

                            {/* Dual Upload Zones */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
                                {/* TD Upload */}
                                <div
                                    onClick={() => tdInputRef.current?.click()}
                                    className={`cursor-pointer rounded-xl border-2 border-dashed p-4 sm:p-5 text-center transition-all active:scale-[0.98] ${tdFile ? 'border-green-500/30 bg-green-500/5' : 'border-gray-700 hover:border-indigo-500/50 bg-gray-900/30'
                                        }`}
                                >
                                    <input ref={tdInputRef} type="file" accept="image/*" onChange={e => handleFileSelect(e.target.files[0], 'td')} className="hidden" />
                                    {tdPreview ? (
                                        <div>
                                            <img src={tdPreview} alt="TD" className="w-full h-24 sm:h-32 object-cover rounded-lg mb-2" />
                                            <p className="text-green-400 text-xs font-bold flex items-center justify-center gap-1">
                                                <CheckCircle2 size={12} /> Notes TD
                                            </p>
                                        </div>
                                    ) : (
                                        <div>
                                            <Camera size={24} className="mx-auto mb-2 text-gray-500" />
                                            <p className="text-white font-bold text-xs sm:text-sm">Notes TD</p>
                                            <p className="text-gray-500 text-[0.6rem] sm:text-xs mt-1">Capture écran TD</p>
                                        </div>
                                    )}
                                </div>

                                {/* Exam Upload */}
                                <div
                                    onClick={() => examInputRef.current?.click()}
                                    className={`cursor-pointer rounded-xl border-2 border-dashed p-4 sm:p-5 text-center transition-all active:scale-[0.98] ${examFile ? 'border-green-500/30 bg-green-500/5' : 'border-gray-700 hover:border-indigo-500/50 bg-gray-900/30'
                                        }`}
                                >
                                    <input ref={examInputRef} type="file" accept="image/*" onChange={e => handleFileSelect(e.target.files[0], 'exam')} className="hidden" />
                                    {examPreview ? (
                                        <div>
                                            <img src={examPreview} alt="Exam" className="w-full h-24 sm:h-32 object-cover rounded-lg mb-2" />
                                            <p className="text-green-400 text-xs font-bold flex items-center justify-center gap-1">
                                                <CheckCircle2 size={12} /> Notes Examen
                                            </p>
                                        </div>
                                    ) : (
                                        <div>
                                            <FileImage size={24} className="mx-auto mb-2 text-gray-500" />
                                            <p className="text-white font-bold text-xs sm:text-sm">Notes Examen</p>
                                            <p className="text-gray-500 text-[0.6rem] sm:text-xs mt-1">Capture écran Exam</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={submitVerification}
                                disabled={!tdFile && !examFile}
                                className={`w-full py-3.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${tdFile || examFile
                                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                    }`}
                            >
                                <Upload size={16} />
                                Soumettre {tdFile && examFile ? '2 captures' : '1 capture'}
                            </button>

                            <button onClick={reset} className="w-full mt-3 py-2.5 bg-gray-800/50 hover:bg-gray-800 text-gray-400 font-bold text-xs uppercase tracking-widest rounded-xl transition-colors">
                                Annuler
                            </button>
                        </div>
                    )}

                    {/* ═══ PROCESSING ═══ */}
                    {phase === 'processing' && (
                        <div className="py-6 sm:py-8">
                            <div className="text-center mb-6">
                                <Loader2 size={32} className="text-indigo-400 animate-spin mx-auto mb-3" />
                                <h3 className="text-white font-black text-base sm:text-lg">Vérification en cours...</h3>
                                <p className="text-gray-500 text-[0.6rem] sm:text-xs mt-1">Analyse des captures</p>
                            </div>

                            <div className="space-y-2">
                                {STEPS.map((step) => {
                                    const isActive = currentStep === step.id;
                                    const isDone = currentStep > step.id;

                                    return (
                                        <div key={step.id} className={`flex items-center gap-3 p-2.5 sm:p-3 rounded-lg transition-all duration-500 ${isActive ? 'bg-indigo-600/10 border border-indigo-500/20' :
                                            isDone ? 'bg-green-500/5' : 'bg-gray-900/20'
                                            }`}>
                                            <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isDone ? 'bg-green-500/20' : isActive ? 'bg-indigo-600/20' : 'bg-gray-800'
                                                }`}>
                                                {isDone ? <CheckCircle2 size={14} className="text-green-400" /> :
                                                    isActive ? <Loader2 size={14} className="text-indigo-400 animate-spin" /> :
                                                        <span className="text-gray-600 text-[0.6rem] font-bold">{step.id}</span>}
                                            </div>
                                            <span className={`text-xs sm:text-sm font-bold ${isDone ? 'text-green-400' : isActive ? 'text-white' : 'text-gray-600'}`}>
                                                {step.label}
                                            </span>
                                            {isActive && <div className="ml-auto w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ═══ RESULT ═══ */}
                    {phase === 'result' && result && (
                        <div className="py-3 sm:py-4">
                            {/* Status */}
                            <div className={`rounded-2xl p-5 sm:p-6 mb-5 text-center ${result.status === 'VERIFIED' ? 'bg-green-500/10 border border-green-500/20' :
                                result.status === 'PENDING' ? 'bg-amber-500/10 border border-amber-500/20' :
                                    'bg-red-500/10 border border-red-500/20'
                                }`}>
                                <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 ${result.status === 'VERIFIED' ? 'bg-green-500/20' : result.status === 'PENDING' ? 'bg-amber-500/20' : 'bg-red-500/20'
                                    }`}>
                                    {result.status === 'VERIFIED' ? <CheckCircle2 size={28} className="text-green-400" /> :
                                        result.status === 'PENDING' ? <AlertTriangle size={28} className="text-amber-400" /> :
                                            <XCircle size={28} className="text-red-400" />}
                                </div>
                                <h3 className={`font-black text-lg sm:text-xl mb-1 ${result.status === 'VERIFIED' ? 'text-green-400' : result.status === 'PENDING' ? 'text-amber-400' : 'text-red-400'
                                    }`}>
                                    {result.status === 'VERIFIED' ? 'VÉRIFIÉ ✅' : result.status === 'PENDING' ? 'EN ATTENTE ⏳' : 'REJETÉ ❌'}
                                </h3>
                                <p className="text-gray-400 text-xs sm:text-sm">{result.message}</p>
                            </div>

                            {/* Score Cards */}
                            {result.trust_score !== undefined && (
                                <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
                                    <div className="bg-gray-900/50 rounded-xl p-3 text-center">
                                        <p className="text-gray-500 text-[0.5rem] sm:text-[0.6rem] font-bold uppercase tracking-wider mb-1">Confiance</p>
                                        <p className={`text-xl sm:text-2xl font-black ${result.trust_score >= 85 ? 'text-green-400' : result.trust_score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                                            {result.trust_score}%
                                        </p>
                                    </div>
                                    <div className="bg-gray-900/50 rounded-xl p-3 text-center">
                                        <p className="text-gray-500 text-[0.5rem] sm:text-[0.6rem] font-bold uppercase tracking-wider mb-1">Falsification</p>
                                        <p className={`text-xl sm:text-2xl font-black ${(result.tampering_probability || 0) < 20 ? 'text-green-400' : (result.tampering_probability || 0) < 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                            {result.tampering_probability || 0}%
                                        </p>
                                    </div>
                                    <div className="bg-gray-900/50 rounded-xl p-3 text-center">
                                        <p className="text-gray-500 text-[0.5rem] sm:text-[0.6rem] font-bold uppercase tracking-wider mb-1">Moyenne</p>
                                        <p className="text-xl sm:text-2xl font-black text-indigo-400">
                                            {result.semester_average != null ? result.semester_average.toFixed(2) : '--'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Grades Table */}
                            {result.extracted_grades && Object.keys(result.extracted_grades).length > 0 && (
                                <div className="bg-gray-900/50 rounded-xl p-3 sm:p-4 mb-5 overflow-x-auto">
                                    <h4 className="text-white font-black text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <Shield size={14} className="text-indigo-400" /> Notes extraites
                                    </h4>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-gray-500 font-bold uppercase tracking-wider text-[0.5rem] sm:text-[0.6rem]">
                                                <th className="text-left py-1.5 pr-2">Module</th>
                                                <th className="text-center px-1">TD</th>
                                                <th className="text-center px-1">Exam</th>
                                                <th className="text-center px-1">Moy</th>
                                                <th className="text-center pl-1">Coef</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(result.extracted_grades).map(([mod, g]) => (
                                                <tr key={mod} className="border-t border-gray-800/50">
                                                    <td className="py-2 pr-2 text-gray-300 font-bold text-[0.65rem] sm:text-xs max-w-[7rem] sm:max-w-none truncate">{mod}</td>
                                                    <td className="py-2 px-1 text-center font-mono font-bold text-gray-400">{g.td != null ? g.td : '--'}</td>
                                                    <td className="py-2 px-1 text-center font-mono font-bold text-white">{g.exam != null ? g.exam : '--'}</td>
                                                    <td className={`py-2 px-1 text-center font-mono font-black ${g.average != null ? (g.average >= 10 ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                                                        {g.average != null ? g.average.toFixed(2) : '--'}
                                                    </td>
                                                    <td className="py-2 pl-1 text-center font-mono text-gray-500">{g.coefficient || '--'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {result.semester_average != null && (
                                        <div className="mt-3 pt-3 border-t border-gray-700 flex items-center justify-between">
                                            <span className="text-white font-black text-xs uppercase tracking-wider">Moyenne Semestre</span>
                                            <span className={`text-lg font-black font-mono ${result.semester_average >= 10 ? 'text-green-400' : 'text-red-400'}`}>
                                                {result.semester_average.toFixed(2)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Score Breakdown */}
                            {result.breakdown && (
                                <div className="bg-gray-900/50 rounded-xl p-3 sm:p-4 mb-5">
                                    <h4 className="text-white font-black text-xs uppercase tracking-wider mb-2">Détail du score</h4>
                                    <div className="space-y-1.5">
                                        {Object.entries(result.breakdown).map(([key, val]) => (
                                            <div key={key} className="flex items-center justify-between">
                                                <span className="text-gray-400 text-[0.65rem] sm:text-xs font-bold">
                                                    {key === 'verificationCode' ? '🔑 Code' :
                                                        key === 'ocrStructure' ? '📋 OCR' :
                                                            key === 'moduleMatching' ? '📚 Modules' :
                                                                key === 'tampering' ? '🛡 Anti-falsification' : key}
                                                </span>
                                                <span className={`text-xs sm:text-sm font-black ${val.score >= val.max * 0.7 ? 'text-green-400' : val.score >= val.max * 0.4 ? 'text-amber-400' : 'text-red-400'}`}>
                                                    {val.score}/{val.max}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Issues */}
                            {result.issues_detected && result.issues_detected.length > 0 && (
                                <div className="bg-red-500/5 rounded-xl p-3 sm:p-4 mb-5 border border-red-500/10">
                                    <h4 className="text-red-400 font-black text-xs uppercase tracking-wider mb-2">Problèmes</h4>
                                    <div className="space-y-1">
                                        {result.issues_detected.map((issue, i) => (
                                            <p key={i} className="text-red-300/70 text-[0.65rem] sm:text-xs flex items-start gap-1.5">
                                                <span className="text-red-400 shrink-0">•</span>
                                                {typeof issue === 'string' ? issue : issue.message || JSON.stringify(issue)}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button onClick={reset}
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2">
                                    <RefreshCcw size={14} /> Réessayer
                                </button>
                                <button onClick={onClose}
                                    className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs uppercase tracking-widest rounded-xl transition-colors">
                                    Fermer
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GradeVerification;
