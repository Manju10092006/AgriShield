require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Gemini Initialization ────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'models/gemini-2.5-flash' });

// ─── OpenAI Initialization (for chatbot + TTS) ───────────────────
let openai = null;
const OPENAI_KEY = (process.env.OPENAI_API_KEY || '').trim();
if (OPENAI_KEY && OPENAI_KEY.length > 5) {
  const OpenAI = require('openai');
  openai = new OpenAI({ apiKey: OPENAI_KEY });
  console.log('[AI] OpenAI client initialized (chatbot + TTS ready)');
} else {
  console.warn('[AI] OPENAI_API_KEY not set — chatbot will use Gemini fallback, TTS disabled');
}

const app = express();
const PORT = process.env.AI_PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ─── Advisory Cache (prevents duplicate Gemini calls) ─────────────
const advisoryCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCacheKey(plant, disease, lang) {
  return `${plant}::${disease}::${lang}`.toLowerCase().replace(/\s+/g, '_');
}

// Helper to safely call Gemini and unwrap text
async function generateText(prompt) {
  try {
    const result = await model.generateContent(prompt);
    const text = result?.response?.text?.() ?? '';
    return text.trim();
  } catch (err) {
    console.error('[Gemini] generateText error:', err?.message || err);
    throw new Error('Gemini generation failed: ' + (err?.message || 'unknown'));
  }
}

// ─── Advisory Endpoint ────────────────────────────────────────────
// Body: { plant, disease, confidence, language }
app.post('/ai/advisory', async (req, res) => {
  const { plant, disease, confidence, language } = req.body || {};
  if (!plant || !disease || typeof confidence === 'undefined') {
    return res.status(400).json({ error: 'plant, disease, and confidence are required.' });
  }

  const langLabel = language || 'English';

  // ── Check cache first ──────────────────────────────────────────
  const cacheKey = getCacheKey(plant, disease, langLabel);
  const cached = advisoryCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log('[Advisory] Cache hit:', cacheKey);
    return res.json(cached.data);
  }

  const prompt = `
You are an expert agricultural scientist helping farmers.

IMPORTANT RULE:
You must respond ONLY in this language: ${langLabel}
Do not mix other languages. Every word in your response must be in ${langLabel}.

Crop: ${plant}
Detected Disease: ${disease}
Confidence: ${confidence}

Provide a structured response with these sections:
1. Disease explanation
2. Immediate treatment
3. Organic remedy
4. Chemical treatment
5. Prevention methods
6. Recovery timeline
7. Recommended fertilizer

Write simple and practical advice suitable for farmers.

Ensure the language strictly follows ${langLabel}.

Return ONLY valid JSON in the following format (no markdown, no extra keys):
{
  "advisory_markdown": "Full advisory with headings and bullet points in ${langLabel}.",
  "immediate": "One sentence describing immediate treatment steps in ${langLabel}.",
  "organic": "One sentence organic / low-cost remedy in ${langLabel}.",
  "chemical": "One sentence naming a generic chemical treatment in ${langLabel}.",
  "prevention": "3-4 short prevention steps in one paragraph in ${langLabel}.",
  "recovery": "Estimated recovery time text like 7-10 days in ${langLabel}.",
  "fertilizer": "One sentence fertilizer recommendation (with NPK if relevant) in ${langLabel}."
}
`.trim();

  try {
    const raw = await generateText(prompt);

    // Extract JSON block safely
    const match = raw.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : raw;

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (parseErr) {
      console.warn('[Advisory] JSON parse failed, falling back:', parseErr);
      data = {
        advisory_markdown: raw || 'AI advisory could not be parsed.',
        immediate: 'Remove heavily infected leaves and avoid overhead irrigation.',
        organic: 'Spray diluted neem oil (2–3 ml per liter of water) on affected foliage.',
        chemical: 'Use a broad-spectrum fungicide as per local agricultural guidelines.',
        prevention: 'Rotate crops, use disease-free seeds, maintain field hygiene, and ensure good air flow between plants.',
        recovery: '7–14 days with timely treatment.',
        fertilizer: 'Apply a balanced NPK fertilizer (e.g., 10-10-10) at recommended doses.'
      };
    }

    const responseData = {
      advisory_markdown: data.advisory_markdown || '',
      immediate: data.immediate || '',
      organic: data.organic || '',
      chemical: data.chemical || '',
      prevention: data.prevention || '',
      recovery: data.recovery || '',
      fertilizer: data.fertilizer || ''
    };

    // ── Store in cache ───────────────────────────────────────────
    advisoryCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    console.log('[Advisory] Cached:', cacheKey);

    return res.json(responseData);
  } catch (err) {
    console.error('[Advisory] error:', err);
    return res.status(500).json({
      error: 'AI advisory currently unavailable. Please try again later.'
    });
  }
});

