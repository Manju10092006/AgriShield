/* ═══════════════════════════════════════════════════════════════════
   AgriShield AI — Gemini Advisory Service with Smart Caching
   Provides: Cached advisory generation, deduplication, dual-layer cache
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ── In-Memory Cache (fastest) ─────────────────────────────────────
    const memoryCache = new Map();

    // ── Pending Requests Map (prevents duplicate in-flight calls) ────
    const pendingRequests = new Map();

    // ── AI Server Base URL ────────────────────────────────────────────
    const AI_BASE = 'http://127.0.0.1:4000/ai';

    /**
     * Generate a cache key for a crop+disease combination
     * Format: agrishield_advisory_{crop}_{disease}
     */
    function makeCacheKey(crop, disease) {
        return `agrishield_advisory_${crop}_${disease}`
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '');
    }

    /**
     * Get an advisory for a given crop+disease combination.
     * Uses a dual-layer cache (memory + localStorage) and deduplicates
     * in-flight requests so Gemini is called ONLY ONCE per unique combination.
     *
     * @param {string} crop - Crop name (e.g. "Tomato")
     * @param {string} disease - Disease name (e.g. "Late Blight")
     * @param {number} confidence - Detection confidence (0–100)
     * @param {string} [region='India'] - Region for localized advice
     * @param {string} [language='English'] - Language for response
     * @returns {Promise<Object>} Advisory result object
     */
    async function getAdvisory(crop, disease, confidence, region, language) {
        region = region || 'India';
        language = language || 'English';

        const cacheKey = makeCacheKey(crop, disease);

        // ── Layer 1: Memory Cache (instant) ─────────────────────────
        if (memoryCache.has(cacheKey)) {
            console.log('[GeminiAdvisory] ✅ Memory cache hit:', cacheKey);
            return memoryCache.get(cacheKey);
        }

        // ── Layer 2: localStorage Cache (persisted) ─────────────────
        try {
            const stored = localStorage.getItem(cacheKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Cache is valid for 24 hours
                const ageHours = (Date.now() - new Date(parsed.generatedAt).getTime()) / 3600000;
                if (ageHours < 24) {
                    console.log('[GeminiAdvisory] ✅ localStorage cache hit:', cacheKey, `(${ageHours.toFixed(1)}h old)`);
                    memoryCache.set(cacheKey, parsed);
                    return parsed;
                } else {
                    console.log('[GeminiAdvisory] ⏰ Cache expired:', cacheKey);
                    localStorage.removeItem(cacheKey);
                }
            }
        } catch (e) {
            console.warn('[GeminiAdvisory] localStorage read error:', e.message);
        }

        // ── Deduplication: If a request for this key is already in-flight, reuse it ──
        if (pendingRequests.has(cacheKey)) {
            console.log('[GeminiAdvisory] ⏳ Reusing pending request:', cacheKey);
            return pendingRequests.get(cacheKey);
        }

        // ── Layer 3: Call Gemini API (via ai-server) ────────────────
        const requestPromise = _fetchAdvisoryFromGemini(crop, disease, confidence, region, language, cacheKey);
        pendingRequests.set(cacheKey, requestPromise);

        try {
            const result = await requestPromise;
            return result;
        } finally {
            pendingRequests.delete(cacheKey);
        }
    }

    /**
     * Internal: Fetch advisory from the Gemini AI server
     */
    async function _fetchAdvisoryFromGemini(crop, disease, confidence, region, language, cacheKey) {
        console.log('[GeminiAdvisory] 🌐 Calling Gemini API for:', cacheKey);

        const payload = {
            plant: crop,
            disease: disease,
            confidence: typeof confidence === 'number' ? confidence.toFixed(1) + '%' : confidence,
            language: language
        };

        // Try the AI server first (Gemini backend)
        try {
            const res = await fetch(AI_BASE + '/advisory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                throw new Error('AI server returned ' + res.status);
            }

            const aiData = await res.json();

            // Build structured advisory result
            const advisory = {
                crop: crop,
                disease: disease,
                confidence: confidence,
                organicTreatment: _parseListField(aiData.organic),
                chemicalTreatment: _parseListField(aiData.chemical),
                fertilizerRecommendation: aiData.fertilizer || 'Apply balanced NPK fertilizer as recommended.',
                preventionTips: _parseListField(aiData.prevention),
                recoveryTimeline: aiData.recovery || '7–14 days with timely treatment.',
                severity: _mapSeverity(confidence),
                immediate: aiData.immediate || '',
                advisoryMarkdown: aiData.advisory_markdown || '',
                generatedAt: new Date().toISOString(),
                source: 'gemini-server',
                cacheKey: cacheKey
            };

            // Store in both caches
            memoryCache.set(cacheKey, advisory);
            try {
                localStorage.setItem(cacheKey, JSON.stringify(advisory));
            } catch (e) {
                console.warn('[GeminiAdvisory] localStorage write error:', e.message);
            }

            console.log('[GeminiAdvisory] ✅ Advisory cached:', cacheKey);
            return advisory;

        } catch (serverErr) {
            console.warn('[GeminiAdvisory] Server call failed, trying Puter.js fallback:', serverErr.message);

            // Fallback: Try Puter.js if available
            if (window.AgriShieldAI && typeof window.AgriShieldAI.generatePuterAdvisory === 'function') {
                try {
                    const confDecimal = typeof confidence === 'number' && confidence > 1 ? confidence / 100 : confidence;
                    const puterData = await window.AgriShieldAI.generatePuterAdvisory(
                        disease, crop, confDecimal,
                        window.AgriShield?.selectedLanguage || 'en'
                    );

                    const advisory = {
                        crop: crop,
                        disease: disease,
                        confidence: confidence,
                        organicTreatment: _parseListField(puterData.organic),
                        chemicalTreatment: _parseListField(puterData.chemical),
                        fertilizerRecommendation: puterData.fertilizer || 'Apply balanced NPK fertilizer.',
                        preventionTips: _parseListField(puterData.prevention),
                        recoveryTimeline: puterData.recovery || '7–14 days with treatment.',
                        severity: _mapSeverity(confidence),
                        immediate: puterData.immediate || '',
                        advisoryMarkdown: puterData.advisory_markdown || '',
                        generatedAt: new Date().toISOString(),
                        source: 'puter-fallback',
                        cacheKey: cacheKey
                    };

                    memoryCache.set(cacheKey, advisory);
                    try { localStorage.setItem(cacheKey, JSON.stringify(advisory)); } catch { }

                    console.log('[GeminiAdvisory] ✅ Puter.js fallback advisory cached:', cacheKey);
                    return advisory;

                } catch (puterErr) {
                    console.error('[GeminiAdvisory] Puter.js fallback also failed:', puterErr.message);
                }
            }

            // Return safe fallback data
            return _getFallbackAdvisory(crop, disease, confidence);
        }
    }

    /**
     * Parse a string field into an array of items
     */
    function _parseListField(text) {
        if (!text) return [];
        if (Array.isArray(text)) return text;
        // Split by numbered list, bullet points, or newlines
        return text
            .split(/(?:\d+\.\s+|[-•]\s+|\n)/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    /**
     * Map confidence to severity level
     */
    function _mapSeverity(confidence) {
        const conf = typeof confidence === 'string' ? parseFloat(confidence) : confidence;
        const pct = conf > 1 ? conf : conf * 100;
        if (pct >= 85) return 'Critical';
        if (pct >= 65) return 'High';
        if (pct >= 40) return 'Moderate';
        return 'Low';
    }

    /**
     * Fallback advisory when all AI calls fail
     */
    function _getFallbackAdvisory(crop, disease, confidence) {
        return {
            crop: crop,
            disease: disease,
            confidence: confidence,
            organicTreatment: [
                'Apply neem oil spray (2-3 ml per liter of water)',
                'Use garlic + chili extract solution',
                'Apply compost tea as foliar spray'
            ],
            chemicalTreatment: [
                'Consult local agricultural extension for specific chemical recommendations',
                'Use broad-spectrum fungicide as per label instructions'
            ],
            fertilizerRecommendation: 'Apply balanced NPK fertilizer (10-10-10) at recommended doses.',
            preventionTips: [
                'Rotate crops every season',
                'Use disease-free certified seeds',
                'Maintain proper plant spacing for airflow',
                'Avoid overhead irrigation'
            ],
            recoveryTimeline: '7–14 days with timely treatment.',
            severity: _mapSeverity(confidence),
            immediate: 'Remove heavily infected leaves and avoid overhead irrigation.',
            advisoryMarkdown: '',
            generatedAt: new Date().toISOString(),
            source: 'fallback',
            cacheKey: makeCacheKey(crop, disease)
        };
    }

    /**
     * Clear advisory cache - specific entry or all
     * @param {string} [crop] - Crop name
     * @param {string} [disease] - Disease name
     */
    function clearAdvisoryCache(crop, disease) {
        if (crop && disease) {
            const key = makeCacheKey(crop, disease);
            memoryCache.delete(key);
            try { localStorage.removeItem(key); } catch { }
            console.log('[GeminiAdvisory] 🗑️ Cleared cache for:', key);
        } else {
            // Clear all advisory caches
            memoryCache.clear();
            try {
                const keys = Object.keys(localStorage);
                keys.forEach(key => {
                    if (key.startsWith('agrishield_advisory_')) {
                        localStorage.removeItem(key);
                    }
                });
            } catch { }
            console.log('[GeminiAdvisory] 🗑️ Cleared all advisory caches');
        }
    }

    /**
     * Get cache statistics
     */
    function getCacheStats() {
        let localStorageCount = 0;
        try {
            const keys = Object.keys(localStorage);
            localStorageCount = keys.filter(k => k.startsWith('agrishield_advisory_')).length;
        } catch { }

        return {
            memoryEntries: memoryCache.size,
            localStorageEntries: localStorageCount,
            pendingRequests: pendingRequests.size
        };
    }

    // ── Expose to global scope ────────────────────────────────────────
    window.GeminiAdvisory = {
        getAdvisory,
        clearAdvisoryCache,
        getCacheStats,
        makeCacheKey
    };

    console.log('[GeminiAdvisory] 🌾 Advisory Service with Smart Caching loaded');
})();
