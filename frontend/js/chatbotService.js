/* ═══════════════════════════════════════════════════════════════════
   AgriShield AI — Chatbot Service (OpenAI + Puter.js + Gemini)
   Context-aware, multi-language chatbot with agriculture-only scope
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ── Config ────────────────────────────────────────────────────────
    const AI_BASE = 'http://127.0.0.1:4000/ai';

    // ── Conversation History (in-memory) ──────────────────────────────
    const conversationHistory = [];
    const MAX_HISTORY = 10;

    /**
     * Non-agriculture topic detection
     * Returns true if the message is NOT about agriculture
     */
    function isNonAgricultural(message) {
        const nonAgriPatterns = [
            /\b(movie|film|cinema|music|song|sing|dance|game|video\s*game|play\s*game)\b/i,
            /\b(politics|election|vote|president|prime\s*minister)\b/i,
            /\b(stock\s*market|bitcoin|crypto|forex|trading)\b/i,
            /\b(recipe|cooking\s*recipe|how\s*to\s*cook)\b/i,
            /\b(celebrity|actress|actor|sports|football|cricket\s*match)\b/i,
            /\b(joke|funny|meme|entertainment)\b/i,
            /\b(homework|math\s*problem|physics|chemistry\s*equation)\b/i,
            /\b(programming|javascript|python|coding|software|app\s*development)\b/i
        ];

        // Agriculture-related keywords that override
        const agriKeywords = [
            /\b(crop|disease|plant|farm|seed|soil|fertilizer|pesticide|harvest|irrigation)\b/i,
            /\b(wheat|rice|corn|tomato|potato|cotton|soybean|maize|millet|sugarcane)\b/i,
            /\b(fungicide|herbicide|insect|pest|weed|blight|rot|wilt|mold|mildew)\b/i,
            /\b(weather|rain|drought|flood|season|monsoon|humidity|temperature)\b/i,
            /\b(organic|compost|mulch|neem|manure|vermicompost)\b/i,
            /\b(insurance|premium|claim|indemnity)\b/i,
            /\b(yield|acre|hectare|plot|field|greenhouse|nursery)\b/i,
            /\b(cattle|livestock|poultry|dairy|goat|sheep|fish\s*farm|aquaculture)\b/i,
            /\b(market\s*price|mandi|apmc|agricultural\s*market)\b/i
        ];

        // If any agriculture keyword is present, it's agricultural
        if (agriKeywords.some(pattern => pattern.test(message))) return false;

        // If any non-agri pattern matches, it's non-agricultural
        if (nonAgriPatterns.some(pattern => pattern.test(message))) return true;

        // Default: allow it (could be a general question)
        return false;
    }

    function buildLanguageAwareMessage(userMessage, context, language) {
        const langName = language || 'English';
        const ctx = context || {};

        const lines = [];
        if (ctx.crop || ctx.disease || ctx.confidence || ctx.environment) {
            lines.push('CURRENT DETECTION SESSION:');
            if (ctx.crop) lines.push('- Crop: ' + ctx.crop);
            if (ctx.disease) lines.push('- Disease: ' + ctx.disease);
            if (ctx.confidence !== undefined) lines.push('- Confidence: ' + ctx.confidence + '%');
            if (ctx.environment) lines.push('- Environment: ' + ctx.environment);
            lines.push('');
        }

        const contextBlock = lines.join('\n');

        return (
            'You are AgriShield AI, an expert agricultural assistant for Indian farmers.\n\n' +
            (contextBlock || '') +
            '════════════════════════════════════════════\n' +
            'CRITICAL LANGUAGE INSTRUCTION — MUST FOLLOW\n' +
            '════════════════════════════════════════════\n' +
            'The user interface is currently set to: ' + langName + '\n' +
            'You MUST write your ENTIRE response in ' + langName + '.\n' +
            'Do NOT use any other language in your response.\n' +
            'Do NOT mix languages.\n' +
            'Your response MUST be written in ' + langName + ' script.\n' +
            'Example: If language is Telugu (తెలుగు), write completely in Telugu script.\n' +
            'Example: If language is Hindi (हिंदी), write completely in Devanagari script.\n\n' +
            'AGRICULTURE RULES:\n' +
            '1. Only answer farming, crop disease, weather, fertilizer, pest control, soil, and agricultural insurance questions.\n' +
            '2. If question is NOT agriculture-related, politely say so IN ' + langName + '.\n' +
            '3. Keep responses to 3–5 sentences maximum.\n' +
            '4. Use simple language that village farmers understand.\n' +
            '5. Be warm, encouraging, and supportive.\n' +
            '6. Give specific actionable advice.\n\n' +
            'RESPONSE FORMAT:\n' +
            '- Plain text only\n' +
            '- No markdown, no asterisks, no bullet points, no headers\n' +
            '- No code blocks\n' +
            '- Write as natural spoken language\n' +
            '- Maximum ~400 characters\n\n' +
            'Farmer question:\n' +
            userMessage
        );
    }

    /**
     * Send a chat message and get an AI response.
     * Uses Gemini server (primary) with Puter.js fallback.
     *
     * @param {string} userMessage - The user's message
     * @param {Object} [context] - Current detection context
     * @param {string} [context.crop] - Detected crop
     * @param {string} [context.disease] - Detected disease
     * @param {number} [context.confidence] - Detection confidence
     * @param {Object} [context.advisory] - Current advisory data
     * @param {string} [language='English'] - Response language
     * @returns {Promise<string>} AI response text
     */
    async function sendChatMessage(userMessage, context, language) {
        context = context || {};
        language = language || 'English';

        // ── Gate: Non-agriculture topics ────────────────────────────
        if (isNonAgricultural(userMessage)) {
            const rejectMsg = _getAgriOnlyMessage(language);
            conversationHistory.push(
                { role: 'user', content: userMessage },
                { role: 'assistant', content: rejectMsg }
            );
            _trimHistory();
            return rejectMsg;
        }

        // ── Try Gemini Server (primary) with strict language prompt ─
        try {
            const messageWithInstructions = buildLanguageAwareMessage(userMessage, context, language);

            const payload = {
                message: messageWithInstructions,
                context: context.crop ? {
                    plant: context.crop,
                    disease: context.disease || 'Unknown',
                    confidence: context.confidence || 'N/A',
                    environment: context.environment || 'Not specified'
                } : undefined,
                language: language
            };

            const res = await fetch(AI_BASE + '/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Chat server returned ' + res.status);

            const data = await res.json();
            const response = (data.response || '').trim();

            if (response) {
                conversationHistory.push(
                    { role: 'user', content: userMessage },
                    { role: 'assistant', content: response }
                );
                _trimHistory();
                console.log('[ChatService] ✅ Gemini server response received');
                return response;
            }

            throw new Error('Empty response from server');

        } catch (serverErr) {
            console.warn('[ChatService] Server call failed, trying Puter.js:', serverErr.message);
        }

        // ── Fallback: Puter.js ──────────────────────────────────────
        if (window.AgriShieldAI && typeof window.AgriShieldAI.chatWithPuter === 'function') {
            try {
                const langCode = window.AgriShield?.selectedLanguage || 'en';
                const response = await window.AgriShieldAI.chatWithPuter(userMessage, context, langCode);

                if (response && response.trim()) {
                    conversationHistory.push(
                        { role: 'user', content: userMessage },
                        { role: 'assistant', content: response }
                    );
                    _trimHistory();
                    console.log('[ChatService] ✅ Puter.js response received');
                    return response;
                }
            } catch (puterErr) {
                console.error('[ChatService] Puter.js fallback failed:', puterErr.message);
            }
        }

        // ── Ultimate fallback ───────────────────────────────────────
        return "I'm sorry, I'm having trouble connecting to the AI service right now. Please try again in a moment.";
    }

    /**
     * Get language-appropriate agriculture-only message
     */
    function _getAgriOnlyMessage(language) {
        const messages = {
            'English': "I'm AgriShield AI, your agricultural assistant. I can only help with farming, crop diseases, weather, fertilizers, and agriculture-related topics. Please ask me something about your crops! 🌾",
            'Hindi': "मैं AgriShield AI हूँ, आपका कृषि सहायक। मैं केवल खेती, फसल रोग, मौसम, उर्वरक और कृषि से जुड़े विषयों में मदद कर सकता हूँ। कृपया अपनी फसल के बारे में पूछें! 🌾",
            'Telugu': "నేను AgriShield AI, మీ వ్యవసాయ సహాయకుడు. నేను వ్యవసాయం, పంట వ్యాధులు, వాతావరణం, ఎరువులు మరియు వ్యవసాయ సంబంధిత అంశాలలో మాత్రమే సహాయం చేయగలను. దయచేసి మీ పంటల గురించి అడగండి! 🌾",
            'Tamil': "நான் AgriShield AI, உங்கள் விவசாய உதவியாளர். நான் விவசாயம், பயிர் நோய்கள், வானிலை, உரங்கள் மற்றும் விவசாயம் சார்ந்த தலைப்புகளில் மட்டுமே உதவ முடியும். தயவுசெய்து உங்கள் பயிர்கள் பற்றி கேளுங்கள்! 🌾",
            'Kannada': "ನಾನು AgriShield AI, ನಿಮ್ಮ ಕೃಷಿ ಸಹಾಯಕ. ನಾನು ಕೃಷಿ, ಬೆಳೆ ರೋಗಗಳು, ಹವಾಮಾನ, ರಸಗೊಬ್ಬರಗಳು ಮತ್ತು ಕೃಷಿ ಸಂಬಂಧಿತ ವಿಷಯಗಳಲ್ಲಿ ಮಾತ್ರ ಸಹಾಯ ಮಾಡಬಲ್ಲೆ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಬೆಳೆಗಳ ಬಗ್ಗೆ ಕೇಳಿ! 🌾",
            'Marathi': "मी AgriShield AI आहे, तुमचा कृषी सहाय्यक. मी फक्त शेती, पिकांचे रोग, हवामान, खते आणि कृषी-संबंधित विषयांमध्ये मदत करू शकतो. कृपया तुमच्या पिकांबद्दल विचारा! 🌾"
        };
        return messages[language] || messages['English'];
    }

    /**
     * Trim conversation history to prevent memory bloat
     */
    function _trimHistory() {
        while (conversationHistory.length > MAX_HISTORY * 2) {
            conversationHistory.splice(0, 2);
        }
    }

    /**
     * Clear conversation history
     */
    function clearChatHistory() {
        conversationHistory.length = 0;
        console.log('[ChatService] 🗑️ Chat history cleared');
    }

    /**
     * Get current conversation history
     */
    function getChatHistory() {
        return [...conversationHistory];
    }

    // ── Expose to global scope ────────────────────────────────────────
    window.ChatbotService = {
        sendChatMessage,
        clearChatHistory,
        getChatHistory,
        isNonAgricultural
    };

    console.log('[ChatbotService] 💬 Chatbot Service loaded');
})();
