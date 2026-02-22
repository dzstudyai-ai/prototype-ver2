/**
 * IMAGE PROCESSOR — Analyse d'image niveau industrie
 * Utilise Sharp (gratuit) pour: blur, lumière, bruit, histogramme, EXIF, qualité
 */
import sharp from 'sharp';

/**
 * Complete image analysis pipeline
 * @param {Buffer} imageBuffer - Raw image buffer
 * @returns {Object} Full analysis results
 */
export async function analyzeImage(imageBuffer) {
    const results = {
        blur: { score: 0, isBlurry: false },
        lighting: { score: 0, quality: 'unknown' },
        noise: { score: 0, level: 'unknown' },
        resolution: { width: 0, height: 0, megapixels: 0, sufficient: false },
        contrast: { score: 0 },
        exif: { hasCamera: false, hasGPS: false, data: {} },
        cardStructure: { aspectRatioValid: false, ratio: 0 },
        overallQuality: 0
    };

    try {
        const metadata = await sharp(imageBuffer).metadata();
        results.resolution.width = metadata.width || 0;
        results.resolution.height = metadata.height || 0;
        results.resolution.megapixels = ((metadata.width || 0) * (metadata.height || 0)) / 1_000_000;
        results.resolution.sufficient = results.resolution.megapixels >= 0.3; // 0.3MP minimum

        // EXIF extraction
        if (metadata.exif) {
            results.exif.data = extractEXIF(metadata);
            results.exif.hasCamera = !!results.exif.data.make || !!results.exif.data.model;
            results.exif.hasGPS = !!results.exif.data.gpsLatitude;
        }

        // Card aspect ratio check (standard ID card ≈ 1.586 ratio, like credit card)
        const w = Math.max(metadata.width || 1, metadata.height || 1);
        const h = Math.min(metadata.width || 1, metadata.height || 1);
        results.cardStructure.ratio = w / h;
        // Valid card ratio between 1.3 and 1.8 (allows for some cropping)
        results.cardStructure.aspectRatioValid = results.cardStructure.ratio >= 1.2 && results.cardStructure.ratio <= 2.0;

        // === BLUR DETECTION (Laplacian variance approximation) ===
        results.blur = await detectBlur(imageBuffer);

        // === LIGHTING ANALYSIS ===
        results.lighting = await analyzeLighting(imageBuffer);

        // === NOISE ESTIMATION ===
        results.noise = await estimateNoise(imageBuffer);

        // === CONTRAST ANALYSIS ===
        results.contrast = await analyzeContrast(imageBuffer);

        // === OVERALL QUALITY SCORE (0-100) ===
        results.overallQuality = calculateQualityScore(results);

    } catch (error) {
        console.error("[IMAGE-PROC] Analysis error:", error.message);
    }

    return results;
}

/**
 * Blur Detection — Laplacian variance via edge detection
 * High variance = sharp, Low variance = blurry
 */
async function detectBlur(buffer) {
    try {
        // Apply Laplacian-like kernel (edge detection)
        const edgeBuffer = await sharp(buffer)
            .resize(500) // Normalize size for consistent results
            .grayscale()
            .convolve({
                width: 3, height: 3,
                kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] // Laplacian kernel
            })
            .raw()
            .toBuffer();

        // Calculate variance of edge-detected image
        const pixels = new Uint8Array(edgeBuffer);
        const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
        const variance = pixels.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / pixels.length;

        // Variance thresholds (calibrated for ID cards):
        // > 500  = very sharp
        // 100-500 = acceptable
        // < 100  = blurry
        const score = Math.min(100, Math.round(variance / 5));
        const isBlurry = variance < 100;

        return { score, isBlurry, variance: Math.round(variance) };
    } catch (e) {
        console.warn("[BLUR] Detection failed:", e.message);
        return { score: 50, isBlurry: false, variance: 0 };
    }
}

/**
 * Lighting Analysis — Histogram-based brightness assessment
 */
async function analyzeLighting(buffer) {
    try {
        const { dominant, channels } = await sharp(buffer)
            .resize(300)
            .stats();

        // Average brightness across all channels
        const avgBrightness = channels.reduce((sum, c) => sum + c.mean, 0) / channels.length;

        let quality = 'good';
        let score = 80;

        if (avgBrightness < 50) {
            quality = 'too_dark';
            score = 30;
        } else if (avgBrightness < 80) {
            quality = 'slightly_dark';
            score = 60;
        } else if (avgBrightness > 220) {
            quality = 'overexposed';
            score = 30;
        } else if (avgBrightness > 180) {
            quality = 'slightly_bright';
            score = 65;
        } else {
            quality = 'good';
            score = 90;
        }

        return { score, quality, brightness: Math.round(avgBrightness) };
    } catch (e) {
        return { score: 50, quality: 'unknown', brightness: 0 };
    }
}

/**
 * Noise Estimation — Standard deviation analysis
 * Screenshots have very low noise (smooth gradients)
 * Real photos have natural sensor noise
 */
