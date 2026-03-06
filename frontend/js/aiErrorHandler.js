/* ═══════════════════════════════════════════════════════════════════
   AgriShield AI — Async Error Handler Utility
   Safe wrapper for all AI service calls with logging and fallbacks
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ── Error Log (in-memory, last 50 errors) ─────────────────────────
    const errorLog = [];
    const MAX_LOG = 50;

    /**
     * Safely execute an async AI call with error handling.
     * Returns fallback value on failure instead of throwing.
     *
     * @param {Function} fn - Async function to execute
     * @param {*} fallback - Value to return on failure
     * @param {string} [errorMessage] - Custom error label for logging
     * @returns {Promise<*>} Result or fallback
     */
    async function safeAICall(fn, fallback, errorMessage) {
        try {
            return await fn();
        } catch (error) {
            const entry = {
                timestamp: new Date().toISOString(),
                message: errorMessage || 'Unknown AI operation',
                error: error.message || String(error),
                status: error.status || error.statusCode || null,
                type: _classifyError(error)
            };

            errorLog.push(entry);
            if (errorLog.length > MAX_LOG) errorLog.shift();

            console.error('[AgriShield AI Error]', entry.message, '—', entry.error);

            // Specific error handling
            if (error.status === 429 || entry.error.includes('429') || entry.error.includes('rate limit')) {
                console.warn('[AgriShield] ⚠️ Rate limit hit — returning cached or fallback data');
                _showUserNotification('AI service is temporarily busy. Using cached data.', 'warning');
            } else if (error.status === 401 || entry.error.includes('401') || entry.error.includes('unauthorized')) {
                console.warn('[AgriShield] ⚠️ API key issue');
                _showUserNotification('AI service authentication error. Please check configuration.', 'error');
            } else if (entry.error.includes('Failed to fetch') || entry.error.includes('NetworkError') || entry.error.includes('net::')) {
                console.warn('[AgriShield] ⚠️ Network error — AI server may be down');
                _showUserNotification('AI server is not reachable. Using offline data.', 'warning');
            } else if (entry.error.includes('timeout') || entry.error.includes('aborted')) {
                console.warn('[AgriShield] ⚠️ Request timed out');
                _showUserNotification('AI request timed out. Please try again.', 'warning');
            }

            return fallback;
        }
    }

    /**
     * Execute with retry logic
     *
     * @param {Function} fn - Async function to execute
     * @param {*} fallback - Value to return on all failures
     * @param {number} [maxRetries=2] - Maximum retry attempts
     * @param {number} [delayMs=1000] - Delay between retries
     * @param {string} [errorMessage] - Custom error label
     * @returns {Promise<*>} Result or fallback
     */
    async function safeAICallWithRetry(fn, fallback, maxRetries, delayMs, errorMessage) {
        maxRetries = maxRetries || 2;
        delayMs = delayMs || 1000;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                console.warn(
                    `[AgriShield AI] Attempt ${attempt + 1}/${maxRetries + 1} failed:`,
                    errorMessage || '', error.message
                );

                // Don't retry on auth errors or rate limits
                if (error.status === 401 || error.status === 429) {
                    break;
                }

                if (attempt < maxRetries) {
                    await _delay(delayMs * (attempt + 1)); // Exponential backoff
                }
            }
        }

        const entry = {
            timestamp: new Date().toISOString(),
            message: errorMessage || 'AI call failed after retries',
            error: 'All retry attempts exhausted',
            type: 'retry_exhausted'
        };
        errorLog.push(entry);
        if (errorLog.length > MAX_LOG) errorLog.shift();

        console.error('[AgriShield AI Error]', entry.message);
        return fallback;
    }

    /**
     * Classify an error for analytics/logging
     */
    function _classifyError(error) {
        const msg = (error.message || '').toLowerCase();
        if (error.status === 429 || msg.includes('rate limit')) return 'rate_limit';
        if (error.status === 401 || msg.includes('unauthorized') || msg.includes('api key')) return 'auth';
        if (msg.includes('fetch') || msg.includes('network')) return 'network';
        if (msg.includes('timeout') || msg.includes('abort')) return 'timeout';
        if (msg.includes('json') || msg.includes('parse')) return 'parse';
        return 'unknown';
    }

    /**
     * Show user-friendly notification (leverages existing toast system)
     */
    function _showUserNotification(message, type) {
        // Try using the existing toast function
        if (typeof window.toast === 'function') {
            window.toast(message);
            return;
        }

        // Create a toast if one doesn't exist
        const existing = document.querySelector('.toast-notification, .toast');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.className = 'toast-notification';
        if (type === 'error') {
            el.style.background = 'linear-gradient(135deg, #DC2626, #B91C1C)';
        } else if (type === 'warning') {
            el.style.background = 'linear-gradient(135deg, #F59E0B, #D97706)';
        }
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    /**
     * Delay helper
     */
    function _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get error log for debugging
     */
    function getErrorLog() {
        return [...errorLog];
    }

    /**
     * Clear error log
     */
    function clearErrorLog() {
        errorLog.length = 0;
        console.log('[AIErrorHandler] 🗑️ Error log cleared');
    }

    /**
     * Get error statistics
     */
    function getErrorStats() {
        const stats = {
            total: errorLog.length,
            byType: {},
            last: errorLog.length > 0 ? errorLog[errorLog.length - 1] : null
        };

        errorLog.forEach(entry => {
            stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
        });

        return stats;
    }

    // ── Expose to global scope ────────────────────────────────────────
    window.AIErrorHandler = {
        safeAICall,
        safeAICallWithRetry,
        getErrorLog,
        clearErrorLog,
        getErrorStats
    };

    console.log('[AIErrorHandler] 🛡️ Error Handler loaded');
})();