// ─── Chatbot Endpoint ─────────────────────────────────────────────
// Body: { message, context, language }
// Uses OpenAI (GPT-4o-mini) as primary, Gemini as fallback
app.post('/ai/chat', async (req, res) => {
  const { message, context, language } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required.' });
  }

  const langLabel = language || 'English';

  const contextText = context
    ? `Context: Crop: ${context.plant || 'Unknown'}, Disease: ${context.disease || 'Unknown'}, Confidence: ${context.confidence ?? 'N/A'}`
    : '';

  const systemPrompt = `You are an expert agricultural assistant helping farmers diagnose crop diseases and provide treatment advice. You MUST respond ONLY in ${langLabel}. Keep answers concise, practical, and under 120 words.`;

  const userContent = `${contextText ? contextText + '\n\n' : ''}Farmer question: ${message}`;

  // ── Try OpenAI first ────────────────────────────────────────────
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        max_tokens: 300,
        temperature: 0.7
      });
      const text = completion.choices?.[0]?.message?.content || '';
      return res.json({ response: text.trim(), source: 'openai' });
    } catch (oaiErr) {
      console.warn('[Chat] OpenAI failed, falling back to Gemini:', oaiErr.message);
    }
  }

  // ── Gemini fallback ─────────────────────────────────────────────
  try {
    const chat = model.startChat({
      history: [{ role: 'user', parts: [{ text: systemPrompt }] }]
    });
    const result = await chat.sendMessage(userContent);
    const responseText = result?.response?.text?.() ?? '';
    return res.json({ response: responseText.trim(), source: 'gemini' });
  } catch (err) {
    console.error('[Chat] error:', err?.message || err);
    return res.status(500).json({
      error: 'AI chatbot is temporarily unavailable. Please try again later.'
    });
  }
});

// ─── Text-to-Speech Endpoint (OpenAI TTS) ─────────────────────────
// Body: { text, language }
// Returns: audio/mpeg stream
app.post('/ai/speak', async (req, res) => {
  const { text, language } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required.' });
  }

  // Limit text length for TTS
  const cleanText = text.substring(0, 500).trim();
  if (!cleanText) {
    return res.status(400).json({ error: 'text is empty after cleanup.' });
  }

  if (!openai) {
    return res.status(503).json({ error: 'TTS not available. Set OPENAI_API_KEY in .env.' });
  }

  try {
    const mp3Response = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: cleanText,
      response_format: 'mp3'
    });

    // Stream the audio back
    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600'
    });

    const buffer = Buffer.from(await mp3Response.arrayBuffer());
    return res.send(buffer);
  } catch (err) {
    console.error('[TTS] error:', err?.message || err);
    return res.status(500).json({ error: 'Text-to-speech generation failed.' });
  }
});

