/**
 * ═══════════════════════════════════════════════════════════════
 * GRADE TAMPERING DETECTOR — Image forensics for grade screenshots
 * ═══════════════════════════════════════════════════════════════
 * 
 * Techniques:
 *   1. ELA (Error Level Analysis) — re-compress & compare
 *   2. Font consistency — character thickness variance
 *   3. Color temperature — detect temp shifts near grades
 *   4. Edge artifacts — unnatural edges around numbers
 *   5. Background uniformity — detect patched regions
 * 
 * All using Sharp (free, no OpenCV required)
 */

import sharp from 'sharp';

/**
 * Run all tampering detection checks
 * @param {Buffer} imageBuffer - Original image
 * @returns {Object} { tamperingProbability, checks[], details }
 */
export async function detectTampering(imageBuffer) {
    console.log('[TAMPER] Starting tampering analysis...');

    const checks = [];
    let totalWeight = 0;
    let weightedScore = 0;

    try {
        // 1. ELA Analysis (weight: 35%)
        const ela = await performELA(imageBuffer);
        checks.push(ela);
        weightedScore += ela.suspicionScore * 0.35;
        totalWeight += 0.35;
        console.log(`[TAMPER] ELA: suspicion=${ela.suspicionScore}%`);

        // 2. Font consistency (weight: 25%)
        const font = await analyzeEdgeConsistency(imageBuffer);
        checks.push(font);
        weightedScore += font.suspicionScore * 0.25;
        totalWeight += 0.25;
        console.log(`[TAMPER] Edge consistency: suspicion=${font.suspicionScore}%`);

        // 3. Color temperature (weight: 20%)
        const color = await analyzeColorConsistency(imageBuffer);
        checks.push(color);
        weightedScore += color.suspicionScore * 0.20;
        totalWeight += 0.20;
        console.log(`[TAMPER] Color consistency: suspicion=${color.suspicionScore}%`);

        // 4. Compression artifacts (weight: 10%)
        const compression = await analyzeCompressionArtifacts(imageBuffer);
        checks.push(compression);
        weightedScore += compression.suspicionScore * 0.10;
        totalWeight += 0.10;
        console.log(`[TAMPER] Compression: suspicion=${compression.suspicionScore}%`);

        // 5. Background uniformity (weight: 10%)
        const background = await analyzeBackgroundUniformity(imageBuffer);
        checks.push(background);
        weightedScore += background.suspicionScore * 0.10;
        totalWeight += 0.10;
        console.log(`[TAMPER] Background: suspicion=${background.suspicionScore}%`);

    } catch (err) {
        console.error('[TAMPER] Error:', err.message);
        checks.push({ name: 'error', suspicionScore: 50, details: err.message });
    }

    const tamperingProbability = totalWeight > 0
        ? Math.round(weightedScore / totalWeight)
        : 50;

    console.log(`[TAMPER] Final probability: ${tamperingProbability}%`);

    return {
        tamperingProbability: Math.min(100, Math.max(0, tamperingProbability)),
        checks,
        summary: tamperingProbability < 20 ? 'CLEAN'
            : tamperingProbability < 50 ? 'LOW_RISK'
                : tamperingProbability < 75 ? 'SUSPICIOUS'
                    : 'HIGH_RISK'
    };
}

/**
 * ELA — Error Level Analysis
 * Re-compress at low quality and compare pixel differences
 * Edited regions show higher error levels than original content
 */
async function performELA(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        const width = metadata.width;
        const height = metadata.height;

        // Get original pixels (grayscale for comparison)
        const original = await sharp(buffer)
            .grayscale()
            .raw()
            .toBuffer();

        // Re-compress at low quality then decompress
        const recompressed = await sharp(buffer)
            .jpeg({ quality: 75 })
            .toBuffer();

        const recompressedRaw = await sharp(recompressed)
            .resize(width, height, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer();

        // Calculate pixel-by-pixel differences
        const len = Math.min(original.length, recompressedRaw.length);
        let diffSum = 0;
        let diffMax = 0;
        let highDiffPixels = 0;
        const threshold = 30; // Pixels with diff > 30 are suspicious

        for (let i = 0; i < len; i++) {
            const diff = Math.abs(original[i] - recompressedRaw[i]);
            diffSum += diff;
            if (diff > diffMax) diffMax = diff;
            if (diff > threshold) highDiffPixels++;
        }

        const avgDiff = diffSum / len;
        const highDiffRatio = highDiffPixels / len;

        // Score: high variance in errors = possible manipulation
        // Natural images have uniform error distributions
        // Edited images have localized high-error regions
        let suspicion = 0;
        if (highDiffRatio > 0.15) suspicion += 40;
        else if (highDiffRatio > 0.08) suspicion += 20;
        else if (highDiffRatio > 0.03) suspicion += 10;

        if (avgDiff > 20) suspicion += 30;
        else if (avgDiff > 12) suspicion += 15;
        else if (avgDiff > 8) suspicion += 5;

        if (diffMax > 200) suspicion += 30;
        else if (diffMax > 150) suspicion += 15;

        return {
            name: 'ELA',
            suspicionScore: Math.min(100, suspicion),
            details: {
                avgDiff: Math.round(avgDiff * 100) / 100,
                maxDiff: diffMax,
                highDiffRatio: Math.round(highDiffRatio * 10000) / 100
            }
        };
    } catch (err) {
        return { name: 'ELA', suspicionScore: 30, details: { error: err.message } };
    }
}

