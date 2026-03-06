/* ═══════════════════════════════════════════════════════════════════
   AgriShield AI — Translation Engine (i18n)
   Self-expanding multilingual system with intelligent fallbacks
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ── Format a missing translation key into readable text ──────────
    // "cropDetection" → "Crop Detection"
    // "ai_crop_advisory" → "Ai Crop Advisory"
    function formatMissingKey(key) {
        return key
            .replace(/([A-Z])/g, ' $1')             // camelCase → spaced
            .replace(/_/g, ' ')                       // snake_case → spaced
            .replace(/\./g, ' ')                      // dotted.keys → spaced
            .trim()
            .replace(/\b\w/g, function (c) { return c.toUpperCase(); }); // Title Case
    }

    // ── Core translate function ─────────────────────────────────────
    // t('key') → translated string in current language
    // t('key', { name: 'Mia' }) → interpolation: "Hello {{name}}" → "Hello Mia"
    function t(key, params) {
        var translations = window.AGRI_TRANSLATIONS || {};
        var lang = window.AgriShield_currentLang || 'en';

        // Try current language first
        var langData = translations[lang] || {};
        var value = langData[key];

        // Fallback to English
        if (value === undefined || value === null) {
            var enData = translations.en || {};
            value = enData[key];
        }

        // If still missing, format the key itself into readable text
        if (value === undefined || value === null) {
            value = formatMissingKey(key);
            // Log missing key for development (only once per key)
            if (!t._warned) t._warned = {};
            if (!t._warned[lang + ':' + key]) {
                console.warn('[i18n] Missing key "' + key + '" for language "' + lang + '"');
                t._warned[lang + ':' + key] = true;
            }
        }

        // Interpolation: replace {{variable}} with params
        if (params && typeof value === 'string') {
            Object.keys(params).forEach(function (paramKey) {
                value = value.replace(new RegExp('\\{\\{' + paramKey + '\\}\\}', 'g'), params[paramKey]);
            });
        }

        return value;
    }

    // ── Batch translate: apply translations to all data-i18n elements ──
    function applyTranslations(root) {
        root = root || document;

        // Text content
        var elements = root.querySelectorAll('[data-i18n]');
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var key = el.getAttribute('data-i18n');
            if (key) el.textContent = t(key);
        }

        // Placeholders
        var phElements = root.querySelectorAll('[data-i18n-placeholder]');
        for (var j = 0; j < phElements.length; j++) {
            var phEl = phElements[j];
            var phKey = phEl.getAttribute('data-i18n-placeholder');
            if (phKey) phEl.placeholder = t(phKey);
        }

        // Titles/tooltips
        var titleElements = root.querySelectorAll('[data-i18n-title]');
        for (var k = 0; k < titleElements.length; k++) {
            var tEl = titleElements[k];
            var tKey = tEl.getAttribute('data-i18n-title');
            if (tKey) tEl.title = t(tKey);
        }

        // aria-label
        var ariaElements = root.querySelectorAll('[data-i18n-aria]');
        for (var l = 0; l < ariaElements.length; l++) {
            var aEl = ariaElements[l];
            var aKey = aEl.getAttribute('data-i18n-aria');
            if (aKey) aEl.setAttribute('aria-label', t(aKey));
        }
    }

    // ── Change language and update UI ─────────────────────────────
    function changeLanguage(langCode) {
        var LANGUAGE_CONFIG = {
            en: true, hi: true, te: true, ta: true, kn: true, ml: true, mr: true,
            gu: true, pa: true, bn: true, or: true, ur: true,
            es: true, fr: true, de: true, ja: true, zh: true, ar: true
        };

        if (!LANGUAGE_CONFIG[langCode]) {
            console.warn('[i18n] Unsupported language:', langCode);
            return;
        }

        window.AgriShield_currentLang = langCode;

        try {
            localStorage.setItem('agrishield_lang', langCode);
            localStorage.setItem('lang', langCode);
        } catch (e) { /* ignore */ }

        // Update global state
        if (window.AgriShield) {
            window.AgriShield.selectedLanguage = langCode;
        }

        // Apply translations to entire page
        applyTranslations();

        // Dispatch event for other scripts to listen
        document.dispatchEvent(new CustomEvent('languageChanged', {
            detail: { language: langCode }
        }));
    }

    // ── Initialize: read saved language ──────────────────────────
    var savedLang = 'en';
    try {
        savedLang = localStorage.getItem('agrishield_lang') ||
            localStorage.getItem('lang') || 'en';
    } catch (e) { /* ignore */ }
    window.AgriShield_currentLang = savedLang;

    // ── Expose globally ───────────────────────────────────────────
    window.i18n = {
        t: t,
        changeLanguage: changeLanguage,
        applyTranslations: applyTranslations,
        formatMissingKey: formatMissingKey,
        getCurrentLanguage: function () { return window.AgriShield_currentLang || 'en'; }
    };

    // Also expose t() at top level for convenience
    window.t = t;

    console.log('[i18n] 🌐 Translation engine loaded, language:', savedLang);
})();
