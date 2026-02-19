import { useState, useEffect, useRef } from 'react';
import { Shield, Clock, Upload, CheckCircle2, XCircle, AlertTriangle, RefreshCcw, X, Loader2, Video, FileImage } from 'lucide-react';
import api from '../api';

const VIDEO_STEPS = [
    { id: 'UPLOADED', label: 'Vidéo reçue' },
    { id: 'EXTRACTING_FRAMES', label: 'Extraction des images' },
    { id: 'OCR_ANALYSIS', label: 'Analyse Multi-OCR' },
    { id: 'AGGREGATING_RESULTS', label: 'Agrégation des données' },
    { id: 'PORTAL_CROSS_CHECK', label: 'Vérification portail' },
    { id: 'TAMPERING_DETECTION', label: 'Détection falsification' },
    { id: 'CALCULATING_SCORE', label: 'Calcul du score' },
    { id: 'COMPLETED', label: 'Terminé' },
];

const SCREENSHOT_STEPS = [
    { id: 'UPLOADED', label: 'Images reçues' },
    { id: 'PROCESSING_TD', label: 'Analyse Screenshot TD' },
    { id: 'PROCESSING_EXAM', label: 'Analyse Screenshot Exam' },
    { id: 'CALCULATING_RESULTS', label: 'Calcul des résultats' },
    { id: 'COMPLETED', label: 'Terminé' },
];