async function estimateNoise(buffer) {
    try {
        const { channels } = await sharp(buffer)
            .resize(300)
            .grayscale()
            .stats();

        // Standard deviation of pixel values
        const stdDev = channels[0]?.stdev || 0;

        // Very low stddev + high uniformity = possible screenshot
        // Normal photo stddev: 30-80
        // Screenshot stddev: often < 20 or very uniform
        let level = 'normal';
        let score = 70;

        if (stdDev < 15) {
            level = 'very_low'; // Suspicious — could be screenshot
            score = 20;
        } else if (stdDev < 30) {
            level = 'low';
            score = 50;
        } else if (stdDev > 80) {
            level = 'high'; // Very noisy image
            score = 40;
        } else {
            level = 'normal';
            score = 85;
        }

        return { score, level, stdDev: Math.round(stdDev * 100) / 100 };
    } catch (e) {
        return { score: 50, level: 'unknown', stdDev: 0 };
    }
}

/**
 * Contrast Analysis — Range of pixel values
 */
async function analyzeContrast(buffer) {
    try {
        const { channels } = await sharp(buffer)
            .resize(300)
            .grayscale()
            .stats();

        const minVal = channels[0]?.minVal ?? 0;
        const maxVal = channels[0]?.maxVal ?? 255;
        const range = maxVal - minVal;

        // Good contrast: range > 150
        // Poor contrast: range < 80
        const score = Math.min(100, Math.round((range / 255) * 100));

        return { score, range, min: minVal, max: maxVal };
    } catch (e) {
        return { score: 50, range: 0 };
    }
}

/**
 * Extract EXIF metadata
 */
function extractEXIF(metadata) {
    const exif = {};
    try {
        if (metadata.exif) {
            // Sharp gives us raw EXIF buffer, extract basic info from metadata
            exif.format = metadata.format;
            exif.width = metadata.width;
            exif.height = metadata.height;
            exif.density = metadata.density;
            exif.hasAlpha = metadata.hasAlpha;
            exif.orientation = metadata.orientation;
            // Check if EXIF contains camera data (presence = real photo)
            exif.hasExifData = true;
        }
        if (metadata.icc) {
            exif.hasICCProfile = true;
        }
    } catch (e) { /* ignore */ }
    return exif;
}

/**
 * Preprocess image for optimal OCR (Rule 1 of Performance Architecture)
 * - Resize to max 1200px
 * - Convert to grayscale
 * - Increase contrast & normalization
 * - Crop text region (ID area)
 */
export async function preprocessForOCR(buffer) {
    const metadata = await sharp(buffer).metadata();
    const w = metadata.width || 1200;
    const h = metadata.height || 800;

    const cropWidth = Math.floor(w * 0.8);
    const cropHeight = Math.floor(h * 0.8);
    const cropLeft = Math.floor(w * 0.1);
    const cropTop = Math.floor(h * 0.1);

    // Ensure we don't extract out of bounds
    const safeW = Math.min(cropWidth, w - cropLeft);
    const safeH = Math.min(cropHeight, h - cropTop);

    return sharp(buffer)
        .resize(1200, null, { withoutEnlargement: true }) // Problem 3: Max width 1200px
        .grayscale()
        .modulate({ brightness: 1.05, contrast: 1.3 }) // Problem 3: Increase contrast
        .normalize()
        .sharpen()
        // Rule: Crop only text region (ID area)
        .extract({
            left: cropLeft,
            top: cropTop,
            width: safeW,
            height: safeH
        })
        .toBuffer();
}

/**
 * Preprocess image for QR detection (multiple variants)
 */
export async function preprocessForQR(buffer, size = 800) {
    const { data, info } = await sharp(buffer)
        .resize(size)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    return { rawData: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/**
 * High contrast preprocessing for QR fallback
 */
export async function preprocessForQRContrast(buffer) {
    const { data, info } = await sharp(buffer)
        .resize(1000)
        .grayscale()
        .modulate({ contrast: 2.0 }) // High contrast
        .normalize()
        .sharpen()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    return { rawData: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/**
 * Threshold preprocessing for QR (good for faded copies)
 */
export async function preprocessForQRThreshold(buffer, threshold = 128) {
    const { data, info } = await sharp(buffer)
        .resize(1000)
        .grayscale()
        .threshold(threshold)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    return { rawData: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/**
 * Calculate overall quality score from sub-scores
 */
function calculateQualityScore(results) {
    const weights = {
        blur: 0.25,
        lighting: 0.20,
        noise: 0.15,
        contrast: 0.15,
        resolution: 0.15,
        cardStructure: 0.10
    };

    const resScore = results.resolution.sufficient ? 80 : 30;
    const cardScore = results.cardStructure.aspectRatioValid ? 80 : 40;

    const total =
        results.blur.score * weights.blur +
        results.lighting.score * weights.lighting +
        results.noise.score * weights.noise +
        results.contrast.score * weights.contrast +
        resScore * weights.resolution +
        cardScore * weights.cardStructure;

    return Math.round(total);
}

/**
 * Get image hash for anti-replay detection
 */
export async function getImageHash(buffer) {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
}
