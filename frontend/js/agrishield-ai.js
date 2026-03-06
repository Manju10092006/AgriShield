/* ═══════════════════════════════════════════════════════════════════
   AgriShield AI — Puter.js Integration Layer v2.0
   Provides: AI Advisory, Chatbot, Vision Fallback, Voice, Forecasting
   Engine: Puter.js (free, unlimited OpenAI access — no API key needed)
   Fallback: Gemini Vision via ai-server (only when Puter vision fails)
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ── Global State ────────────────────────────────────────────────
    window.AgriShield = window.AgriShield || {
        selectedLanguage: 'en',
        selectedLanguageName: 'English',
        detectedDisease: null,
        detectedCrop: null,
        detectedConfidence: 0,
        detectionSource: null,
        currentLocation: null,
        weatherData: null,
        conversationHistory: [],
        voiceModeActive: false,
        currentRecognition: null,
        isSpeaking: false,
        currentAudio: null,
        lastAdvisoryData: null,
        puterReady: false
    };

    const LANGUAGE_MAP = {
        'en': 'English', 'hi': 'हिंदी', 'te': 'తెలుగు', 'ta': 'தமிழ்',
        'kn': 'ಕನ್ನಡ', 'ml': 'മലയാളം', 'mr': 'मराठी', 'gu': 'ગુજરાતી',
        'pa': 'ਪੰਜਾਬੀ', 'bn': 'বাংলা', 'or': 'ଓଡ଼ିଆ', 'ur': 'اردو',
        'es': 'Spanish', 'fr': 'French', 'de': 'German',
        'ja': 'Japanese', 'zh': 'Chinese', 'ar': 'Arabic'
    };

    const LANGUAGE_LOCALE_MAP = {
        'en': 'en-IN', 'hi': 'hi-IN', 'te': 'te-IN', 'ta': 'ta-IN',
        'kn': 'kn-IN', 'ml': 'ml-IN', 'mr': 'mr-IN', 'gu': 'gu-IN',
        'pa': 'pa-IN', 'bn': 'bn-IN', 'or': 'or-IN', 'ur': 'ur-IN',
        'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE',
        'ja': 'ja-JP', 'zh': 'zh-CN', 'ar': 'ar-SA'
    };

    // ── Puter.js Silent Initialization ──────────────────────────────
    let _puterInitPromise = null;

    async function initPuter() {
        if (window.AgriShield.puterReady) return true;
        if (_puterInitPromise) return _puterInitPromise;

        _puterInitPromise = new Promise((resolve) => {
            const tryInit = () => {
                if (window.puter && puter.auth) {
                    try {
                        puter.auth.signIn({ silent: true })
                            .then(() => { window.AgriShield.puterReady = true; resolve(true); })
                            .catch(() => { window.AgriShield.puterReady = true; resolve(true); });
                    } catch {
                        window.AgriShield.puterReady = true;
                        resolve(true);
                    }
                } else {
                    const checkPuter = setInterval(() => {
                        if (window.puter) {
                            clearInterval(checkPuter);
                            try {
                                puter.auth.signIn({ silent: true })
                                    .then(() => { window.AgriShield.puterReady = true; resolve(true); })
                                    .catch(() => { window.AgriShield.puterReady = true; resolve(true); });
                            } catch {
                                window.AgriShield.puterReady = true;
                                resolve(true);
                            }
                        }
                    }, 200);
                    setTimeout(() => { clearInterval(checkPuter); window.AgriShield.puterReady = true; resolve(true); }, 5000);
                }
            };
            tryInit();
        });

        return _puterInitPromise;
    }

    // ── Helper: Extract AI text response safely (universal) ─────────
    function extractAIText(response) {
        if (!response) return '';
        // 1) Plain string
        if (typeof response === 'string') return response;
        // 2) { message: { content } }
        if (response?.message?.content) return response.message.content;
        // 3) { text }
        if (response?.text) return response.text;
        // 4) { content: [...] }
        if (Array.isArray(response?.content)) {
            return response.content.map(b => b?.text || '').join('');
        }
        // 5) OpenAI-style choices
        if (response?.choices?.[0]?.message?.content) {
            return response.choices[0].message.content;
        }
        // 6) Nested message.text
        if (response?.message?.text) return response.message.text;
        // 7) Fallback: try to stringify and pull "content"
        try {
            const str = JSON.stringify(response);
            const match = str.match(/"content"\s*:\s*"([\s\S]*?)(?<!\\)"/);
            if (match) {
                return match[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"');
            }
        } catch {
            // ignore
        }
        return '';
    }

    // ── Helper: Extract JSON from AI text (handles ```json fences) ──
    function extractJSON(rawText) {
        if (!rawText) return null;
        // Strip markdown fences if present
        let cleaned = rawText
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/gi, '')
            .trim();
        // Try direct parse
        try {
            return JSON.parse(cleaned);
        } catch {
            // fall through
        }
        // Find first { ... } block
        const objMatch = cleaned.match(/\{[\s\S]*\}/);
        if (objMatch) {
            try {
                return JSON.parse(objMatch[0]);
            } catch {
                // ignore
            }
        }
        // Or first [ ... ] block
        const arrMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrMatch) {
            try {
                return JSON.parse(arrMatch[0]);
            } catch {
                // ignore
            }
        }
        return null;
    }

    // ══════════════════════════════════════════════════════════════════
    //  VISION AI: Analyze image when ML confidence is low
    // ══════════════════════════════════════════════════════════════════

    async function analyzeImageWithVisionAI(imageDataUrl) {
        const lang = window.AgriShield.selectedLanguage || 'en';
        const langName = LANGUAGE_MAP[lang] || 'English';

        const prompt = `You are an expert plant pathologist and agronomist. Analyze this crop leaf image carefully.

Respond ONLY in ${langName} language.

Identify:
1. The exact crop plant (e.g., Tomato, Rice, Wheat, Cotton, Pigeon Pea, etc.)
2. The exact disease or condition (be specific with scientific/common name)
3. Your confidence level as a percentage

Respond in this exact JSON format only, no extra text:
{
  "crop": "crop name in English",
  "disease": "disease name in English",
  "confidence_percent": 75,
  "description": "brief description in ${langName}"
}`;

        // Try Puter.js first
        try {
            await initPuter();
            const response = await puter.ai.chat(
                [{
                    role: 'user', content: [
                        { type: 'image_url', image_url: { url: imageDataUrl } },
                        { type: 'text', text: prompt }
                    ]
                }],
                { model: 'gpt-4o' }
            );
            const rawText = extractAIText(response);
            const parsed = extractJSON(rawText);
            if (parsed && parsed.crop) {
                console.log('[AgriShield] ✅ Puter.js vision analysis successful');
                return {
                    disease: parsed.disease || 'Unknown Disease',
                    crop: parsed.crop || 'Unknown Crop',
                    confidence: (parsed.confidence_percent || 60) / 100,
                    source: 'vision_puter',
                    description: parsed.description || ''
                };
            }
        } catch (err) {
            console.warn('[AgriShield] Puter vision failed:', err.message);
        }

        // Fallback: Return a result suggesting retry
        console.warn('[AgriShield] Vision AI could not analyze image');
        return {
            disease: 'Unable to detect — please upload a clearer image',
            crop: 'Unknown',
            confidence: 0,
            source: 'failed',
            description: ''
        };
    }

    // ══════════════════════════════════════════════════════════════════
    //  AI ADVISORY ENGINE — Full advisory generation via Puter.js
    // ══════════════════════════════════════════════════════════════════

    async function generatePuterAdvisory(disease, crop, confidence, language) {
        const langName = LANGUAGE_MAP[language] || 'English';
        const confidencePct = typeof confidence === 'number' ? (confidence * 100).toFixed(0) : confidence;

        const systemPrompt = `You are Dr. AgriShield, an expert agronomist and plant pathologist with 30 years of experience in Indian agriculture. You MUST respond ENTIRELY in ${langName} language. Every word of your response must be in ${langName}. Do not mix languages.`;

        const userPrompt = `A farmer has uploaded a crop image. Detection results:
- Crop: ${crop}
- Disease/Condition: ${disease}
- Confidence: ${confidencePct}%

Provide a COMPLETE agricultural advisory report with these exact sections:

1. DISEASE_EXPLANATION: What is this disease? How does it spread? (3-4 sentences)
2. IMMEDIATE_ACTION: What must the farmer do RIGHT NOW in the next 24-48 hours? (3 specific steps)
3. ORGANIC_REMEDY: Natural/organic treatment methods available in Indian villages (3 methods with dosage)
4. CHEMICAL_TREATMENT: Recommended pesticides/fungicides with brand names, dosage, frequency (3 options)
5. PREVENTION: How to prevent this disease in future crops (4 preventive measures)
6. RECOVERY_TIMELINE: How many days/weeks for recovery if treatment starts now?
7. FERTILIZER_SUGGESTIONS: Specific NPK or micronutrient recommendations for affected ${crop} crop (3 recommendations)
8. RISK_LEVEL: Current risk level (Low/Moderate/High/Critical) and why

Format your response as valid JSON only:
{
  "advisory_markdown": "Full advisory with markdown headings and bullet points in ${langName}",
  "disease_explanation": "...",
  "immediate": "3 specific steps combined in one text in ${langName}",
  "organic": "Organic remedy in ${langName}",
  "chemical": "Chemical treatment in ${langName}",
  "prevention": "Prevention steps in ${langName}",
  "recovery": "Recovery time estimate in ${langName}",
  "fertilizer": "Fertilizer recommendation in ${langName}",
  "risk_level": "High",
  "risk_explanation": "Why this risk level in ${langName}"
}`;

        try {
            await initPuter();
            const response = await puter.ai.chat(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                { model: 'gpt-4o' }
            );

            const rawText = extractAIText(response);
            const parsed = extractJSON(rawText);
            if (parsed) {
                console.log('[AgriShield] ✅ Puter.js advisory generated successfully');
                window.AgriShield.lastAdvisoryData = parsed;
                return parsed;
            }

            // If JSON parse fails, return the raw text as advisory_markdown
            console.warn('[AgriShield] Advisory JSON parse failed, using raw text');
            return {
                advisory_markdown: rawText || 'Advisory could not be generated.',
                immediate: '', organic: '', chemical: '',
                prevention: '', recovery: '', fertilizer: ''
            };
        } catch (err) {
            console.error('[AgriShield] Advisory generation failed:', err);
            throw err;
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  AI CHATBOT — Context-aware, multi-language via Puter.js
    // ══════════════════════════════════════════════════════════════════

    async function chatWithPuter(message, context, language) {
        const langName = LANGUAGE_MAP[language] || 'English';
        const disease = window.AgriShield.detectedDisease;
        const crop = window.AgriShield.detectedCrop;
        const conf = window.AgriShield.detectedConfidence;

        const systemMessage = `You are AgriBot, an expert AI agricultural assistant specialized in Indian farming. 

CRITICAL RULES:
1. ALWAYS respond ONLY in ${langName} language — every single word
2. Never mix languages
3. You are context-aware of the farmer's current situation

Current farmer context:
${disease ? `- Detected disease: ${disease}` : '- No disease detected yet'}
${crop ? `- Crop type: ${crop}` : ''}
${conf ? `- Detection confidence: ${(conf * 100).toFixed(0)}%` : ''}
${context?.environment ? `- Environment: ${context.environment}` : ''}

Be warm, empathetic, and practical. Use simple language farmers can understand.
Keep answers concise, practical, and under 150 words.`;

        window.AgriShield.conversationHistory.push({ role: 'user', content: message });
        if (window.AgriShield.conversationHistory.length > 20) {
            window.AgriShield.conversationHistory = window.AgriShield.conversationHistory.slice(-10);
        }

        try {
            await initPuter();
            const messages = [
                { role: 'system', content: systemMessage },
                ...window.AgriShield.conversationHistory
            ];

            const response = await puter.ai.chat(messages, { model: 'gpt-4o' });
            const text = extractAIText(response);
            window.AgriShield.conversationHistory.push({ role: 'assistant', content: text });

            console.log('[AgriShield] ✅ Puter.js chat response received');
            return text;
        } catch (err) {
            console.error('[AgriShield] Chat error:', err);
            throw err;
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  7-DAY CROP RISK FORECAST via Puter.js
    // ══════════════════════════════════════════════════════════════════

    async function generateRiskForecastAI(weatherData, crop, language) {
        const langName = LANGUAGE_MAP[language] || 'English';

        const weatherSummary = (weatherData || []).map((d, i) =>
            `Day ${i + 1}: Temp=${d.temp}°C, Humidity=${d.humidity}%, Rainfall=${d.rainfall}mm, Wind=${d.windSpeed}km/h`
        ).join('\n');

        const prompt = `You are an agricultural risk analyst.
IMPORTANT: Respond ONLY in ${langName}.

Crop: ${crop || 'General crops'}

Weather forecast for next 7 days:
${weatherSummary}

Risk analysis rules:
- High humidity (>70%) + moderate temperature (20-30°C) → fungal disease risk
- Heavy rainfall (>15mm/day) → leaf disease risk
- Hot (>35°C) + dry (humidity <30%) → pest risk
- Strong winds (>30km/h) → physical damage risk

Return ONLY valid JSON:
{
  "forecast": [
    {"day": 1, "risk": "Low", "score": 0.2, "threats": ["threat1"]},
    ...for all 7 days
  ],
  "summary": "2-3 sentence overall risk summary in ${langName}",
  "recommendation": "Specific action in ${langName}"
}`;

        try {
            await initPuter();
            const response = await puter.ai.chat(prompt, { model: 'gpt-4o' });
            const rawText = extractAIText(response);
            const parsed = extractJSON(rawText);
            if (parsed) {
                console.log('[AgriShield] ✅ Puter.js risk forecast generated');
                return parsed;
            }
        } catch (err) {
            console.error('[AgriShield] Risk forecast AI failed:', err);
        }
        return null;
    }

    // ══════════════════════════════════════════════════════════════════
    //  RAINFALL INTELLIGENCE via Puter.js
    // ══════════════════════════════════════════════════════════════════

    async function generateRainfallAI(currentRainfall, historicalAverage, region, language) {
        const langName = LANGUAGE_MAP[language] || 'English';
        const anomaly = historicalAverage ? (((currentRainfall - historicalAverage) / historicalAverage) * 100).toFixed(1) : 0;

        const prompt = `You are an agricultural meteorologist.
IMPORTANT: Respond ONLY in ${langName}.

Region: ${region || 'General'}
Current rainfall: ${currentRainfall || 0}mm
Historical average: ${historicalAverage || 0}mm
Anomaly: ${anomaly > 0 ? '+' : ''}${anomaly}%

Analyze rainfall data and provide:
1. Risk assessment
2. Impact on crops
3. Recommended actions

Return ONLY valid JSON:
{
  "anomaly_percent": ${anomaly},
  "anomaly_status": "above_average or below_average or normal",
  "risk_level": "Low or Moderate or High or Critical",
  "advisory": "2-3 sentences of specific advice in ${langName}",
  "crop_impact": "How rainfall pattern affects crops in ${langName}",
  "action_items": ["action1", "action2", "action3"]
}`;

        try {
            await initPuter();
            const response = await puter.ai.chat(prompt, { model: 'gpt-4o' });
            const rawText = extractAIText(response);
            const parsed = extractJSON(rawText);
            if (parsed) {
                console.log('[AgriShield] ✅ Puter.js rainfall intelligence generated');
                return parsed;
            }
        } catch (err) {
            console.error('[AgriShield] Rainfall AI failed:', err);
        }
        return null;
    }

    // ══════════════════════════════════════════════════════════════════
    //  SMART FERTILIZER PLAN via Puter.js
    // ══════════════════════════════════════════════════════════════════

    async function generateFertilizerAI(plant, disease, confidence, soilType, language) {
        const langName = LANGUAGE_MAP[language] || 'English';

        const prompt = `You are an expert agricultural soil scientist and fertilizer advisor.
IMPORTANT: Respond ONLY in ${langName}.

Crop: ${plant || 'Unknown crop'}
Detected Disease: ${disease || 'None'}
Confidence: ${confidence || 'N/A'}
Soil Type: ${soilType || 'Loamy'}

Provide detailed fertilizer recommendations considering the detected disease.

Return ONLY valid JSON:
{
  "fertilizer_name": "Specific fertilizer name",
  "npk_ratio": "e.g. 19-19-19",
  "application_method": "How to apply",
  "frequency": "How often to apply",
  "dosage": "Specific dosage per acre or per liter",
  "disease_recovery_help": "How this fertilizer helps recovery from the disease in ${langName}",
  "organic_alternative": "Organic option in ${langName}",
  "caution": "Any warnings in ${langName}"
}`;

        try {
            await initPuter();
            const response = await puter.ai.chat(prompt, { model: 'gpt-4o' });
            const rawText = extractAIText(response);
            const parsed = extractJSON(rawText);
            if (parsed) {
                console.log('[AgriShield] ✅ Puter.js fertilizer plan generated');
                return parsed;
            }
        } catch (err) {
            console.error('[AgriShield] Fertilizer AI failed:', err);
        }
        return null;
    }

    // ══════════════════════════════════════════════════════════════════
    //  VOICE: Text-to-Speech via Puter.js + Browser fallback
    // ══════════════════════════════════════════════════════════════════

    async function speakWithPuter(text, langCode) {
        if (!text || !text.trim()) return;
        const cleanText = text.replace(/[#*_~`]/g, '').replace(/\{[\s\S]*?\}/g, '').replace(/https?:\/\/\S+/g, '').trim().substring(0, 3000);
        if (!cleanText) return;

        // Try Puter.js TTS first
        try {
            await initPuter();
            if (puter.ai && puter.ai.txt2speech) {
                const audioEl = await puter.ai.txt2speech(cleanText, { provider: 'openai' });
                audioEl.addEventListener('ended', () => { window.AgriShield.isSpeaking = false; });
                audioEl.addEventListener('error', () => {
                    window.AgriShield.isSpeaking = false;
                    fallbackBrowserTTS(cleanText, langCode);
                });
                window.AgriShield.isSpeaking = true;
                window.AgriShield.currentAudio = audioEl;
                await audioEl.play();
                console.log('[AgriShield] ✅ Puter.js TTS playing');
                return;
            }
        } catch (err) {
            console.warn('[AgriShield] Puter TTS failed, using browser TTS:', err.message);
        }

        // Browser TTS fallback
        fallbackBrowserTTS(cleanText, langCode);
    }

    function fallbackBrowserTTS(text, langCode) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = LANGUAGE_LOCALE_MAP[langCode] || 'en-IN';
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const langPrefix = (LANGUAGE_LOCALE_MAP[langCode] || 'en-IN').split('-')[0];
        const matchedVoice = voices.find(v => v.lang.startsWith(langPrefix)) || voices.find(v => v.lang.startsWith('en'));
        if (matchedVoice) utterance.voice = matchedVoice;
        utterance.onend = () => { window.AgriShield.isSpeaking = false; };
        utterance.onerror = () => { window.AgriShield.isSpeaking = false; };
        window.AgriShield.isSpeaking = true;
        window.speechSynthesis.speak(utterance);
    }

    function stopSpeaking() {
        if (window.AgriShield.currentAudio) {
            window.AgriShield.currentAudio.pause();
            window.AgriShield.currentAudio = null;
        }
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        window.AgriShield.isSpeaking = false;
    }

    // ══════════════════════════════════════════════════════════════════
    //  EXPOSE TO GLOBAL SCOPE — so main.js can call these functions
    // ══════════════════════════════════════════════════════════════════

    window.AgriShieldAI = {
        initPuter,
        analyzeImageWithVisionAI,
        generatePuterAdvisory,
        chatWithPuter,
        generateRiskForecastAI,
        generateRainfallAI,
        generateFertilizerAI,
        speakWithPuter,
        stopSpeaking,
        extractAIText,
        extractJSON,
        LANGUAGE_MAP,
        LANGUAGE_LOCALE_MAP
    };

    // ── Auto-init Puter.js on page load ─────────────────────────────
    window.addEventListener('load', async () => {
        try {
            await initPuter();
            console.log('[AgriShield] ✅ Puter.js initialized silently');
        } catch {
            console.log('[AgriShield] ⚠️ Puter.js init deferred — will retry on first AI call');
        }
    });

    console.log('[AgriShield] 🌾 AI Integration Layer v2.0 loaded');
})();