/**
 * Edge Consistency Analysis
 * Detect inconsistent edge sharpness across the image
 * Edited regions often have different edge characteristics
 */
async function analyzeEdgeConsistency(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        const width = metadata.width;
        const height = metadata.height;

        // Split image into quadrants and compare edge density
        const quadrantSize = { w: Math.floor(width / 2), h: Math.floor(height / 2) };
        const edgeDensities = [];

        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 2; col++) {
                const region = await sharp(buffer)
                    .extract({
                        left: col * quadrantSize.w,
                        top: row * quadrantSize.h,
                        width: quadrantSize.w,
                        height: quadrantSize.h
                    })
                    .grayscale()
                    .convolve({
                        width: 3, height: 3,
                        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
                    })
                    .raw()
                    .toBuffer();

                let edgeSum = 0;
                for (let i = 0; i < region.length; i++) edgeSum += region[i];
                edgeDensities.push(edgeSum / region.length);
            }
        }

        // Calculate variance in edge densities
        const mean = edgeDensities.reduce((a, b) => a + b, 0) / edgeDensities.length;
        const variance = edgeDensities.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / edgeDensities.length;
        const stdDev = Math.sqrt(variance);
        const coeffOfVariation = mean > 0 ? (stdDev / mean) * 100 : 0;

        // High variation in edge density across quadrants = suspicious
        let suspicion = 0;
        if (coeffOfVariation > 60) suspicion = 70;
        else if (coeffOfVariation > 40) suspicion = 45;
        else if (coeffOfVariation > 25) suspicion = 20;
        else suspicion = 5;

        return {
            name: 'EDGE_CONSISTENCY',
            suspicionScore: suspicion,
            details: {
                quadrantEdgeDensities: edgeDensities.map(d => Math.round(d * 100) / 100),
                coeffOfVariation: Math.round(coeffOfVariation * 100) / 100
            }
        };
    } catch (err) {
        return { name: 'EDGE_CONSISTENCY', suspicionScore: 25, details: { error: err.message } };
    }
}

/**
 * Color Consistency Analysis
 * Check if different regions of the image have consistent color temperatures
 * Pasted content often has different white balance
 */
async function analyzeColorConsistency(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        const width = metadata.width;
        const height = metadata.height;

        // Sample 4 horizontal strips
        const stripHeight = Math.floor(height / 4);
        const colorTemps = [];

        for (let i = 0; i < 4; i++) {
            const strip = await sharp(buffer)
                .extract({
                    left: 0,
                    top: i * stripHeight,
                    width: width,
                    height: stripHeight
                })
                .stats();

            // Color temperature approximation: ratio of blue to red channels
            const r = strip.channels[0]?.mean || 128;
            const b = strip.channels[2]?.mean || 128;
            const temp = r > 0 ? b / r : 1;
            colorTemps.push(temp);
        }

        // Check variance
        const mean = colorTemps.reduce((a, b) => a + b, 0) / colorTemps.length;
        const variance = colorTemps.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / colorTemps.length;
        const maxDelta = Math.max(...colorTemps) - Math.min(...colorTemps);

        let suspicion = 0;
        if (maxDelta > 0.3) suspicion = 70;
        else if (maxDelta > 0.15) suspicion = 35;
        else if (maxDelta > 0.08) suspicion = 15;
        else suspicion = 5;

        return {
            name: 'COLOR_CONSISTENCY',
            suspicionScore: suspicion,
            details: {
                stripTemperatures: colorTemps.map(t => Math.round(t * 1000) / 1000),
                maxDelta: Math.round(maxDelta * 1000) / 1000,
                variance: Math.round(variance * 10000) / 10000
            }
        };
    } catch (err) {
        return { name: 'COLOR_CONSISTENCY', suspicionScore: 20, details: { error: err.message } };
    }
}

