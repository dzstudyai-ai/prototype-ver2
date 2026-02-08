import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, ShieldCheck, Loader2, AlertTriangle, CheckCircle2, QrCode, Scan } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { createWorker } from 'tesseract.js';

/**
 * AUTO-SCAN VERIFICATION SCANNER WITH html5-qrcode
 * 
 * Uses html5-qrcode for robust QR detection + Tesseract for name OCR
 */
const LiveScanner = ({ manualId, onCapture, onClose }) => {
    const scannerRef = useRef(null);
    const html5QrCodeRef = useRef(null);
    const canvasRef = useRef(null);
    const workerRef = useRef(null);
    const isProcessingRef = useRef(false);

    const [error, setError] = useState(null);
    const [ocrReady, setOcrReady] = useState(false);
    const [status, setStatus] = useState({ text: 'Initialisation...', type: 'loading', step: 0 });
    const [qrMatricule, setQrMatricule] = useState(null);
    const [detectedName, setDetectedName] = useState(null);
    const [validationComplete, setValidationComplete] = useState(false);
    const [scannerActive, setScannerActive] = useState(false);

    // ===== TESSERACT FOR NAME =====
    useEffect(() => {
        const initWorker = async () => {
            try {
                console.log("[OCR] Initializing Tesseract...");
                const worker = await createWorker('fra');
                await worker.setParameters({
                    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ -\'',
                });
                workerRef.current = worker;
                setOcrReady(true);
                console.log("[OCR] ✓ Worker ready");
            } catch (e) {
                console.error("[OCR] ✗ Init failed:", e);
            }
        };
        initWorker();
        return () => { if (workerRef.current) workerRef.current.terminate(); };
    }, []);

    // ===== EXTRACT MATRICULE FROM QR URL =====
    const extractMatriculeFromQR = (qrText) => {
        if (!qrText) return null;
        console.log("[QR] Raw text:", qrText);

        const urlParts = qrText.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        const digits = lastPart.replace(/[^0-9]/g, '');

        if (digits.length >= 10) {
            console.log("[QR] Extracted matricule:", digits);
            return digits;
        }

        const allDigits = qrText.replace(/[^0-9]/g, '');
        if (allDigits.length >= 10) return allDigits;

        return null;
    };

    // ===== COMPARE MATRICULES (ignore first 2 digits) =====
    const compareMatricules = (qrMat, userMat) => {
        const qrCore = qrMat.slice(2);
        const userCore = String(userMat).slice(2);
        console.log(`[Compare] QR: ${qrCore} | User: ${userCore} | Match: ${qrCore === userCore}`);
        return qrCore === userCore;
    };

    // ===== QR SUCCESS HANDLER =====
    const onQRSuccess = useCallback(async (decodedText) => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

        console.log("==========================================");
        console.log("[QR] ✓✓✓ DETECTED!");
        console.log("[QR] Data:", decodedText);
        console.log("==========================================");

        // Stop scanner
        if (html5QrCodeRef.current) {
            try {
                await html5QrCodeRef.current.stop();
                setScannerActive(false);
            } catch (e) {
                console.warn("[Scanner] Stop error:", e);
            }
        }

        const extracted = extractMatriculeFromQR(decodedText);

        if (!extracted) {
            setStatus({ text: 'QR invalide, réessayez...', type: 'error', step: 1 });
            isProcessingRef.current = false;
            restartScanner();
            return;
        }

        setQrMatricule(extracted);

        if (compareMatricules(extracted, manualId)) {
            setStatus({ text: '✓ QR validé! Envoi en cours...', type: 'success', step: 3 });

            // Capture image and send to backend
            await sendToBackend(extracted);
        } else {
            setStatus({
                text: `❌ QR (${extracted}) ≠ Votre ID (${manualId})`,
                type: 'error',
                step: 1
            });

            setTimeout(() => {
                setQrMatricule(null);
                isProcessingRef.current = false;
                restartScanner();
            }, 3000);
        }
    }, [manualId]);

    // ===== START SCANNER =====
    const startScanner = useCallback(async () => {
        if (!scannerRef.current) return;

        setStatus({ text: 'Démarrage du scanner...', type: 'loading', step: 1 });

        try {
            const html5QrCode = new Html5Qrcode("qr-reader");
            html5QrCodeRef.current = html5QrCode;

            await html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0
                },
                onQRSuccess,
                (errorMessage) => {
                    // Silent fail - QR not found this frame
                }
            );

            setScannerActive(true);
            setStatus({ text: 'Pointez le QR Code...', type: 'loading', step: 1 });
            console.log("[Scanner] ✓ Started successfully");

        } catch (err) {
            console.error("[Scanner] Start error:", err);
            setError(`Erreur caméra: ${err.message || err}`);
        }
    }, [onQRSuccess]);

    // ===== RESTART SCANNER =====
    const restartScanner = async () => {
        setStatus({ text: 'Redémarrage...', type: 'loading', step: 1 });
        setTimeout(() => startScanner(), 500);
    };

    // ===== STOP SCANNER =====
    const stopScanner = useCallback(async () => {
        if (html5QrCodeRef.current && scannerActive) {
            try {
                await html5QrCodeRef.current.stop();
                html5QrCodeRef.current = null;
                setScannerActive(false);
            } catch (e) {
                console.warn("[Scanner] Stop error:", e);
            }
        }
    }, [scannerActive]);

    // ===== INIT ON MOUNT =====
    useEffect(() => {
        const timer = setTimeout(() => startScanner(), 500);
        return () => {
            clearTimeout(timer);
            stopScanner();
        };
    }, []);

    // ===== SEND TO BACKEND =====
    const sendToBackend = async (qrMat) => {
        setStatus({ text: 'Envoi au serveur...', type: 'loading', step: 4 });

        try {
            // Capture current frame from scanner video
            const videoElement = document.querySelector('#qr-reader video');

            if (!videoElement) {
                throw new Error("Video element not found");
            }

            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0);

            const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));

            console.log("=================================================");
            console.log("[FRONTEND] SENDING TO BACKEND");
            console.log("[FRONTEND] Blob size:", blob.size, "bytes");
            console.log("[FRONTEND] QR Matricule:", qrMat);
            console.log("[FRONTEND] User Matricule:", manualId);
            console.log("=================================================");

            await onCapture(blob, qrMat, null, null);

            setValidationComplete(true);
            setStatus({ text: '✓ Vérification envoyée!', type: 'success', step: 5 });

        } catch (e) {
            console.error("[Send Error]", e);
            setStatus({ text: `Erreur: ${e.message}`, type: 'error', step: 4 });
            isProcessingRef.current = false;
        }
    };

    // ===== HANDLE CLOSE =====
    const handleClose = async () => {
        await stopScanner();
        onClose();
    };

    // ===== UI =====
    const statusColors = {
        loading: 'bg-amber-500/20 border-amber-500/50 text-amber-300',
        success: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
        error: 'bg-red-500/20 border-red-500/50 text-red-300'
    };

    const steps = [
        { label: 'Init', icon: '📷' },
        { label: 'QR', icon: '📱' },
        { label: 'Match', icon: '✓' },
        { label: 'Envoi', icon: '📤' },
        { label: 'OK', icon: '✅' }
    ];

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-black/80 z-10">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${validationComplete ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                        {validationComplete ? (
                            <CheckCircle2 className="text-emerald-500" size={24} />
                        ) : (
                            <Scan className="text-amber-500 animate-pulse" size={24} />
                        )}
                    </div>
                    <div>
                        <h4 className="text-white font-bold text-sm">Scanner QR Code</h4>
                        <p className="text-gray-400 text-xs">
                            Matricule: {manualId}
                        </p>
                    </div>
                </div>
                <button onClick={handleClose} className="p-2 bg-white/10 rounded-full text-white">
                    <X size={20} />
                </button>
            </div>

            {/* Progress Steps */}
            <div className="px-4 py-2 bg-black/60 flex justify-center gap-1 sm:gap-2">
                {steps.map((s, i) => (
                    <div key={i} className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all ${status.step > i ? 'bg-emerald-500/30 text-emerald-300' :
                            status.step === i ? 'bg-amber-500/30 text-amber-300 animate-pulse' :
                                'bg-white/10 text-gray-500'
                        }`}>
                        <span>{s.icon}</span>
                        <span className="hidden sm:inline">{s.label}</span>
                    </div>
                ))}
            </div>

            {/* Scanner Container */}
            <div className="flex-1 relative flex flex-col items-center justify-center bg-black">
                {/* QR Reader Element */}
                <div
                    id="qr-reader"
                    ref={scannerRef}
                    className="w-full max-w-md aspect-square"
                    style={{
                        maxHeight: '60vh',
                    }}
                />

                {/* QR Result Overlay */}
                {qrMatricule && (
                    <div className="absolute top-4 left-4 right-4 flex justify-center">
                        <div className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/50 rounded-xl backdrop-blur">
                            <p className="text-emerald-300 text-sm font-mono">
                                📱 QR: {qrMatricule}
                            </p>
                        </div>
                    </div>
                )}

                {/* Status */}
                <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
                    <div className={`px-6 py-3 rounded-full border backdrop-blur-xl flex items-center gap-3 ${statusColors[status.type]}`}>
                        {status.type === 'loading' && <Loader2 className="animate-spin" size={18} />}
                        {status.type === 'success' && <CheckCircle2 size={18} />}
                        {status.type === 'error' && <AlertTriangle size={18} />}
                        <span className="font-medium text-sm">{status.text}</span>
                    </div>
                </div>
            </div>

            {/* Bottom Info */}
            <div className="p-6 pb-10 bg-gradient-to-t from-black via-black/95 to-transparent">
                <p className="text-center text-gray-400 text-sm">
                    {validationComplete
                        ? '✓ Identité vérifiée avec succès'
                        : 'Placez le QR Code dans le cadre'}
                </p>
                {validationComplete && (
                    <button
                        onClick={handleClose}
                        className="mt-4 w-full max-w-md mx-auto flex items-center justify-center gap-3 py-4 rounded-full font-bold text-lg bg-emerald-500 text-white"
                    >
                        <CheckCircle2 size={24} /> Continuer
                    </button>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center p-8 text-center z-20">
                    <AlertTriangle size={56} className="text-amber-500 mb-6" />
                    <h5 className="text-white font-bold text-xl mb-2">Erreur</h5>
                    <p className="text-gray-400 mb-8">{error}</p>
                    <button onClick={() => { setError(null); startScanner(); }} className="bg-amber-500 text-black px-8 py-4 rounded-full font-bold">
                        Réessayer
                    </button>
                </div>
            )}

            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};

export default LiveScanner;
