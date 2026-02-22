/**
 * ═══════════════════════════════════════════════════════════════
 * VIDEO PROCESSOR — Frame extraction & blur detection
 * ═══════════════════════════════════════════════════════════════
 * 
 * Pipeline:
 *   1. Save uploaded video to temp file
 *   2. Extract frames at configurable FPS using ffmpeg
 *   3. Detect and discard blurry frames (Laplacian variance)
 *   4. Return array of clear frame buffers with timestamps
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Set ffmpeg path from bundled installer
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Extract frames from a video buffer
 * @param {Buffer} videoBuffer - The uploaded video file
 * @param {Object} options
 * @param {number} options.fps - Frames per second to extract (default: 1)
 * @param {number} options.maxFrames - Max frames to extract (default: 10)
 * @returns {Promise<Array<{index, timestamp, buffer}>>} Array of frame objects
 */
export async function extractFrames(videoBuffer, { fps = 1, maxFrames = 10 } = {}) {
    // Create temp directory for this extraction
    const tmpId = crypto.randomBytes(8).toString('hex');
    const tmpDir = path.join(os.tmpdir(), `frames_${tmpId}`);
    const videoPath = path.join(os.tmpdir(), `video_${tmpId}.mp4`);

    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(videoPath, videoBuffer);

    try {
        // Get video duration first
        const duration = await getVideoDuration(videoPath);
        console.log(`[VIDEO] Duration: ${duration.toFixed(1)}s, extracting at ${fps}fps`);

        if (duration < 3) {
            throw new Error('Vidéo trop courte (minimum 3 secondes)');
        }
        if (duration > 90) { // Problem 3: Increased duration limit
            throw new Error('Vidéo trop longue (maximum 90 secondes)');
        }

        // Extract frames using ffmpeg with resolution cap (max 1200 width)
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .outputOptions([
                    `-vf fps=${fps},scale='min(1200,iw)':-1`,
                    '-frames:v', String(maxFrames),
                    '-q:v', '4' // Medium quality JPEG for faster processing
                ])
                .output(path.join(tmpDir, 'frame_%04d.jpg'))
                .on('end', resolve)
                .on('error', reject)
                .run();
        });


        // Read extracted frames
        const frameFiles = fs.readdirSync(tmpDir)
            .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
            .sort();

        const frames = [];
        for (let i = 0; i < frameFiles.length; i++) {
            const buffer = fs.readFileSync(path.join(tmpDir, frameFiles[i]));
            frames.push({
                index: i,
                timestamp: i / fps, // Approximate timestamp in seconds
                buffer
            });
        }

        console.log(`[VIDEO] Extracted ${frames.length} frames`);
        return frames;

    } finally {
        // Cleanup temp files
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            fs.unlinkSync(videoPath);
        } catch (e) { /* ignore cleanup errors */ }
    }
}

/**
 * Get video duration in seconds
 */
function getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) return reject(err);
            resolve(metadata.format.duration || 0);
        });
    });
}

/**
 * Detect if a frame is blurry using Laplacian variance
 * Higher variance = sharper image. Low variance = blurry.
 * 
 * @param {Buffer} frameBuffer - JPEG/PNG buffer
 * @returns {Promise<{isBlurry: boolean, variance: number}>}
 */
export async function detectBlur(frameBuffer) {
    try {
        // Convert to grayscale and get raw pixel data
        const { data, info } = await sharp(frameBuffer)
            .grayscale()
            .resize(640, null, { withoutEnlargement: true }) // Downscale for speed
            .raw()
            .toBuffer({ resolveWithObject: true });

        const { width, height } = info;

        // Compute Laplacian variance (simplified 3x3 kernel)
        // Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
        let sum = 0;
        let sumSq = 0;
        let count = 0;

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                const laplacian =
                    -4 * data[idx] +
                    data[(y - 1) * width + x] +
                    data[(y + 1) * width + x] +
                    data[y * width + (x - 1)] +
                    data[y * width + (x + 1)];

                sum += laplacian;
                sumSq += laplacian * laplacian;
                count++;
            }
        }

        const mean = sum / count;
        const variance = (sumSq / count) - (mean * mean);

        // Threshold: variance < 100 is considered blurry
        const BLUR_THRESHOLD = 100;
        const isBlurry = variance < BLUR_THRESHOLD;

        return { isBlurry, variance: Math.round(variance) };

    } catch (err) {
        console.error('[BLUR] Detection failed:', err.message);
        return { isBlurry: false, variance: -1 }; // Err on the side of keeping the frame
    }
}

/**
 * Filter frames, keeping only clear (non-blurry) ones
 * @param {Array} frames - Array of {index, timestamp, buffer}
 * @param {number} minFrames - Minimum frames to keep even if blurry (default: 3)
 * @returns {Promise<Array>} Filtered frames with blur info
 */
export async function filterClearFrames(frames, minFrames = 3) {
    const results = await Promise.all(
        frames.map(async (frame) => {
            const blur = await detectBlur(frame.buffer);
            return { ...frame, ...blur };
        })
    );

    // Separate clear and blurry
    const clear = results.filter(f => !f.isBlurry);
    const blurry = results.filter(f => f.isBlurry);

    console.log(`[VIDEO] Clear frames: ${clear.length}, Blurry frames: ${blurry.length}`);

    // If not enough clear frames, include least blurry ones
    if (clear.length < minFrames && blurry.length > 0) {
        const sorted = blurry.sort((a, b) => b.variance - a.variance);
        const needed = minFrames - clear.length;
        clear.push(...sorted.slice(0, needed));
        console.log(`[VIDEO] Added ${Math.min(needed, sorted.length)} least-blurry frames to meet minimum`);
    }

    return clear.sort((a, b) => a.index - b.index);
}
