import { useState, useEffect, useMemo, useRef } from 'react';
import { Calculator, Save, Star, CheckCircle2, RefreshCcw, FileDown, Target, Check } from 'lucide-react';
import { jsPDF } from 'jspdf';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from '../components/LoadingSpinner';

const SUBJECTS = [
    { name: 'Analyse 03', coefficient: 5 },
    { name: 'Algèbre 03', coefficient: 3 },
    { name: 'Économie d\'entreprise', coefficient: 2 },
    { name: 'Probabilité et Statistique 01', coefficient: 4 },
    { name: 'Anglais 02', coefficient: 2 },
    { name: 'SFSD', coefficient: 4 },
    { name: 'Architecture 02', coefficient: 4 },
    { name: 'Électronique Fondamentale 02', coefficient: 4 },
];

const TOTAL_COEF = 28;

const Dashboard = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [grades, setGrades] = useState(
        SUBJECTS.reduce((acc, s) => {
            acc[s.name] = { exam: '', td: '' };
            return acc;
        }, {})
    );

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [error, setError] = useState(null);

    const calculations = useMemo(() => {
        const subjectAverages = {};
        let totalWeightedSum = 0;
        let subjectsEntered = 0;

        SUBJECTS.forEach(s => {
            const exam = parseFloat(grades[s.name].exam);
            const td = parseFloat(grades[s.name].td);

            if (!isNaN(exam) || !isNaN(td)) {
                const eVal = isNaN(exam) ? 0 : exam;
                const tVal = isNaN(td) ? 0 : td;
                const avg = (eVal * 0.6) + (tVal * 0.4);
                subjectAverages[s.name] = avg;
                totalWeightedSum += avg * s.coefficient;
                subjectsEntered++;
            } else {
                subjectAverages[s.name] = null;
            }
        });

        const generalAverage = totalWeightedSum / TOTAL_COEF;
        return {
            subjects: subjectAverages,
            general: subjectsEntered > 0 ? generalAverage : null
        };
    }, [grades]);

    // Profile Completion Calculation
    const profileCompletion = useMemo(() => {
        let filledSubjects = 0;
        SUBJECTS.forEach(s => {
            const exam = grades[s.name].exam;
            const td = grades[s.name].td;
            if ((exam !== '' && exam !== null) || (td !== '' && td !== null)) {
                filledSubjects++;
            }
        });
        const percentage = Math.round((filledSubjects / SUBJECTS.length) * 100);
        return {
            filled: filledSubjects,
            total: SUBJECTS.length,
            percentage
        };
    }, [grades]);

    // PDF Export Function
    const exportToPDF = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const now = new Date().toLocaleDateString();

        // Title
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text(t('academicReport'), pageWidth / 2, 25, { align: 'center' });

        // Subtitle
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(`${t('generatedOn')}: ${now}`, pageWidth / 2, 33, { align: 'center' });
        if (user?.alias) {
            doc.text(`${t('studentAlias')}: @${user.alias}`, pageWidth / 2, 40, { align: 'center' });
        }

        // Separator line
        doc.setDrawColor(200);
        doc.line(20, 47, pageWidth - 20, 47);

        // Subject Breakdown Title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text(t('subjectBreakdown'), 20, 58);

        // Table Headers
        let yPos = 68;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(245, 245, 245);
        doc.rect(20, yPos - 5, pageWidth - 40, 10, 'F');
        doc.text(t('subject'), 25, yPos);
        doc.text(t('coefficient'), 90, yPos);
        doc.text(t('examFull').replace(' (60%)', ''), 115, yPos);
        doc.text(t('tdFull').replace(' (40%)', ''), 140, yPos);
        doc.text(t('average'), 165, yPos);

        // Table Rows
        doc.setFont('helvetica', 'normal');
        yPos += 12;
        SUBJECTS.forEach(s => {
            const avg = calculations.subjects[s.name];
            const examVal = grades[s.name].exam || '--';
            const tdVal = grades[s.name].td || '--';
            const avgVal = avg !== null ? avg.toFixed(2) : '--';

            doc.text(t(s.name).substring(0, 25), 25, yPos);
            doc.text(`x${s.coefficient}`, 95, yPos);
            doc.text(examVal.toString(), 125, yPos);
            doc.text(tdVal.toString(), 150, yPos);

            // Color the average
            if (avg !== null) {
                if (avg >= 10) {
                    doc.setTextColor(34, 197, 94); // green
                } else {
                    doc.setTextColor(239, 68, 68); // red
                }
            }
            doc.text(avgVal, 170, yPos);
            doc.setTextColor(0);

            yPos += 9;
        });

        // General Average
        yPos += 10;
        doc.setDrawColor(200);
        doc.line(20, yPos - 5, pageWidth - 20, yPos - 5);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(t('generalAverageShort'), 25, yPos + 5);
        if (calculations.general !== null) {
            if (calculations.general >= 10) {
                doc.setTextColor(34, 197, 94);
            } else {
                doc.setTextColor(239, 68, 68);
            }
            doc.text(calculations.general.toFixed(2), 165, yPos + 5);
        } else {
            doc.text('--', 165, yPos + 5);
        }

        // Save
        doc.save(`academic_report_${now.replace(/\//g, '-')}.pdf`);
    };

    const fetchGrades = async () => {
        if (!user) {
            // Guest Mode: load from local storage
            const localData = localStorage.getItem('guest_grades');
            if (localData) {
                try {
                    setGrades(JSON.parse(localData));
                } catch (e) { console.error("Guest parse error", e); }
            }
            setLoading(false);
            return;
        }

        try {
            const { data } = await axios.get('/api/grades');
            // Merge with existing structure to preserve keys
            setGrades(prev => {
                const next = { ...prev };
                data.forEach(g => {
                    if (next[g.subject]) {
                        next[g.subject] = {
                            exam: g.exam_score.toString(),
                            td: g.td_score.toString()
                        };
                    }
                });
                return next;
            });
        } catch (err) {
            console.error("Error fetching grades:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGrades();
    }, [user]);

    const isMounted = useRef(true);
    const gradesRef = useRef(grades);
    const dirtyRef = useRef(false);

    // Keep refs items updated
    useEffect(() => {
        gradesRef.current = grades;
    }, [grades]);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            // Force save on unmount if dirty
            if (dirtyRef.current) {
                performSave(gradesRef.current, true); // true = silent/unmount mode
            }
        };
    }, []);

    const isInitialMount = useRef(true);
    const autoSaveTimer = useRef(null);

    // Auto-save logic
    useEffect(() => {
        if (loading || isInitialMount.current) {
            if (!loading) isInitialMount.current = false;
            return;
        }

        if (dirtyRef.current) {
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = setTimeout(() => {
                saveAllGrades();
            }, 800); // Reduced to 800ms for snappier feel
        }

        return () => {
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        };
    }, [grades]);

    const handleGradeChange = (subject, type, value) => {
        if (value !== '') {
            const num = parseFloat(value);
            if (isNaN(num) || num < 0 || num > 20) return;
            if (value.includes('.') && value.split('.')[1].length > 2) return;
        }

        dirtyRef.current = true;
        setGrades(prev => ({
            ...prev,
            [subject]: { ...prev[subject], [type]: value }
        }));
        setError(null);
    };

    const performSave = async (gradesData, isUnmount = false) => {
        if (!user) {
            // Guest Mode: save only to local storage
            localStorage.setItem('guest_grades', JSON.stringify(gradesData));
            if (!isUnmount && isMounted.current) setLastSaved(new Date());
            dirtyRef.current = false;
            return;
        }

        if (!isUnmount && isMounted.current) setSaving(true);
        if (!isUnmount && isMounted.current) setError(null);

        try {
            // Prepare batch payload
            const batchPayload = SUBJECTS.map(s => {
                const gradeData = gradesData[s.name];
                if (gradeData.exam !== '' || gradeData.td !== '') {
                    return {
                        subject: s.name,
                        examScore: gradeData.exam === '' ? 0 : parseFloat(gradeData.exam),
                        tdScore: gradeData.td === '' ? 0 : parseFloat(gradeData.td)
                    };
                }
                return null;
            }).filter(item => item !== null);

            if (batchPayload.length > 0) {
                // Send single atomic request
                await axios.post('/api/grades/batch', { grades: batchPayload });

                // No need to call refresh here, backend does it, and Ranking page forces recalc

                dirtyRef.current = false;
                if (!isUnmount && isMounted.current) setLastSaved(new Date());
            }
        } catch (err) {
            console.error("Error saving all grades:", err);
            if (!isUnmount && isMounted.current) setError(t('error'));
        } finally {
            if (!isUnmount && isMounted.current) setSaving(false);
        }
    };

    const saveAllGrades = () => {
        performSave(grades);
    };

    if (loading) return <LoadingSpinner />;

    const handleKeyDown = (e, index, type, viewMode) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            let nextId = '';

            if (type === 'exam') {
                // Exam -> TD
                nextId = `${viewMode}-input-${index}-td`;
            } else {
                // TD -> Next Exam
                if (index < SUBJECTS.length - 1) {
                    nextId = `${viewMode}-input-${index + 1}-exam`;
                } else {
                    // Last field -> Blur (or focus save button)
                    e.target.blur();
                    return;
                }
            }

            const nextElement = document.getElementById(nextId);
            if (nextElement) {
                nextElement.focus();
                // Optional: Select all text on focus for easier overwriting
                nextElement.select();
            }
        }
    };

    return (
        <div className="w-full responsive-container py-[1.5rem] sm:py-[3rem]">

            {/* Header Area */}
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 dark:from-gray-900 dark:to-gray-950 rounded-[2rem] sm:rounded-[3rem] p-[1.5rem] sm:p-[4rem] mb-[4rem] sm:mb-[6rem] text-white shadow-[0_30px_60px_-15px_rgba(79,70,229,0.3)] dark:shadow-none relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[20rem] h-[20rem] bg-indigo-400/20 rounded-full -mr-[10rem] -mt-[10rem] blur-[5rem]"></div>

                <div className="flex flex-col lg:flex-row items-center lg:items-start justify-between gap-[2rem] relative z-10">
                    {/* Left: Title */}
                    <div className="text-center lg:text-left w-full lg:w-auto">
                        <div className="inline-flex items-center gap-[0.5rem] px-[1rem] py-[0.5rem] bg-white/5 rounded-full border border-white/10 mb-[1.5rem]">
                            <Star className="text-yellow-400 fill-yellow-400" size={14} />
                            <span className="text-[0.625rem] sm:text-[0.75rem] font-black uppercase tracking-[0.2em]">{t('promotionActive')}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-[2.25rem] sm:text-[4rem] font-black text-white tracking-tighter leading-none mb-1">
                                {t('evaluations')}<span className="text-indigo-500">.</span>
                            </h1>
                            <p className="text-gray-500 text-[0.7rem] sm:text-[1rem] font-bold uppercase tracking-[0.2em]">
                                <span className="text-white">COEF: {TOTAL_COEF}</span>
                            </p>
                        </div>
                    </div>

                    {/* Guest Mode Banner */}
                    {!user && (
                        <div className="w-full lg:w-auto mt-[2rem] lg:mt-0 bg-amber-500/10 border border-amber-500/20 rounded-[2.5rem] p-[1.5rem] sm:p-[2rem] text-center lg:text-left flex flex-col sm:flex-row items-center gap-[1.5rem] animate-in fade-in duration-700">
                            <div className="w-[3.5rem] h-[3.5rem] bg-amber-500 text-white rounded-[1.25rem] flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
                                <Calculator size={24} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-amber-500 font-black text-[1rem] sm:text-[1.25rem] mb-[0.25rem] leading-none uppercase tracking-tight">{t('guestMode')}</h3>
                                <p className="text-amber-200/60 text-[0.75rem] font-bold">{t('guestNotice')}</p>
                            </div>
                            <a
                                href="/register"
                                className="w-full sm:w-auto px-[1.5rem] py-[1rem] bg-amber-500 text-white font-black text-[0.75rem] uppercase tracking-widest rounded-full hover:bg-amber-600 transition-all touch-feedback shadow-lg shadow-amber-500/20"
                            >
                                {t('createAccount')}
                            </a>
                        </div>
                    )}

                    {/* Right: General Average Box */}
                    <div className="w-full lg:w-[22rem] shrink-0 bg-white/10 backdrop-blur-3xl rounded-[2.5rem] p-[2.5rem] border border-white/20 text-center shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-50"></div>
                        <p className="relative z-10 text-indigo-100 text-[0.6rem] sm:text-[0.75rem] font-black uppercase tracking-[0.4em] mb-[1rem] opacity-80">{t('generalAverageShort')}</p>
                        <p className="relative z-10 text-[4rem] sm:text-[6rem] font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-indigo-100 transition-transform group-hover:scale-105 duration-700 leading-none">
                            {calculations.general !== null ? calculations.general.toFixed(2) : '--'}
                        </p>
                        <div className="mt-[1.5rem]">
                            {saving ? (
                                <div className="text-indigo-400 font-black text-[0.625rem] uppercase tracking-widest bg-white/5 px-[1rem] py-[0.4rem] rounded-full inline-flex items-center gap-[0.5rem]">
                                    <RefreshCcw size={12} className="animate-spin" /> {t('syncing')}
                                </div>
                            ) : lastSaved ? (
                                <div className="text-green-400 font-black text-[0.625rem] uppercase tracking-widest bg-green-500/10 px-[1rem] py-[0.4rem] rounded-full inline-flex items-center gap-[0.5rem]">
                                    <CheckCircle2 size={12} /> {t('syncOk')}
                                </div>
                            ) : (
                                <div className="text-gray-400 font-black text-[0.625rem] uppercase tracking-widest opacity-60">{t('liveEstimation')}</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Management Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-[1.5rem] mb-[2.5rem] bg-white p-[1.25rem] sm:p-[2rem] rounded-[2.25rem] shadow-xl border border-gray-100 sticky top-[5.5rem] z-40 backdrop-blur-xl bg-white/95">
                    <div className="flex items-center gap-[1rem] w-full sm:w-auto">
                        <div className="w-[3rem] h-[3rem] bg-gray-950 text-white rounded-[1rem] flex items-center justify-center flex-shrink-0">
                            <Calculator size={22} />
                        </div>
                        <div>
                            <h2 className="text-[1.125rem] font-black text-gray-950 tracking-tight leading-none mb-[0.25rem]">{t('gradeManagement')}</h2>
                            <p className="text-gray-400 font-bold text-[0.625rem] uppercase tracking-[0.2em]">{t('formatS3')}</p>
                        </div>
                    </div>

                    <div className="flex gap-[0.75rem]">
                        <button
                            onClick={exportToPDF}
                            className="w-full sm:w-auto px-[1.5rem] py-[1.125rem] rounded-[1.25rem] font-black text-[0.75rem] uppercase tracking-widest flex items-center justify-center gap-[0.75rem] transition-all touch-feedback shadow-lg bg-gray-950 text-white hover:bg-black"
                        >
                            <FileDown size={18} />
                            {t('exportPDF')}
                        </button>
                        <button
                            onClick={saveAllGrades}
                            disabled={saving}
                            className={`w-full sm:w-auto px-[2rem] py-[1.125rem] rounded-[1.25rem] font-black text-[0.75rem] uppercase tracking-widest flex items-center justify-center gap-[0.75rem] transition-all touch-feedback shadow-lg ${saving ? 'bg-gray-100 text-gray-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                }`}
                        >
                            {saving ? <RefreshCcw size={18} className="animate-spin" /> : <Save size={18} />}
                            {saving ? t('syncingLong') : t('saveAll')}
                        </button>
                    </div>
                </div>

                {/* Profile Completion Indicator */}
                <div className="mb-[2rem] bg-white p-[1.25rem] sm:p-[1.5rem] rounded-[1.5rem] shadow-lg border border-gray-100">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[1rem]">
                        <div className="flex items-center gap-[1rem]">
                            <div className={`w-[3rem] h-[3rem] rounded-[1rem] flex items-center justify-center flex-shrink-0 ${profileCompletion.percentage === 100 ? 'bg-green-500 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
                                {profileCompletion.percentage === 100 ? <Check size={22} /> : <Target size={22} />}
                            </div>
                            <div>
                                <h3 className="text-[1rem] font-black text-gray-950 tracking-tight">{t('profileCompletion')}</h3>
                                <p className="text-gray-400 font-bold text-[0.625rem] uppercase tracking-[0.15em]">
                                    {profileCompletion.filled}/{profileCompletion.total} {t('gradesEntered')}
                                </p>
                            </div>
                        </div>
                        <div className="w-full sm:w-[12rem]">
                            <div className="flex items-center justify-between mb-[0.5rem]">
                                <span className={`text-[0.625rem] font-black uppercase tracking-wider ${profileCompletion.percentage === 100 ? 'text-green-600' : 'text-indigo-600'}`}>
                                    {profileCompletion.percentage === 100 ? t('profileComplete') : `${profileCompletion.percentage}%`}
                                </span>
                            </div>
                            <div className="h-[0.5rem] bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${profileCompletion.percentage === 100 ? 'bg-green-500' : 'bg-indigo-600'}`}
                                    style={{ width: `${profileCompletion.percentage}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Desktop Table View (lg+) */}
                <div className="hidden lg:block bg-white shadow-2xl rounded-[2.5rem] overflow-hidden border border-gray-100">
                    <table className="w-full text-left">
                        <thead className="bg-gray-950 text-white">
                            <tr>
                                <th className="px-[2.5rem] py-[1.75rem] text-[0.625rem] font-black uppercase tracking-[0.3em]">{t('subjectModule')}</th>
                                <th className="px-[1rem] py-[1.75rem] text-center text-[0.625rem] font-black uppercase tracking-[0.3em]">{t('coefficient')}.</th>
                                <th className="px-[1rem] py-[1.75rem] text-center text-[0.625rem] font-black uppercase tracking-[0.3em]">{t('examFull')}</th>
                                <th className="px-[1rem] py-[1.75rem] text-center text-[0.625rem] font-black uppercase tracking-[0.3em]">{t('tdFull')}</th>
                                <th className="px-[1rem] py-[1.75rem] text-center text-[0.625rem] font-black uppercase tracking-[0.3em] bg-gray-900/50">{t('average')}</th>
                                <th className="px-[1rem] py-[1.75rem] text-center text-[0.625rem] font-black uppercase tracking-[0.3em]">{t('status')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-center">
                            {SUBJECTS.map((s, index) => {
                                const avg = calculations.subjects[s.name];
                                return (
                                    <tr key={s.name} className="hover:bg-indigo-50/20 transition-colors">
                                        <td className="px-[2.5rem] py-[2rem] text-left">
                                            <p className="text-[1.125rem] font-black text-gray-950 tracking-tight">{t(s.name)}</p>
                                            <p className="text-[0.55rem] font-bold text-gray-300 uppercase tracking-widest mt-[0.25rem]">{t('semester')}</p>
                                        </td>
                                        <td className="px-[1rem] py-[2rem]">
                                            <span className="font-black text-gray-400 px-3 py-1 bg-gray-50 rounded-lg">×{s.coefficient}</span>
                                        </td>
                                        <td className="px-[1rem] py-[2rem]">
                                            <input
                                                id={`desktop-input-${index}-exam`}
                                                type="number"
                                                className="w-[6.5rem] mx-auto text-center bg-gray-50 border-2 border-transparent rounded-[1rem] py-[1rem] text-[1.125rem] font-black text-gray-950 focus:bg-white focus:border-indigo-600 outline-none transition-all shadow-inner"
                                                value={grades[s.name].exam}
                                                onChange={(e) => handleGradeChange(s.name, 'exam', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, index, 'exam', 'desktop')}
                                                placeholder="00.0"
                                            />
                                        </td>
                                        <td className="px-[1rem] py-[2rem]">
                                            <input
                                                id={`desktop-input-${index}-td`}
                                                type="number"
                                                className="w-[6.5rem] mx-auto text-center bg-gray-50 border-2 border-transparent rounded-[1rem] py-[1rem] text-[1.125rem] font-black text-gray-950 focus:bg-white focus:border-indigo-600 outline-none transition-all shadow-inner"
                                                value={grades[s.name].td}
                                                onChange={(e) => handleGradeChange(s.name, 'td', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, index, 'td', 'desktop')}
                                                placeholder="00.0"
                                            />
                                        </td>
                                        <td className="px-[2.5rem] py-[2rem]">
                                            <div className="flex flex-col items-center gap-[0.35rem]">
                                                <span className="text-[0.55rem] font-black text-gray-300 uppercase tracking-widest">{t('averageShort')}</span>
                                                <div className={`inline-flex items-center justify-center min-w-[5.5rem] px-[0.75rem] py-[0.8rem] rounded-[1.25rem] text-[1.125rem] font-black border-2 transition-all shadow-lg ${avg !== null
                                                    ? (avg >= 10
                                                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-400 shadow-emerald-500/20'
                                                        : 'bg-gradient-to-br from-rose-500 to-red-600 text-white border-rose-400 shadow-rose-500/20')
                                                    : 'bg-gray-100 text-gray-400 border-gray-200'
                                                    }`}>
                                                    {avg !== null ? avg.toFixed(2) : '--'}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-[1rem] py-[2rem]">
                                            {avg !== null ? (
                                                <span className={`px-[1rem] py-[0.5rem] rounded-xl text-[0.625rem] font-black uppercase tracking-widest shadow-sm ${avg >= 10
                                                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                    : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>
                                                    {avg >= 10 ? t('pass') : t('fail')}
                                                </span>
                                            ) : (
                                                <span className="px-[1rem] py-[0.5rem] rounded-xl text-[0.625rem] font-black uppercase tracking-widest bg-gray-100 text-gray-400 border border-gray-200">
                                                    --
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}

                            {/* Summary Row */}
                            <tr className="bg-gradient-to-r from-indigo-600 to-violet-700 dark:from-gray-900 dark:to-gray-950 text-white">
                                <td className="px-[2.5rem] py-[2rem] text-left rounded-bl-[2rem]">
                                    <p className="text-[1.125rem] font-black tracking-tight">{t('generalAverageFull')}</p>
                                    <p className="text-[0.55rem] font-bold text-indigo-200 uppercase tracking-widest mt-[0.25rem]">{t('academicYear')}</p>
                                </td>
                                <td className="px-[1rem] py-[2rem]">
                                    <span className="font-black text-indigo-200 opacity-60">×{TOTAL_COEF}</span>
                                </td>
                                <td colSpan={2} className="px-[1rem] py-[2rem] text-right pr-[2.5rem]">
                                    <span className={`px-[1.5rem] py-[0.75rem] rounded-2xl text-[0.85rem] font-black uppercase tracking-[0.2em] border-2 shadow-2xl animate-pulse ${calculations.general >= 10
                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-emerald-400 shadow-emerald-500/40'
                                        : 'bg-gradient-to-r from-rose-500 to-red-600 text-white border-rose-400 shadow-rose-500/40'}`}>
                                        {calculations.general !== null ? (calculations.general >= 10 ? t('pass') : t('fail')) : '--'}
                                    </span>
                                </td>
                                <td className="px-[2.5rem] py-[2rem]">
                                    <div className={`inline-flex items-center justify-center min-w-[8rem] px-[1.25rem] py-[1rem] rounded-[1.5rem] text-[2rem] font-black border-2 transition-all shadow-2xl relative overflow-hidden ${calculations.general !== null
                                        ? (calculations.general >= 10
                                            ? 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white border-emerald-400'
                                            : 'bg-gradient-to-br from-rose-500 to-red-700 text-white border-rose-400')
                                        : 'bg-gray-800 text-gray-500 border-gray-700'}`}>
                                        <div className="absolute inset-0 bg-white/10 opacity-20 pointer-events-none"></div>
                                        {calculations.general !== null ? calculations.general.toFixed(2) : '--'}
                                    </div>
                                </td>
                                <td className="px-[1rem] py-[2rem] rounded-br-[2rem]">
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Mobile & Tablet Card List (<lg) */}
                <div className="lg:hidden flex flex-col gap-[1rem] sm:grid sm:grid-cols-2 sm:gap-[1.5rem]">
                    {SUBJECTS.map((s, index) => {
                        const avg = calculations.subjects[s.name];
                        return (
                            <div key={s.name} className="bg-white rounded-[2rem] p-[1.5rem] border border-gray-100 shadow-xl flex flex-col justify-between hover:border-indigo-100 transition-colors">
                                <div className="flex justify-between items-start mb-[1.5rem]">
                                    <div className="flex-1">
                                        <h3 className="text-[1.125rem] font-black text-gray-950 tracking-tight leading-[1.2] mb-[0.25rem]">{t(s.name)}</h3>
                                        <span className="text-[0.55rem] font-black uppercase text-indigo-400 tracking-[0.1em] bg-indigo-50/50 px-[0.5rem] py-[0.25rem] rounded-md">{t('coefficient')} {s.coefficient}</span>
                                    </div>
                                    <div className={`px-[0.75rem] py-[0.25rem] rounded-lg text-[0.625rem] font-black uppercase tracking-widest ${avg !== null ? (avg >= 10 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700') : 'bg-gray-100 text-gray-400'}`}>
                                        {avg !== null ? (avg >= 10 ? t('pass') : t('fail')) : '--'}
                                    </div>
                                </div>

                                <div className="flex items-end gap-[0.75rem] mt-[1.5rem]">
                                    <div className="flex-1">
                                        <label className="block text-[0.5rem] font-black text-gray-400 uppercase tracking-widest mb-[0.5rem] ml-[0.5rem]">{t('examFull')}</label>
                                        <input
                                            id={`mobile-input-${index}-exam`}
                                            type="number"
                                            className="w-full bg-gray-50 border-2 border-transparent rounded-[1rem] py-[1rem] text-center text-[1.125rem] font-black text-gray-950 focus:bg-white focus:border-indigo-600 outline-none transition-all shadow-inner touch-feedback"
                                            value={grades[s.name].exam}
                                            onChange={(e) => handleGradeChange(s.name, 'exam', e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, index, 'exam', 'mobile')}
                                            placeholder="00"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-[0.5rem] font-black text-gray-400 uppercase tracking-widest mb-[0.5rem] ml-[0.5rem]">{t('tdFull')}</label>
                                        <input
                                            id={`mobile-input-${index}-td`}
                                            type="number"
                                            className="w-full bg-gray-50 border-2 border-transparent rounded-[1rem] py-[1rem] text-center text-[1.125rem] font-black text-gray-950 focus:bg-white focus:border-indigo-600 outline-none transition-all shadow-inner touch-feedback"
                                            value={grades[s.name].td}
                                            onChange={(e) => handleGradeChange(s.name, 'td', e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, index, 'td', 'mobile')}
                                            placeholder="00"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-[0.5rem] font-black text-gray-400 uppercase tracking-widest mb-[0.5rem] ml-[0.5rem] text-center">{t('averageShort')}</label>
                                        <div className={`w-full h-[3.45rem] rounded-[1rem] flex items-center justify-center text-[1.125rem] font-black border-2 transition-all shadow-lg ${avg !== null
                                            ? (avg >= 10
                                                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-400 shadow-emerald-500/20'
                                                : 'bg-gradient-to-br from-rose-500 to-red-600 text-white border-rose-400 shadow-rose-500/20')
                                            : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                                            {avg !== null ? avg.toFixed(2) : '--'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Mobile Summary Card */}
                    <div className={`mt-[1rem] bg-gradient-to-br from-indigo-600 to-violet-800 dark:from-gray-900 dark:to-gray-950 text-white rounded-[2.5rem] p-[2.5rem] shadow-[0_20px_50px_rgba(79,70,229,0.4)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-t border-white/10 transition-all duration-700 relative overflow-hidden group`}>
                        <div className={`absolute inset-0 bg-gradient-to-br opacity-20 ${calculations.general >= 10 ? 'from-emerald-400 to-transparent' : 'from-rose-400 to-transparent'}`}></div>
                        <div className="flex justify-between items-center mb-[2rem] relative z-10">
                            <div>
                                <h3 className="text-[1.5rem] font-black tracking-tight leading-none mb-[0.5rem] text-transparent bg-clip-text bg-gradient-to-r from-white to-indigo-100">{t('generalAverageShort')}</h3>
                                <p className="text-indigo-200 text-[0.625rem] font-black uppercase tracking-[0.3em]">{t('totalCoefShort')}: {TOTAL_COEF}</p>
                            </div>
                            <div className={`px-[1.25rem] py-[0.6rem] rounded-xl text-[0.75rem] font-black uppercase tracking-[0.1em] border-2 shadow-2xl ${calculations.general >= 10
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-emerald-400 shadow-emerald-500/40'
                                : 'bg-gradient-to-r from-rose-500 to-red-600 text-white border-rose-400 shadow-rose-500/40'}`}>
                                {calculations.general !== null ? (calculations.general >= 10 ? t('pass') : t('fail')) : '--'}
                            </div>
                        </div>
                        <div className={`w-full h-[7rem] rounded-[2rem] flex items-center justify-center text-[4rem] font-black border-4 shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)] transition-all animate-in zoom-in duration-500 relative z-10 ${calculations.general !== null
                            ? (calculations.general >= 10
                                ? 'bg-gradient-to-br from-emerald-600 to-teal-800 text-white border-emerald-400 text-shadow-glow-green'
                                : 'bg-gradient-to-br from-rose-600 to-red-800 text-white border-rose-400 text-shadow-glow-red')
                            : 'bg-indigo-900 border-indigo-800 text-indigo-300'}`}>
                            {calculations.general !== null ? calculations.general.toFixed(2) : '--'}
                        </div>
                    </div>
                </div>

                <footer className="mt-[5rem] pb-[2rem] text-center opacity-40">
                </footer>
            </div>
        </div>
    );
};

export default Dashboard;
