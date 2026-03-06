/* ═══════════════════════════════════════════════════════════════════
   AgriShield AI — Voice Assistant Pipeline
   Complete pipeline: voice → speech recognition → AI → speech synthesis
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ── Language Code Mapping ─────────────────────────────────────────
    const VOICE_LOCALE_MAP = {
        en: 'en-IN', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN',
        kn: 'kn-IN', ml: 'ml-IN', mr: 'mr-IN', gu: 'gu-IN',
        pa: 'pa-IN', bn: 'bn-IN', or: 'or-IN', ur: 'ur-PK',
        es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
        ja: 'ja-JP', zh: 'zh-CN', ar: 'ar-SA'
    };

    /**
     * Create a Voice Assistant instance
     * Manages the full pipeline: mic → recognition → chatbot → TTS
     *
     * @param {Object} options
     * @param {string} [options.language='en'] - Language code
     * @param {Object} [options.context] - Detection context {crop, disease, confidence}
     * @param {Function} [options.onTranscript] - Called with recognized text
     * @param {Function} [options.onResponse] - Called with AI response text
     * @param {Function} [options.onError] - Called with error message
     * @param {Function} [options.onStateChange] - Called with state updates
     * @returns {Object} Voice assistant controller
     */
    function createVoiceAssistant(options) {
        options = options || {};

        let isListening = false;
        let isSpeaking = false;
        let isProcessing = false;
        let currentRecognition = null;
        const chatHistory = [];

        function getLocale() {
            return VOICE_LOCALE_MAP[options.language || 'en'] || 'en-IN';
        }

        function notifyState() {
            if (options.onStateChange) {
                options.onStateChange({
                    isListening: isListening,
                    isSpeaking: isSpeaking,
                    isProcessing: isProcessing
                });
            }
        }

        /**
         * Speak text using the best available TTS engine
         */
        function speak(text) {
            if (!text || !text.trim()) return;

            // Try Puter.js TTS first (higher quality)
            if (window.AgriShieldAI && typeof window.AgriShieldAI.speakWithPuter === 'function') {
                try {
                    isSpeaking = true;
                    notifyState();
                    window.AgriShieldAI.speakWithPuter(text, options.language || 'en');
                    // Monitor speaking state via AgriShield global
                    const checkSpeaking = setInterval(() => {
                        if (!window.AgriShield || !window.AgriShield.isSpeaking) {
                            isSpeaking = false;
                            notifyState();
                            clearInterval(checkSpeaking);
                        }
                    }, 500);
                    setTimeout(() => clearInterval(checkSpeaking), 30000); // safety
                    return;
                } catch (e) {
                    console.warn('[VoiceAssistant] Puter TTS failed, using browser TTS:', e.message);
                }
            }

            // Browser TTS fallback
            if (!window.speechSynthesis) return;

            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = getLocale();
            utterance.rate = 0.9;
            utterance.pitch = 1.0;

            // Try to find a matching voice
            const voices = window.speechSynthesis.getVoices();
            const langPrefix = getLocale().split('-')[0];
            const matchedVoice = voices.find(v => v.lang.startsWith(langPrefix)) ||
                voices.find(v => v.lang.startsWith('en'));
            if (matchedVoice) utterance.voice = matchedVoice;

            utterance.onstart = () => {
                isSpeaking = true;
                notifyState();
            };
            utterance.onend = () => {
                isSpeaking = false;
                notifyState();
            };
            utterance.onerror = () => {
                isSpeaking = false;
                notifyState();
            };

            window.speechSynthesis.speak(utterance);
        }

        /**
         * Start listening for voice input
         */
        function startListening() {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

            if (!SR) {
                if (options.onError) {
                    options.onError('Speech recognition not supported in this browser.');
                }
                return;
            }

            // Stop any ongoing speech
            stopSpeaking();

            const recognition = new SR();
            recognition.lang = getLocale();
            recognition.continuous = false;
            recognition.interimResults = false;
            currentRecognition = recognition;

            recognition.onstart = () => {
                isListening = true;
                notifyState();
                console.log('[VoiceAssistant] 🎤 Listening...');
            };

            recognition.onend = () => {
                isListening = false;
                notifyState();
            };

            recognition.onresult = async (event) => {
                const spokenText = event.results[0][0].transcript;
                console.log('[VoiceAssistant] 📝 Transcript:', spokenText);

                if (options.onTranscript) {
                    options.onTranscript(spokenText);
                }

                isListening = false;
                isProcessing = true;
                notifyState();

                try {
                    // Use the ChatbotService if available
                    let response;
                    if (window.ChatbotService && typeof window.ChatbotService.sendChatMessage === 'function') {
                        const langConfig = {
                            en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil',
                            kn: 'Kannada', ml: 'Malayalam', mr: 'Marathi', gu: 'Gujarati',
                            pa: 'Punjabi', bn: 'Bengali', or: 'Odia', ur: 'Urdu'
                        };
                        response = await window.ChatbotService.sendChatMessage(
                            spokenText,
                            options.context || {},
                            langConfig[options.language || 'en'] || 'English'
                        );
                    } else {
                        // Direct Gemini fallback
                        const AI_BASE = 'http://127.0.0.1:4000/ai';
                        const res = await fetch(AI_BASE + '/chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                message: spokenText,
                                context: options.context,
                                language: 'English'
                            })
                        });
                        const data = await res.json();
                        response = data.response || "I'm sorry, I couldn't process that.";
                    }

                    chatHistory.push(
                        { role: 'user', content: spokenText },
                        { role: 'assistant', content: response }
                    );

                    if (options.onResponse) {
                        options.onResponse(response);
                    }

                    // Speak the response
                    speak(response);

                } catch (error) {
                    console.error('[VoiceAssistant] AI response failed:', error);
                    if (options.onError) {
                        options.onError('AI response failed. Please try again.');
                    }
                } finally {
                    isProcessing = false;
                    notifyState();
                }
            };

            recognition.onerror = (event) => {
                isListening = false;
                notifyState();
                console.error('[VoiceAssistant] Recognition error:', event.error);

                if (options.onError) {
                    if (event.error === 'not-allowed') {
                        options.onError('Microphone access denied. Please allow mic permissions.');
                    } else if (event.error === 'no-speech') {
                        options.onError('No speech detected. Please try again.');
                    } else {
                        options.onError('Speech recognition error: ' + event.error);
                    }
                }
            };

            recognition.start();
        }

        /**
         * Stop listening
         */
        function stopListening() {
            if (currentRecognition) {
                currentRecognition.stop();
                currentRecognition = null;
            }
            isListening = false;
            notifyState();
        }

        /**
         * Stop speaking
         */
        function stopSpeaking() {
            if (window.AgriShield && window.AgriShield.currentAudio) {
                window.AgriShield.currentAudio.pause();
                window.AgriShield.currentAudio = null;
            }
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            isSpeaking = false;
            notifyState();
        }

        /**
         * Stop everything
         */
        function stop() {
            stopListening();
            stopSpeaking();
        }

        /**
         * Update language
         */
        function setLanguage(langCode) {
            options.language = langCode;
            if (currentRecognition) {
                currentRecognition.lang = getLocale();
            }
        }

        /**
         * Update context
         */
        function setContext(newContext) {
            options.context = newContext;
        }

        /**
         * Get current state
         */
        function getState() {
            return {
                isListening: isListening,
                isSpeaking: isSpeaking,
                isProcessing: isProcessing,
                isSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition)
            };
        }

        return {
            startListening: startListening,
            stopListening: stopListening,
            stopSpeaking: stopSpeaking,
            stop: stop,
            speak: speak,
            setLanguage: setLanguage,
            setContext: setContext,
            getState: getState,
            getChatHistory: () => [...chatHistory]
        };
    }

    // ── Expose to global scope ────────────────────────────────────────
    window.VoiceAssistant = {
        create: createVoiceAssistant,
        isSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    };

    console.log('[VoiceAssistant] 🎤 Voice Assistant Pipeline loaded');
})();