// ─── Health Check ─────────────────────────────────────────────────
app.get('/ai/health', (_req, res) => {
  return res.json({
    status: 'ok',
    gemini: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
    openai: OPENAI_KEY ? 'configured' : 'not configured',
    tts: OPENAI_KEY ? 'available' : 'unavailable',
    advisoryCacheSize: advisoryCache.size
  });
});
// ─── Multer for image upload ──────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Gemini Vision Fallback Detection ─────────────────────────
// Body: multipart form-data with "image" file + optional "language" field
app.post('/ai/vision-detect', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'image file is required.' });
  }

  const language = req.body?.language || 'English';
  const imageBase64 = req.file.buffer.toString('base64');
  const mimeType = req.file.mimetype || 'image/jpeg';

  const prompt = `You are an agricultural expert.

Analyze this crop image and identify:

1. Plant species name
2. Possible disease or pest
3. Confidence level (as a decimal between 0 and 1, e.g. 0.75)
4. Visible symptoms
5. Recommended treatment
6. Organic remedy
7. Chemical treatment
8. Prevention steps

Respond strictly in ${language}.

Return ONLY valid JSON in this format (no markdown):
{
  "plant": "Plant species name",
  "disease": "Disease or pest name, or healthy if none detected",
  "confidence": 0.75,
  "symptoms": "Description of visible symptoms",
  "treatment": "Recommended treatment steps",
  "organic": "Organic remedy",
  "chemical": "Chemical treatment",
  "prevention": "Prevention steps",
  "source": "gemini-vision"
}`;

  try {
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data: imageBase64 } }
    ]);

    const raw = result?.response?.text?.() ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : raw;

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      data = {
        plant: 'Unknown',
        disease: 'Could not determine',
        confidence: 0.5,
        symptoms: raw || 'Analysis could not be parsed.',
        treatment: 'Consult local agricultural extension.',
        organic: 'Use neem oil spray.',
        chemical: 'Consult expert for chemical treatment.',
        prevention: 'Maintain good field hygiene.',
        source: 'gemini-vision'
      };
    }

    data.source = 'gemini-vision';
    return res.json(data);
  } catch (err) {
    console.error('[Vision] error:', err);
    return res.status(500).json({ error: 'AI Vision analysis failed. Please try again.' });
  }
});

// ─── AI Crop Risk Forecast (7-Day) ───────────────────────────
// Body: { weatherData: [{day, temp, humidity, rainfall, windSpeed}], crop, language }
app.post('/ai/risk-forecast', async (req, res) => {
  const { weatherData, crop, language } = req.body || {};
  const langLabel = language || 'English';

  if (!weatherData || !Array.isArray(weatherData)) {
    return res.status(400).json({ error: 'weatherData array is required.' });
  }

  const weatherSummary = weatherData.map((d, i) =>
    `Day ${i + 1}: Temp=${d.temp}°C, Humidity=${d.humidity}%, Rainfall=${d.rainfall}mm, Wind=${d.windSpeed}km/h`
  ).join('\n');

  const prompt = `You are an agricultural risk analyst.

IMPORTANT: Respond ONLY in ${langLabel}.

Crop: ${crop || 'General crops'}

Weather forecast for next 7 days:
${weatherSummary}

Risk model rules:
- High humidity (>70%) + moderate temperature (20-30°C) → fungal disease risk
- Heavy rainfall (>15mm/day) → leaf disease risk
- Hot (>35°C) + dry (humidity <30%) → pest risk
- Strong winds (>30km/h) → physical damage risk

For each day, calculate a risk level: Low, Moderate, High, or Critical.

Return ONLY valid JSON (no markdown):
{
  "forecast": [
    {"day": 1, "risk": "Low", "score": 0.2, "threats": ["threat1"]},
    {"day": 2, "risk": "Moderate", "score": 0.5, "threats": ["threat1"]},
    ...for all 7 days
  ],
  "summary": "2-3 sentence overall risk summary in ${langLabel}",
  "recommendation": "Specific preventive action recommendation in ${langLabel}"
}`;

  try {
    const raw = await generateText(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : raw;

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      data = {
        forecast: weatherData.map((_, i) => ({ day: i + 1, risk: 'Moderate', score: 0.5, threats: ['Unable to parse'] })),
        summary: 'Risk analysis could not be parsed.',
        recommendation: 'Monitor crops regularly.'
      };
    }

    return res.json(data);
  } catch (err) {
    console.error('[RiskForecast] error:', err);
    return res.status(500).json({ error: 'Risk forecast temporarily unavailable.' });
  }
});