const GradeVerification = ({ isOpen, onClose, onCodeGenerated }) => {
    const [mode, setMode] = useState('video'); // 'video' or 'screenshot'
    const [phase, setPhase] = useState('idle');
    const [code, setCode] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [currentStep, setCurrentStep] = useState('IDLE');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [jobId, setJobId] = useState(null);

    // Video state
    const [videoFile, setVideoFile] = useState(null);
    const [videoPreview, setVideoPreview] = useState(null);

    // Screenshot state
    const [tdScreenshot, setTdScreenshot] = useState(null);
    const [examScreenshot, setExamScreenshot] = useState(null);

    const videoInputRef = useRef(null);
    const tdInputRef = useRef(null);
    const examInputRef = useRef(null);
    const timerRef = useRef(null);
    const pollingRef = useRef(null);

    // Countdown Timer for Verification Code
    useEffect(() => {
        if (phase === 'code' && timeLeft > 0) {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        setError('Code expiré ! Générez un nouveau code.');
                        setPhase('idle');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timerRef.current);
        }
    }, [phase, timeLeft]);

    // Polling for job status
    useEffect(() => {
        if (phase === 'processing' && jobId) {
            pollingRef.current = setInterval(async () => {
                try {
                    const endpoint = mode === 'video'
                        ? `/api/grades/verify/video/status/${jobId}`
                        : `/api/grades/verify/status`; // Screenshots poll latest global status

                    const { data } = await api.get(endpoint);

                    setCurrentStep(data.current_step);

                    if (data.status !== 'PROCESSING') {
                        clearInterval(pollingRef.current);
                        setResult(data);
                        setPhase('result');
                        if (onCodeGenerated) onCodeGenerated(null, 0);
                    }
                } catch (err) {
                    console.error("Polling error:", err);
                    // Don't stop on single error, wait for next cycle
                }
            }, 3000);
            return () => clearInterval(pollingRef.current);
        }
    }, [phase, jobId, mode]);

    useEffect(() => {
        if (!isOpen) {
            clearInterval(timerRef.current);
            clearInterval(pollingRef.current);
        }
    }, [isOpen]);

    const generateCode = async (selectedMode) => {
        setMode(selectedMode);
        setError(null);
        setResult(null);
        setVideoFile(null);
        setVideoPreview(null);
        setTdScreenshot(null);
        setExamScreenshot(null);

        try {
            const { data } = await api.get('/api/grades/verify/code');
            setCode(data.code);
            setTimeLeft(120); // Backend TTL is 120s
            setPhase('code');
            if (onCodeGenerated) onCodeGenerated(data.code, 120);
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de la génération du code');
        }
    };

    const handleVideoSelect = (file) => {
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
            setError('Vidéo trop volumineuse (max 50 Mo).');
            return;
        }
        setError(null);
        setVideoFile(file);
        setVideoPreview(URL.createObjectURL(file));
    };

    const submitVideo = async () => {
        if (!code || !videoFile) return;
        setPhase('processing');
        setError(null);
        setCurrentStep('UPLOADED');

        try {
            const formData = new FormData();
            formData.append('code', code);
            formData.append('video', videoFile);

            const { data } = await api.post('/api/grades/verify/video', formData);
            setJobId(data.jobId);
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de l\'envoi de la vidéo');
            setPhase('code');
        }
    };

    const submitScreenshots = async () => {
        if (!code || !tdScreenshot || !examScreenshot) return;
        setPhase('processing');
        setError(null);
        setCurrentStep('UPLOADED');

        try {
            const formData = new FormData();
            formData.append('code', code);
            formData.append('tdScreenshot', tdScreenshot);
            formData.append('examScreenshot', examScreenshot);

            const { data } = await api.post('/api/grades/verify/submit', formData);
            setJobId(data.jobId);
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de l\'envoi des captures');
            setPhase('code');
        }
    };

    const reset = () => {
        setPhase('idle');
        setCode(null);
        setTimeLeft(0);
        setCurrentStep('IDLE');
        setResult(null);
        setError(null);
        setVideoFile(null);
        setVideoPreview(null);
        setTdScreenshot(null);
        setExamScreenshot(null);
        setJobId(null);
        clearInterval(timerRef.current);
        clearInterval(pollingRef.current);
        if (onCodeGenerated) onCodeGenerated(null, 0);
    };

    if (!isOpen) return null;

    const steps = mode === 'video' ? VIDEO_STEPS : SCREENSHOT_STEPS;
    const currentStepIndex = steps.findIndex(s => s.id === currentStep || currentStep.startsWith(s.id));

    return (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            <div className="relative w-full sm:max-w-xl max-h-[90vh] overflow-y-auto bg-gray-950 rounded-t-3xl sm:rounded-3xl border border-gray-800 shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-md border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
                            <Shield className="text-white" size={20} />
                        </div>
                        <div>
                            <h2 className="text-white font-black text-lg">Vérification des Notes</h2>
                            <p className="text-gray-500 text-[0.6rem] font-bold uppercase tracking-widest">Système Anti-Triche</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
                        <X className="text-gray-500" size={20} />
                    </button>
                </div>

                <div className="p-6">
                    {error && (
                        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm font-bold">
                            <AlertTriangle size={18} /> {error}
                        </div>
                    )}

                    {/* IDLE: Select Mode */}
                    {phase === 'idle' && (
                        <div className="space-y-4">
                            <div className="text-center mb-6">
                                <h3 className="text-white text-xl font-black mb-2">Choisissez votre méthode</h3>
                                <p className="text-gray-400 text-sm">La vidéo est la méthode la plus rapide et fiable.</p>
                            </div>

                            <button onClick={() => generateCode('video')} className="w-full p-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-2xl flex items-center gap-4 transition-all group">
                                <div className="w-12 h-12 bg-indigo-600/20 rounded-xl flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                                    <Video size={24} />
                                </div>
                                <div className="text-left">
                                    <p className="text-white font-bold">Vidéo (Recommandé)</p>
                                    <p className="text-gray-500 text-xs">Filmez votre écran Progrès pendant 10s</p>
                                </div>
                                <div className="ml-auto text-indigo-400 font-black text-[0.6rem] bg-indigo-400/10 px-2 py-1 rounded">RAPIDE</div>
                            </button>

                            <button onClick={() => generateCode('screenshot')} className="w-full p-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-2xl flex items-center gap-4 transition-all group">
                                <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                                    <FileImage size={24} />
                                </div>
                                <div className="text-left">
                                    <p className="text-white font-bold">Captures d'écran</p>
                                    <p className="text-gray-500 text-xs">Deux images (Notes TD + Examens)</p>
                                </div>
                            </button>
                        </div>
                    )}

                    {/* CODE PHASE */}
                    {phase === 'code' && (
                        <div className="space-y-6">
                            <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-6 text-center">
                                <p className="text-indigo-400 text-xs font-black uppercase tracking-widest mb-2">Code de Vérification</p>
                                <div className="text-4xl font-mono font-black text-white tracking-widest mb-4">{code}</div>
                                <div className="flex items-center justify-center gap-2 text-gray-400 text-sm font-bold">
                                    <Clock size={16} /> Expire dans {timeLeft}s
                                </div>
                                <div className="mt-4 w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${(timeLeft / 120) * 100}%` }} />
                                </div>
                            </div>

                            {mode === 'video' ? (
                                <div className="space-y-4">
                                    <div onClick={() => videoInputRef.current.click()} className="cursor-pointer border-2 border-dashed border-gray-800 hover:border-indigo-500 rounded-2xl p-8 text-center transition-colors">
                                        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e => handleVideoSelect(e.target.files[0])} />
                                        {videoFile ? (
                                            <div className="space-y-2">
                                                <Video className="mx-auto text-green-400" size={32} />
                                                <p className="text-white font-bold">{videoFile.name}</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <Video className="mx-auto text-gray-600" size={32} />
                                                <p className="text-gray-400 font-bold">Cliquez pour choisir la vidéo</p>
                                                <p className="text-gray-600 text-xs">Durée recommandée : 10 sec</p>
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={submitVideo} disabled={!videoFile} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-indigo-600/20">
                                        LANCER L'ANALYSE VIDÉO
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div onClick={() => tdInputRef.current.click()} className={`cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-all ${tdScreenshot ? 'border-green-500 bg-green-500/5' : 'border-gray-800 hover:border-purple-500'}`}>
                                            <input ref={tdInputRef} type="file" accept="image/*" className="hidden" onChange={e => setTdScreenshot(e.target.files[0])} />
                                            <FileImage className={`mx-auto mb-2 ${tdScreenshot ? 'text-green-400' : 'text-gray-600'}`} size={24} />
                                            <p className="text-xs font-bold text-gray-400">{tdScreenshot ? 'TD Reçu' : 'Screenshot TD'}</p>
                                        </div>
                                        <div onClick={() => examInputRef.current.click()} className={`cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-all ${examScreenshot ? 'border-green-500 bg-green-500/5' : 'border-gray-800 hover:border-purple-500'}`}>
                                            <input ref={examInputRef} type="file" accept="image/*" className="hidden" onChange={e => setExamScreenshot(e.target.files[0])} />
                                            <FileImage className={`mx-auto mb-2 ${examScreenshot ? 'text-green-400' : 'text-gray-600'}`} size={24} />
                                            <p className="text-xs font-bold text-gray-400">{examScreenshot ? 'Exam Reçu' : 'Screenshot Exam'}</p>
                                        </div>
                                    </div>
                                    <button onClick={submitScreenshots} disabled={!tdScreenshot || !examScreenshot} className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-purple-600/20">
                                        VÉRIFIER LES CAPTURES
                                    </button>
                                </div>
                            )}
                            <button onClick={reset} className="w-full text-gray-500 text-xs font-bold py-2 hover:text-white transition-colors">Retour aux options</button>
                        </div>
                    )}

                    {/* PROCESSING PHASE */}
                    {phase === 'processing' && (
                        <div className="py-8 text-center space-y-8">
                            <div>
                                <Loader2 className="mx-auto text-indigo-400 animate-spin mb-4" size={48} />
                                <h3 className="text-white text-xl font-black">Traitement en cours...</h3>
                                <p className="text-gray-500 text-sm">Le serveur analyse vos données (ne fermez pas cette page)</p>
                            </div>

                            <div className="max-w-xs mx-auto space-y-3">
                                {steps.map((step, idx) => {
                                    const isCompleted = idx < currentStepIndex || currentStep === 'COMPLETED';
                                    const isCurrent = idx === currentStepIndex && currentStep !== 'COMPLETED';

                                    return (
                                        <div key={step.id} className="flex items-center gap-4 transition-all duration-500">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${isCompleted ? 'bg-green-500/20 border-green-500/40 text-green-400' :
                                                    isCurrent ? 'bg-indigo-600 border-indigo-500 text-white animate-pulse' :
                                                        'bg-gray-900 border-gray-800 text-gray-600'
                                                }`}>
                                                {isCompleted ? <CheckCircle2 size={16} /> : idx + 1}
                                            </div>
                                            <span className={`text-sm font-bold ${isCompleted ? 'text-green-400' : isCurrent ? 'text-white' : 'text-gray-600'}`}>
                                                {step.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {mode === 'video' && <p className="text-gray-600 text-[0.6rem] font-bold uppercase tracking-widest">Optimisé pour Render Free Tier 🚀</p>}
                        </div>
                    )}

                    {/* RESULT PHASE */}
                    {phase === 'result' && result && (
                        <div className="space-y-6">
                            <div className={`p-8 rounded-3xl text-center border-2 ${result.status === 'VERIFIED' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 ${result.status === 'VERIFIED' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {result.status === 'VERIFIED' ? <CheckCircle2 size={40} /> : <XCircle size={40} />}
                                </div>
                                <h3 className={`text-2xl font-black mb-2 ${result.status === 'VERIFIED' ? 'text-green-400' : 'text-red-400'}`}>
                                    {result.status === 'VERIFIED' ? 'CONFIRMÉ' : 'REJETÉ'}
                                </h3>
                                <p className="text-gray-300 font-medium">{result.status === 'VERIFIED' ? 'Vos notes ont été certifiées par notre IA.' : 'La vérification a échoué.'}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
                                    <p className="text-gray-500 text-[0.6rem] font-black uppercase tracking-widest mb-1">Score de Confiance</p>
                                    <p className={`text-3xl font-black ${result.trust_score >= 80 ? 'text-green-400' : 'text-amber-400'}`}>{result.trust_score}%</p>
                                </div>
                                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
                                    <p className="text-gray-500 text-[0.6rem] font-black uppercase tracking-widest mb-1">Temps de Traitement</p>
                                    <p className="text-3xl font-black text-indigo-400">{result.processing_time?.toFixed(1)}s</p>
                                </div>
                            </div>

                            <button onClick={reset} className="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white font-black rounded-xl border border-gray-800 flex items-center justify-center gap-2 transition-all">
                                <RefreshCcw size={18} /> Recommencer
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GradeVerification;
