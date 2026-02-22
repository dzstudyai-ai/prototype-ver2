import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, X, ChevronDown, ChevronUp, Clock, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * CodeOverlay — Persistent floating verification code displayed on screen.
 * Visible during screenshots. Responsive for mobile and desktop.
 */
const CodeOverlay = ({ code, timeLeft, ttl = 300, onClose }) => {
    const { t } = useTranslation();
    const [minimized, setMinimized] = useState(false);
    const [position, setPosition] = useState({ x: 16, y: 16 });
    const dragRef = useRef(null);
    const isDragging = useRef(false);
    const offset = useRef({ x: 0, y: 0 });

    const handleStart = useCallback((e) => {
        isDragging.current = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        offset.current = { x: clientX - position.x, y: clientY - position.y };
    }, [position]);

    const handleMove = useCallback((e) => {
        if (!isDragging.current) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        setPosition({
            x: Math.max(0, Math.min(window.innerWidth - 200, clientX - offset.current.x)),
            y: Math.max(0, Math.min(window.innerHeight - 80, clientY - offset.current.y))
        });
    }, []);

    const handleEnd = useCallback(() => { isDragging.current = false; }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleEnd);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleEnd);
        };
    }, [handleMove, handleEnd]);

    // Early return AFTER all hooks
    if (!code) return null;

    const percentage = ttl > 0 ? (timeLeft / ttl) * 100 : 0;
    const timerColor = timeLeft > 40 ? '#4ade80' : timeLeft > 15 ? '#fbbf24' : '#f87171';
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    if (minimized) {
        return (
            <div
                style={{ left: position.x, top: position.y, zIndex: 9999, backgroundColor: 'rgba(17,17,17,0.95)' }}
                className="fixed rounded-full shadow-2xl border border-gray-700 cursor-grab active:cursor-grabbing"
                onMouseDown={handleStart}
                onTouchStart={handleStart}
            >
                <div className="flex items-center gap-2 px-3 py-2">
                    <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: timerColor }} />
                    <span className="text-white font-mono font-black text-xs">{code}</span>
                    <span className="font-mono text-xs font-bold" style={{ color: timerColor }}>
                        {minutes}:{String(seconds).padStart(2, '0')}
                    </span>
                    <button onClick={() => setMinimized(false)} className="ml-1 text-gray-400 hover:text-white">
                        <ChevronUp size={12} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={dragRef}
            style={{ left: position.x, top: position.y, zIndex: 9999, backgroundColor: 'rgba(17,17,17,0.97)' }}
            className="fixed rounded-2xl shadow-2xl border border-indigo-500/30 cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleStart}
            onTouchStart={handleStart}
        >
            <div className="p-4 min-w-[220px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Shield size={14} className="text-indigo-400" />
                        <span className="text-gray-400 text-[0.6rem] font-black uppercase tracking-[0.2em]">{t('codeVerification')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setMinimized(true)} className="w-6 h-6 rounded-md bg-gray-800 hover:bg-gray-700 flex items-center justify-center">
                            <ChevronDown size={10} className="text-gray-400" />
                        </button>
                        <button onClick={onClose} className="w-6 h-6 rounded-md bg-gray-800 hover:bg-gray-700 flex items-center justify-center">
                            <X size={10} className="text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Code */}
                <div className="text-center mb-3">
                    <span className="text-white font-mono text-2xl font-black tracking-[0.12em] select-all pointer-events-auto">{code}</span>
                </div>

                {/* Timer */}
                <div className="flex items-center justify-center gap-2 mb-2">
                    <Clock size={12} style={{ color: timerColor }} />
                    <span className="font-mono font-black text-base" style={{ color: timerColor }}>
                        {minutes}:{String(seconds).padStart(2, '0')}
                    </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-800 rounded-full h-1 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${percentage}%`, backgroundColor: timerColor }}
                    />
                </div>

                <p className="text-gray-600 text-[0.5rem] text-center mt-2 uppercase tracking-wider font-bold">
                    Visible dans les captures
                </p>
            </div>
        </div>
    );
};

export default CodeOverlay;