// ─── Rainfall Intelligence ────────────────────────────────────
// Body: { currentRainfall, historicalAverage, region, language }
app.post('/ai/rainfall-intelligence', async (req, res) => {
  const { currentRainfall, historicalAverage, region, language } = req.body || {};
  const langLabel = language || 'English';

  const anomaly = historicalAverage ? (((currentRainfall - historicalAverage) / historicalAverage) * 100).toFixed(1) : 0;

  const prompt = `You are an agricultural meteorologist.

IMPORTANT: Respond ONLY in ${langLabel}.

Region: ${region || 'General'}
Current rainfall: ${currentRainfall || 0}mm
Historical average: ${historicalAverage || 0}mm
Anomaly: ${anomaly > 0 ? '+' : ''}${anomaly}%

Analyze this rainfall data and provide:
1. Risk assessment based on the anomaly
2. Impact on crops
3. Recommended actions for farmers

Return ONLY valid JSON (no markdown):
{
  "anomaly_percent": ${anomaly},
  "anomaly_status": "above_average or below_average or normal",
  "risk_level": "Low or Moderate or High or Critical",
  "advisory": "2-3 sentences of specific advice for farmers in ${langLabel}",
  "crop_impact": "How this rainfall pattern affects crops in ${langLabel}",
  "action_items": ["action1", "action2", "action3"]
}`;

  try {
    const raw = await generateText(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : raw;

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      data = {
        anomaly_percent: parseFloat(anomaly),
        anomaly_status: anomaly > 5 ? 'above_average' : anomaly < -5 ? 'below_average' : 'normal',
        risk_level: 'Moderate',
        advisory: 'Monitor rainfall patterns and adjust irrigation accordingly.',
        crop_impact: 'Rainfall anomaly may affect crop health.',
        action_items: ['Monitor fields', 'Check drainage', 'Prepare for disease pressure']
      };
    }

    return res.json(data);
  } catch (err) {
    console.error('[Rainfall] error:', err);
    return res.status(500).json({ error: 'Rainfall intelligence unavailable.' });
  }
});

// ─── Smart Fertilizer Intelligence ────────────────────────────
// Body: { plant, disease, confidence, soilType, language }
app.post('/ai/fertilizer-plan', async (req, res) => {
  const { plant, disease, confidence, soilType, language } = req.body || {};
  const langLabel = language || 'English';

  const prompt = `You are an expert agricultural soil scientist and fertilizer advisor.

IMPORTANT: Respond ONLY in ${langLabel}.

Crop: ${plant || 'Unknown crop'}
Detected Disease: ${disease || 'None'}
Confidence: ${confidence || 'N/A'}
Soil Type: ${soilType || 'Loamy'}

Provide detailed fertilizer recommendations considering the disease detected.

Return ONLY valid JSON (no markdown):
{
  "fertilizer_name": "Specific fertilizer name",
  "npk_ratio": "e.g. 19-19-19",
  "application_method": "How to apply (foliar spray, soil drench, etc.)",
  "frequency": "How often to apply",
  "dosage": "Specific dosage per acre or per liter",
  "disease_recovery_help": "How this fertilizer helps the plant recover from the detected disease in ${langLabel}",
  "organic_alternative": "Organic fertilizer option in ${langLabel}",
  "caution": "Any warnings or precautions in ${langLabel}"
}`;

  try {
    const raw = await generateText(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : raw;

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      data = {
        fertilizer_name: 'Balanced NPK 19-19-19',
        npk_ratio: '19-19-19',
        application_method: 'Foliar spray',
        frequency: 'Every 2 weeks',
        dosage: '5g per liter of water',
        disease_recovery_help: 'Balanced nutrition supports plant immune response.',
        organic_alternative: 'Vermicompost or fish emulsion',
        caution: 'Avoid over-application.'
      };
    }

    return res.json(data);
  } catch (err) {
    console.error('[Fertilizer] error:', err);
    return res.status(500).json({ error: 'Fertilizer plan unavailable.' });
  }
});
app.listen(PORT, () => {
  console.log(`[AI] Gemini server listening on http://127.0.0.1:${PORT}`);
});