/**
 * Compression Artifact Analysis
 * Multiple JPEG saves create layered artifacts
 * Edited images often have inconsistent compression levels
 */
async function analyzeCompressionArtifacts(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();

        // Compare quality at two compression levels
        const q90 = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
        const q50 = await sharp(buffer).jpeg({ quality: 50 }).toBuffer();

        // Size ratio indicates existing compression level
        const sizeRatio = q50.length / q90.length;
        const originalSize = buffer.length;
        const compressionRatio = q90.length / originalSize;

        let suspicion = 0;

        // Already heavily compressed = possible re-save after editing
        if (compressionRatio > 1.2) {
            suspicion += 30; // Image grows when saved at 90 = was already <90
        }

        // Unusual size ratio between quality levels
        if (sizeRatio > 0.8) {
            suspicion += 20; // Little difference = already very compressed
        }

        // PNG screenshots should have specific characteristics
        if (metadata.format === 'png') {
            suspicion -= 10; // PNGs are less likely from edited JPEGs
        }

        return {
            name: 'COMPRESSION',
            suspicionScore: Math.max(0, Math.min(100, suspicion)),
            details: {
                format: metadata.format,
                originalSize,
                q90Size: q90.length,
                q50Size: q50.length,
                sizeRatio: Math.round(sizeRatio * 1000) / 1000,
                compressionRatio: Math.round(compressionRatio * 1000) / 1000
            }
        };
    } catch (err) {
        return { name: 'COMPRESSION', suspicionScore: 20, details: { error: err.message } };
    }
}

/**
 * Background Uniformity Analysis
 * Check if the background color is consistent
 * Pasted grades over a background create subtle differences
 */
async function analyzeBackgroundUniformity(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        const width = metadata.width;
        const height = metadata.height;

        // Sample small patches from the content area (middle 60%)
        const patchSize = 30;
        const patches = [];
        const startY = Math.floor(height * 0.2);
        const endY = Math.floor(height * 0.8);
        const startX = Math.floor(width * 0.1);
        const endX = Math.floor(width * 0.9);

        for (let i = 0; i < 8; i++) {
            const x = startX + Math.floor(Math.random() * (endX - startX - patchSize));
            const y = startY + Math.floor(Math.random() * (endY - startY - patchSize));

            try {
                const stats = await sharp(buffer)
                    .extract({ left: x, top: y, width: patchSize, height: patchSize })
                    .stats();

                patches.push({
                    r: stats.channels[0]?.mean || 0,
                    g: stats.channels[1]?.mean || 0,
                    b: stats.channels[2]?.mean || 0,
                    stdDev: (stats.channels[0]?.stdev || 0 + stats.channels[1]?.stdev || 0 + stats.channels[2]?.stdev || 0) / 3
                });
            } catch (e) { /* skip invalid patches */ }
        }

        if (patches.length < 3) {
            return { name: 'BACKGROUND', suspicionScore: 30, details: { error: 'Insufficient patches' } };
        }

        // Compare patch colors — consistent background should be similar
        const avgR = patches.reduce((s, p) => s + p.r, 0) / patches.length;
        const avgG = patches.reduce((s, p) => s + p.g, 0) / patches.length;
        const avgB = patches.reduce((s, p) => s + p.b, 0) / patches.length;

        let maxColorDiff = 0;
        for (const p of patches) {
            const diff = Math.sqrt(Math.pow(p.r - avgR, 2) + Math.pow(p.g - avgG, 2) + Math.pow(p.b - avgB, 2));
            if (diff > maxColorDiff) maxColorDiff = diff;
        }

        let suspicion = 0;
        if (maxColorDiff > 60) suspicion = 65;
        else if (maxColorDiff > 35) suspicion = 35;
        else if (maxColorDiff > 20) suspicion = 15;
        else suspicion = 5;

        return {
            name: 'BACKGROUND',
            suspicionScore: suspicion,
            details: {
                patchCount: patches.length,
                maxColorDifference: Math.round(maxColorDiff * 100) / 100,
                avgColor: { r: Math.round(avgR), g: Math.round(avgG), b: Math.round(avgB) }
            }
        };
    } catch (err) {
        return { name: 'BACKGROUND', suspicionScore: 20, details: { error: err.message } };
    }
}
