/**
 * VERIFICATION LOGGER — Audit trail pour chaque tentative
 * Tout est loggé dans Supabase table 'verification_logs'
 */
import { supabase } from '../config/db.js';

/**
 * Log a verification attempt
 * @param {Object} params
 * @param {string} params.userId - User UUID
 * @param {string} params.imageHash - SHA-256 hash of the image
 * @param {string} params.ipAddress - Client IP
 * @param {string} params.userAgent - Client User-Agent
 * @param {string} params.validationStatus - VALID, SUSPICIOUS, REJECTED
 * @param {number} params.confidenceScore - Trust score 0-100
 * @param {Array} params.fraudFlags - Array of fraud flag objects
 * @param {Object} params.extractedData - Data extracted from the card
 * @param {string} params.verificationSource - QR, OCR, or MIXED
 */
export async function logVerification({
    userId,
    imageHash,
    ipAddress,
    userAgent,
    validationStatus,
    confidenceScore,
    fraudFlags,
    extractedData,
    verificationSource
}) {
    try {
        const { error } = await supabase
            .from('verification_logs')
            .insert({
                user_id: userId,
                image_hash: imageHash,
                ip_address: ipAddress || 'unknown',
                user_agent: userAgent || 'unknown',
                validation_status: validationStatus,
                confidence_score: confidenceScore,
                fraud_flags: fraudFlags || [],
                extracted_data: extractedData || {},
                verification_source: verificationSource || 'UNKNOWN'
            });

        if (error) {
            console.error("[AUDIT] Failed to log verification:", error.message);
            // Don't throw — logging failure should not block verification
        } else {
            console.log(`[AUDIT] ✅ Logged: ${validationStatus} (score: ${confidenceScore}) for user ${userId}`);
        }
    } catch (e) {
        console.error("[AUDIT] Logger error:", e.message);
    }
}

/**
 * Get client IP from request (handles proxies)
 */
export function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || req.connection?.remoteAddress
        || req.socket?.remoteAddress
        || 'unknown';
}

/**
 * Mask PII in logs (show first/last 2 chars only)
 */
export function maskPII(value) {
    if (!value || value.length < 5) return '***';
    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
}
