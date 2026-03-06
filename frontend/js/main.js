(function () {
  const doc = document;

  /* ═══════ UTILITIES ═══════ */
  function qs(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function qsa(sel, ctx) { return (ctx || doc).querySelectorAll(sel); }

  function toast(msg) {
    const existing = qs('.toast-notification');
    if (existing) existing.remove();
    const el = doc.createElement('div');
    el.className = 'toast-notification';
    el.textContent = msg;
    doc.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function renderMarkdown(text) {
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
      .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
    html = html.replace(/((?:<li>.*?<\/li><br>?)+)/g, (match) => {
      return '<ul>' + match.replace(/<br>/g, '') + '</ul>';
    });
    return '<p>' + html + '</p>';
  }

  /* ═══════ CONFIG ═══════ */
  const API_BASE = 'http://127.0.0.1:8000';
  const PREDICT_URL = API_BASE + '/predict';
  const AI_BASE = 'http://127.0.0.1:4000/ai';
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const LANGUAGE_CONFIG = {
    en: { label: 'English', locale: 'en-US' },
    hi: { label: 'Hindi', locale: 'hi-IN' },
    te: { label: 'Telugu', locale: 'te-IN' },
    ta: { label: 'Tamil', locale: 'ta-IN' },
    kn: { label: 'Kannada', locale: 'kn-IN' },
    ml: { label: 'Malayalam', locale: 'ml-IN' },
    mr: { label: 'Marathi', locale: 'mr-IN' },
    gu: { label: 'Gujarati', locale: 'gu-IN' },
    pa: { label: 'Punjabi', locale: 'pa-IN' },
    bn: { label: 'Bengali', locale: 'bn-IN' },
    or: { label: 'Odia', locale: 'or-IN' },
    ur: { label: 'Urdu', locale: 'ur-PK' },
    es: { label: 'Spanish', locale: 'es-ES' },
    fr: { label: 'French', locale: 'fr-FR' },
    de: { label: 'German', locale: 'de-DE' },
    ja: { label: 'Japanese', locale: 'ja-JP' },
    zh: { label: 'Chinese', locale: 'zh-CN' },
    ar: { label: 'Arabic', locale: 'ar-SA' }
  };

  const TRANSLATIONS = (window.AGRI_TRANSLATIONS) || {};

  const LANGUAGE_VOICE_MAP = {
    English: 'en',
    Hindi: 'hi',
    Telugu: 'te',
    Tamil: 'ta',
    Kannada: 'kn',
    Malayalam: 'ml',
    Marathi: 'mr',
    Gujarati: 'gu',
    Punjabi: 'pa',
    Bengali: 'bn',
    Odia: 'or',
    Urdu: 'ur',
    Spanish: 'es',
    French: 'fr',
    German: 'de',
    Japanese: 'ja',
    Chinese: 'zh',
    Arabic: 'ar'
  };

  function prepareTextForSpeech(text) {
    if (!text) return '';
    let clean = String(text)
      // Strip markdown formatting
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Bullets / numbering
      .replace(/^\s*[-*+]\s/gm, '')
      .replace(/^\s*\d+\.\s/gm, '')
      // Newlines & extra spaces
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!clean) return '';

    // Limit to ~500 chars and cut at sentence boundary when possible
    if (clean.length > 500) {
      const cutAt = clean.lastIndexOf('.', 500);
      clean = cutAt > 200 ? clean.substring(0, cutAt + 1) : clean.substring(0, 500);
    }

    return clean;
  }

  function getOpenAIApiKey() {
    if (window.AGRISHIELD_OPENAI_KEY && typeof window.AGRISHIELD_OPENAI_KEY === 'string') {
      return window.AGRISHIELD_OPENAI_KEY.trim();
    }
    try {
      const stored = localStorage.getItem('agrishield_openai_key');
      return stored && stored.trim() ? stored.trim() : null;
    } catch {
      return null;
    }
  }

  async function speakWithOpenAI(prepared, langCode, apiKey) {
    if (!apiKey) return false;
    try {
      const resp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          voice: 'alloy',
          input: prepared
        })
      });
      if (!resp.ok) {
        console.warn('[AgriShield] OpenAI TTS HTTP error:', resp.status);
        return false;
      }
      const arrayBuffer = await resp.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      return await new Promise((resolve) => {
        audio.addEventListener('ended', () => {
          URL.revokeObjectURL(url);
          resolve(true);
        });
        audio.addEventListener('error', () => {
          URL.revokeObjectURL(url);
          resolve(false);
        });
        audio.play().catch(() => {
          URL.revokeObjectURL(url);
          resolve(false);
        });
      });
    } catch (e) {
      console.warn('[AgriShield] OpenAI TTS failed:', e.message);
      return false;
    }
  }

  /** Speak text with multilingual TTS cascade */
  async function speakAI(text, language) {
    if (!text || !voiceEnabled) return;

    const prepared = prepareTextForSpeech(text);
    if (!prepared) return;

    const langCode = LANGUAGE_VOICE_MAP[language] || 'en';

    // 1) Try client-side OpenAI TTS (if user storage key is set)
    try {
      const apiKey = getOpenAIApiKey();
      if (apiKey) {
        const ok = await speakWithOpenAI(prepared, langCode, apiKey);
        if (ok) return;
      }
    } catch (e) {
      console.warn('[TTS] Client OpenAI failed:', e.message);
    }

    // 2) Try server-side TTS endpoint (/ai/speak) — only if server likely has OpenAI
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const ttsRes = await fetch(AI_BASE + '/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prepared, language: langCode }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        if (blob.size > 100) {  // Valid audio file
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          await new Promise((resolve) => {
            audio.addEventListener('ended', () => { URL.revokeObjectURL(url); resolve(); });
            audio.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(); });
            audio.play().catch(() => { URL.revokeObjectURL(url); resolve(); });
          });
          return;
        }
      }
    } catch (e) {
      // Silently skip — not an error, server just doesn't have OpenAI key
    }

    // 3) Browser TTS fallback — guaranteed to work
    useBrowserTTS(prepared, langCode);
  }

  /** Browser speechSynthesis with robust voice matching */
  function useBrowserTTS(text, langCode) {
    if (!window.speechSynthesis) return;

    // BCP-47 locale mapping for Indian languages
    const BCP47_MAP = {
      'en': 'en-US', 'hi': 'hi-IN', 'te': 'te-IN', 'ta': 'ta-IN',
      'kn': 'kn-IN', 'mr': 'mr-IN', 'ml': 'ml-IN', 'gu': 'gu-IN',
      'pa': 'pa-IN', 'bn': 'bn-IN', 'or': 'or-IN', 'ur': 'ur-IN',
      'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE', 'ja': 'ja-JP',
      'zh': 'zh-CN', 'ar': 'ar-SA'
    };
    const locale = BCP47_MAP[langCode] || langCode;

    function doSpeak() {
      const voices = speechSynthesis.getVoices();
      // Prefer exact locale match, then prefix match, then English
      const voice =
        voices.find(v => v.lang === locale) ||
        voices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase())) ||
        voices.find(v => v.lang.toLowerCase().startsWith('en'));

      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || locale;
      utterance.rate = 0.95;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    }

    // Chrome loads voices asynchronously — wait if needed
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      doSpeak();
    } else {
      speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.onvoiceschanged = null;
        doSpeak();
      };
      // Safety: if voices never load, speak anyway after 500ms
      setTimeout(doSpeak, 500);
    }
  }

  // Preload voices (some browsers load them async)
  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = () => { speechSynthesis.getVoices(); };
    speechSynthesis.getVoices();
  }

  /* ═══════ STATE ═══════ */
  let selectedFile = null;
  let isAnalyzing = false;
  let lastPrediction = null;
  let lastAdvisory = null;
  let voiceEnabled = true;
  let currentLang = 'en';
  let detectionSource = 'ml'; // 'ml' or 'gemini-vision'

  try {
    currentLang = localStorage.getItem('lang') || localStorage.getItem('agrishield_lang') || 'en';
    const storedVoice = localStorage.getItem('agrishield_voice_muted');
    if (storedVoice === 'true') voiceEnabled = false;
  } catch {
    currentLang = 'en';
    voiceEnabled = true;
  }


  /* ═══════ PLANT KNOWLEDGE DATABASE ═══════ */
  const PLANT_KNOWLEDGE = {
    'Tomato': {
      sciName: 'Solanum lycopersicum', common: 'Tomato, Love Apple', genus: 'Solanum', family: 'Solanaceae', order: 'Solanales', plantClass: 'Magnoliopsida, Dicotyledons',
      sunlight: 'Full Sun (6-8h)', soil: 'Loamy, Well-drained', ph: '6.0 - 6.8', temp: '18-30°C', water: 'Every 1-2 Days', repot: 'Every 1-2 Years',
      pests: ['Aphids', 'Whiteflies', 'Hornworms', 'Spider mites'], diseases: ['Late blight', 'Early blight', 'Leaf curl', 'Septoria leaf spot', 'Bacterial spot'],
      uses: 'Tomatoes are widely used in salads, sauces, soups, and cooking worldwide. They are rich in lycopene, vitamins A and C, and antioxidants.', culture: 'Tomatoes symbolize abundance and are a staple in Mediterranean, Mexican, and Indian cuisines. They were once considered ornamental before becoming a food crop.', similar: ['Pepper', 'Eggplant', 'Potato']
    },
    'Pepper': {
      sciName: 'Capsicum annuum', common: 'Bell Pepper, Sweet Pepper', genus: 'Capsicum', family: 'Solanaceae', order: 'Solanales', plantClass: 'Magnoliopsida, Dicotyledons',
      sunlight: 'Full Sun (6-8h)', soil: 'Sandy Loam', ph: '6.0 - 6.8', temp: '20-30°C', water: 'Every 2-3 Days', repot: 'Annually',
      pests: ['Aphids', 'Pepper weevils', 'Thrips'], diseases: ['Bacterial spot', 'Anthracnose', 'Phytophthora blight'],
      uses: 'Bell peppers are consumed raw in salads, stuffed, stir-fried, and used as seasoning. They are rich in vitamin C and beta-carotene.', culture: 'Peppers are native to the Americas and have become central to cuisines worldwide, from Hungarian paprika to Asian chili dishes.', similar: ['Tomato', 'Eggplant', 'Chili']
    },
    'Potato': {
      sciName: 'Solanum tuberosum', common: 'Potato, Spud', genus: 'Solanum', family: 'Solanaceae', order: 'Solanales', plantClass: 'Magnoliopsida, Dicotyledons',
      sunlight: 'Full Sun', soil: 'Loamy, Sandy', ph: '5.5 - 6.5', temp: '15-25°C', water: 'Every 2-3 Days', repot: 'N/A (tuber crop)',
      pests: ['Colorado potato beetle', 'Aphids', 'Wireworms'], diseases: ['Late blight', 'Early blight', 'Scab', 'Black leg'],
      uses: 'Potatoes are one of the most important food crops globally, used in countless dishes from fries to curries. High in carbohydrates, vitamin C, and potassium.', culture: 'Originating from the Andes, potatoes became a staple food in Europe and have shaped agricultural history, including the Irish Potato Famine.', similar: ['Sweet Potato', 'Tomato', 'Eggplant']
    },
    'Corn': {
      sciName: 'Zea mays', common: 'Corn, Maize', genus: 'Zea', family: 'Poaceae', order: 'Poales', plantClass: 'Liliopsida, Monocotyledons',
      sunlight: 'Full Sun (8h+)', soil: 'Rich, Well-drained', ph: '5.8 - 7.0', temp: '21-30°C', water: 'Regular watering', repot: 'N/A (field crop)',
      pests: ['Corn earworm', 'European corn borer', 'Armyworm'], diseases: ['Gray leaf spot', 'Common rust', 'Northern leaf blight', 'Cercospora leaf spot'],
      uses: 'Corn is a major cereal crop used for food, animal feed, ethanol production, and industrial products. Rich in fiber and essential nutrients.', culture: 'Corn was domesticated by indigenous peoples of Mexico over 10,000 years ago and is central to many Native American cultures and traditions.', similar: ['Sorghum', 'Wheat', 'Rice']
    },
    'Apple': {
      sciName: 'Malus domestica', common: 'Apple', genus: 'Malus', family: 'Rosaceae', order: 'Rosales', plantClass: 'Magnoliopsida, Dicotyledons',
      sunlight: 'Full Sun', soil: 'Loamy, Well-drained', ph: '6.0 - 7.0', temp: '15-25°C', water: 'Every 3-5 Days', repot: 'Every 2-3 Years',
      pests: ['Codling moth', 'Apple maggot', 'Aphids'], diseases: ['Apple scab', 'Cedar apple rust', 'Black rot', 'Fire blight'],
      uses: 'Apples are consumed fresh, juiced, cooked in pies and sauces. They are rich in fiber, vitamin C, and antioxidants.', culture: 'Apples symbolize knowledge, health, and temptation across cultures. The proverb "An apple a day keeps the doctor away" reflects their perceived health benefits.', similar: ['Pear', 'Cherry', 'Peach']
    },
    'Grape': {
      sciName: 'Vitis vinifera', common: 'Grape, Grapevine', genus: 'Vitis', family: 'Vitaceae', order: 'Vitales', plantClass: 'Magnoliopsida, Dicotyledons',
      sunlight: 'Full Sun', soil: 'Sandy Loam', ph: '5.5 - 7.0', temp: '15-30°C', water: 'Weekly, deep', repot: 'N/A (vine)',
      pests: ['Japanese beetles', 'Grape berry moth', 'Phylloxera'], diseases: ['Esca (Black measles)', 'Leaf blight', 'Black rot'],
      uses: 'Grapes are eaten fresh, dried as raisins, and fermented into wine. They contain resveratrol and powerful antioxidants.', culture: 'Grapes have been cultivated for thousands of years and are central to winemaking traditions across the Mediterranean.', similar: ['Blueberry', 'Raspberry', 'Currant']
    },
    'Strawberry': {
      sciName: 'Fragaria × ananassa', common: 'Strawberry', genus: 'Fragaria', family: 'Rosaceae', order: 'Rosales', plantClass: 'Magnoliopsida, Dicotyledons',
      sunlight: 'Full Sun', soil: 'Sandy Loam', ph: '5.5 - 6.5', temp: '15-25°C', water: 'Every 1-2 Days', repot: 'Annually',
      pests: ['Slugs', 'Spider mites', 'Aphids'], diseases: ['Gray mold', 'Leaf scorch', 'Powdery mildew'],
      uses: 'Strawberries are enjoyed fresh, in desserts, jams, and smoothies. They are rich in vitamin C, manganese, and antioxidants.', culture: 'Strawberries symbolize spring, love, and fertility. They have been cultivated since the Roman era.', similar: ['Raspberry', 'Blueberry', 'Blackberry']
    },
    'Peach': {
      sciName: 'Prunus persica', common: 'Peach', genus: 'Prunus', family: 'Rosaceae', order: 'Rosales', plantClass: 'Magnoliopsida, Dicotyledons',
      sunlight: 'Full Sun', soil: 'Sandy Loam, Well-drained', ph: '6.0 - 7.0', temp: '18-28°C', water: 'Every 3-4 Days', repot: 'Every 2-3 Years',
      pests: ['Peach tree borer', 'Aphids', 'Oriental fruit moth'], diseases: ['Bacterial spot', 'Brown rot', 'Peach leaf curl'],
      uses: 'Peaches are eaten fresh, canned, dried, and used in pies and preserves. They are rich in vitamins A and C.', culture: 'In Chinese culture, peaches symbolize longevity and immortality. They are one of the oldest cultivated fruits.', similar: ['Nectarine', 'Plum', 'Cherry']
    },
    'Cherry': {
      sciName: 'Prunus avium', common: 'Cherry', genus: 'Prunus', family: 'Rosaceae', order: 'Rosales', plantClass: 'Magnoliopsida, Dicotyledons',
      sunlight: 'Full Sun', soil: 'Loamy, Well-drained', ph: '6.0 - 7.5', temp: '15-25°C', water: 'Every 3-5 Days', repot: 'Every 2-3 Years',
      pests: ['Cherry fruit fly', 'Aphids', 'Spider mites'], diseases: ['Powdery mildew', 'Brown rot', 'Leaf spot'],
      uses: 'Cherries are consumed fresh, dried, in baking, and juiced. They contain melatonin and antioxidants for anti-inflammatory benefits.', culture: 'Cherry blossoms (Sakura) hold deep cultural significance in Japan, symbolizing the beauty and transience of life.', similar: ['Plum', 'Peach', 'Apricot']
    },
    'Soybean': {
      sciName: 'Glycine max', common: 'Soybean, Soya bean', genus: 'Glycine', family: 'Fabaceae', order: 'Fabales', plantClass: 'Magnoliopsida, Dicotyledons',
      sunlight: 'Full Sun', soil: 'Loamy', ph: '6.0 - 7.0', temp: '20-30°C', water: 'Regular, moderate', repot: 'N/A (field crop)',
      pests: ['Soybean aphid', 'Bean leaf beetle', 'Stink bugs'], diseases: ['Soybean rust', 'Frogeye leaf spot', 'Sudden death syndrome'],
      uses: 'Soybeans are used to make tofu, soy milk, soy sauce, tempeh, and animal feed. One of the richest plant sources of protein.', culture: 'Soybeans have been cultivated in East Asia for over 5,000 years and are central to vegetarian diets globally.', similar: ['Peanut', 'Lentil', 'Chickpea']
    },
    'Squash': {
      sciName: 'Cucurbita spp.', common: 'Squash, Pumpkin', genus: 'Cucurbita', family: 'Cucurbitaceae', order: 'Cucurbitales', plantClass: 'Magnoliopsida, Dicotyledons',
      sunlight: 'Full Sun', soil: 'Rich, Well-drained', ph: '6.0 - 6.8', temp: '18-30°C', water: 'Every 2-3 Days', repot: 'N/A (vine crop)',
      pests: ['Squash bugs', 'Vine borers', 'Cucumber beetles'], diseases: ['Powdery mildew', 'Downy mildew', 'Bacterial wilt'],
      uses: 'Squash varieties are eaten roasted, in soups, and as decorative gourds. Rich in fiber, vitamins A and C.', culture: 'Squash is one of the "Three Sisters" crops alongside corn and beans in Native American agriculture.', similar: ['Cucumber', 'Melon', 'Zucchini']
    }
  };

  /* Default plant data for unknown crops */
  const DEFAULT_PLANT = {
    sciName: 'Unknown', common: '—', genus: '—', family: '—', order: '—', plantClass: '—',
    sunlight: 'Full Sun', soil: 'Well-drained', ph: '6.0 - 7.0', temp: '15-30°C', water: 'Moderate', repot: 'Varies',
    pests: ['Aphids', 'Spider mites', 'Whiteflies'], diseases: ['Leaf spot', 'Root rot', 'Powdery mildew'],
    uses: 'Consult agricultural extension services for specific uses.', culture: 'Regional crop with local significance.', similar: []
  };

  /** Extract base plant name from predicted class like "Tomato___Late_blight" */
  function extractPlantName(predictedClass) {
    const parts = predictedClass.split(/[_]+/);
    // Return first part with capital letter
    const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    return name;
  }

  function getPlantData(predictedClass) {
    const plantName = extractPlantName(predictedClass);
    // Find matching plant knowledge
    for (const key of Object.keys(PLANT_KNOWLEDGE)) {
      if (plantName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(plantName.toLowerCase())) {
        return { ...PLANT_KNOWLEDGE[key], displayName: key };
      }
    }
    return { ...DEFAULT_PLANT, displayName: plantName };
  }

  function isHealthy(predictedClass) {
    return predictedClass.toLowerCase().includes('healthy');
  }

  /* ═══════ NAVBAR + LANGUAGE ═══════ */
  function initNavbar() {
    const navbar = qs('.navbar');
    if (!navbar) return;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => { navbar.classList.toggle('scrolled', window.scrollY > 20); ticking = false; });
        ticking = true;
      }
    });
    const hamburger = doc.getElementById('navHamburger');
    const menu = doc.getElementById('navMenu');
    if (hamburger && menu) {
      hamburger.addEventListener('click', () => menu.classList.toggle('open'));
      qsa('.nav-link', menu).forEach(link => { link.addEventListener('click', () => menu.classList.remove('open')); });
    }
  }

  /* ═══════ SIDEBAR EXPAND/COLLAPSE ═══════ */
  function initSidebar() {
    const appShell = qs('.app-shell');
    const sidebar = doc.getElementById('sidebar');
    const expandBtn = doc.getElementById('sidebarExpandBtn');
    const toggleBtn = doc.getElementById('sidebarToggle');
    if (!appShell || !sidebar) return;

    // Restore expand state from localStorage
    const savedExpanded = localStorage.getItem('sidebar_expanded');
    if (savedExpanded === 'true') {
      appShell.classList.add('sidebar-expanded');
    }

    // Desktop expand/collapse
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        appShell.classList.toggle('sidebar-expanded');
        const isExpanded = appShell.classList.contains('sidebar-expanded');
        expandBtn.textContent = isExpanded ? '✕' : '☰';
        expandBtn.title = isExpanded ? 'Collapse sidebar' : 'Expand sidebar';
        try { localStorage.setItem('sidebar_expanded', String(isExpanded)); } catch { }
      });
      if (appShell.classList.contains('sidebar-expanded')) {
        expandBtn.textContent = '✕';
        expandBtn.title = 'Collapse sidebar';
      }
    }

    // Mobile toggle
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('is-open');
      });
    }

    // Close sidebar on outside click (mobile)
    doc.addEventListener('click', (e) => {
      if (sidebar.classList.contains('is-open') && !sidebar.contains(e.target) && e.target !== toggleBtn) {
        sidebar.classList.remove('is-open');
      }
    });

    // ── Page-based navigation ──
    const PAGE_TITLES = {
      dashboard: 'Dashboard',
      crop: 'Crop Detection',
      plant: 'Plant Intelligence',
      treatment: 'Treatment & Advisory',
      risk: 'Risk Monitor',
      weather: 'Weather Intelligence',
      insurance: 'Insurance Automation',
      analytics: 'Analytics',
      settings: 'Settings'
    };

    const sidebarLinks = sidebar.querySelectorAll('.sidebar-link[data-page]');
    const pageSections = doc.querySelectorAll('.page-section[data-page]');
    const topbarTitle = qs('.topbar h1');

    function navigateTo(page) {
      // Hide all pages, show target
      pageSections.forEach(s => {
        s.classList.toggle('active', s.dataset.page === page);
      });
      // Update sidebar active state
      sidebarLinks.forEach(l => {
        l.classList.toggle('active', l.dataset.page === page);
      });
      // Update topbar title
      if (topbarTitle && PAGE_TITLES[page]) {
        topbarTitle.textContent = PAGE_TITLES[page];
      }
      // Save active page
      try { localStorage.setItem('active_page', page); } catch { }
      // Close mobile sidebar
      sidebar.classList.remove('is-open');
      // Scroll to top
      const content = qs('.content');
      if (content) content.scrollTop = 0;
    }

    // Attach click handlers to sidebar links
    sidebarLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.dataset.page);
      });
    });

    // Restore last active page
    const savedPage = localStorage.getItem('active_page');
    if (savedPage && doc.querySelector('.page-section[data-page="' + savedPage + '"]')) {
      navigateTo(savedPage);
    }

    // Expose for programmatic navigation (e.g. from chat or cards)
    window.navigateTo = navigateTo;
  }

  function initLanguage() {
    const select = doc.getElementById('langSelect');
    const settingsSelect = doc.getElementById('settingsLangSelect');
    if (!select) return;
    if (!LANGUAGE_CONFIG[currentLang]) currentLang = 'en';
    select.value = currentLang;
    if (settingsSelect) settingsSelect.value = currentLang;

    // Initial UI text update
    updateUIText(currentLang);

    function applyLang(val) {
      if (!LANGUAGE_CONFIG[val]) return;
      currentLang = val;
      try {
        localStorage.setItem('lang', currentLang);
        localStorage.setItem('agrishield_lang', currentLang);
      } catch { /* ignore */ }
      if (window.AgriShield) {
        window.AgriShield.selectedLanguage = val;
        window.AgriShield.selectedLanguageName = LANGUAGE_CONFIG[val]?.label || 'English';
      }
      updateUIText(currentLang);

      // Sync speech recognition language
      if (window._agriRecognition) {
        window._agriRecognition.lang = LANGUAGE_CONFIG[val]?.locale || 'en-US';
      }

      // Sync VoiceAssistant language
      if (window._agriVoiceAssistant && window._agriVoiceAssistant.setLanguage) {
        window._agriVoiceAssistant.setLanguage(val);
      }

      // Keep both selectors in sync
      select.value = val;
      if (settingsSelect) settingsSelect.value = val;

      // Voice confirmation in the newly selected language
      announceLanguageChange(val);
    }

    select.addEventListener('change', () => applyLang(select.value));
    if (settingsSelect) {
      settingsSelect.addEventListener('change', () => applyLang(settingsSelect.value));
    }
  }

  function announceLanguageChange(langCode) {
    const greetings = {
      en: 'Language changed to English.',
      hi: 'भाषा हिंदी में बदल गई।',
      te: 'భాష తెలుగులోకి మారింది.',
      ta: 'மொழி தமிழுக்கு மாற்றப்பட்டது.',
      kn: 'ಭಾಷೆ ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.',
      mr: 'भाषा मराठीत बदलली.',
    };
    const msg = greetings[langCode];
    if (!msg) return;
    const label = LANGUAGE_CONFIG[langCode]?.label || 'English';
    setTimeout(() => speakAI(msg, label), 600);
  }

  function updateUIText(langCode) {
    // Sync global state with the i18n engine
    window.AgriShield_currentLang = langCode;

    // Use the new translation engine if available
    if (window.i18n && window.i18n.applyTranslations) {
      window.i18n.applyTranslations();
    } else {
      // Fallback: manual DOM translation
      var langData = TRANSLATIONS[langCode] || TRANSLATIONS.en || {};

      qsa('[data-i18n]').forEach(function (el) {
        var key = el.getAttribute('data-i18n');
        var val = langData[key] || (TRANSLATIONS.en || {})[key];
        if (!val && window.i18n) val = window.i18n.formatMissingKey(key);
        if (val) el.textContent = val;
      });

      qsa('[data-i18n-placeholder]').forEach(function (el) {
        var key = el.getAttribute('data-i18n-placeholder');
        var val = langData[key] || (TRANSLATIONS.en || {})[key];
        if (val) el.placeholder = val;
      });

      qsa('[data-i18n-title]').forEach(function (el) {
        var key = el.getAttribute('data-i18n-title');
        var val = langData[key] || (TRANSLATIONS.en || {})[key];
        if (val) el.title = val;
      });
    }

    // Sidebar links (icon + text)
    qsa('.sidebar-link').forEach(function (link) {
      var section = link.getAttribute('data-page') || link.getAttribute('data-section');
      if (!section) return;
      var key = section.replace(/-/g, '_') + '_label';
      var langData = TRANSLATIONS[langCode] || TRANSLATIONS.en || {};
      var val = langData[key] || (TRANSLATIONS.en || {})[key];
      if (!val && window.i18n) val = window.i18n.t(key);
      if (!val) return;
      var labelSpan = link.querySelector('.sidebar-label');
      if (labelSpan) {
        labelSpan.textContent = val;
      }
    });
  }

  /* ═══════ STICKY CTA ═══════ */
  function initStickyCta() {
    const sticky = doc.getElementById('stickyCta');
    if (!sticky) return;
    window.addEventListener('scroll', () => { sticky.classList.toggle('visible', window.scrollY > 600); });
  }

  /* ═══════ ANIMATED COUNTERS ═══════ */
  function initCounters() {
    const items = qsa('[data-count]');
    if (!items.length) return;
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const duration = 1200;
        const start = performance.now();
        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = target * eased;
          el.textContent = (target >= 1000 ? Math.round(current).toLocaleString() : Math.round(current)) + (suffix || '+');
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        obs.unobserve(el);
      });
    }, { threshold: 0.4 });
    items.forEach(el => observer.observe(el));
  }

  /* ═══════ SCROLL REVEAL ═══════ */
  function initReveal() {
    const revealEls = [...qsa('.module-card'), ...qsa('.why-card'), ...qsa('.testimonial-card'), ...qsa('.visual-card'), ...qsa('.about-feat'), ...qsa('.stat-item')];
    revealEls.forEach(el => el.classList.add('reveal'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach((el, i) => { el.style.transitionDelay = `${(i % 3) * 100}ms`; observer.observe(el); });
  }

  /* ═══════ HERO PARTICLES ═══════ */
  function initParticles() {
    const container = doc.getElementById('heroParticles');
    if (!container) return;
    for (let i = 0; i < 20; i++) {
      const p = doc.createElement('div');
      const size = Math.random() * 4 + 2;
      p.style.cssText = `position:absolute;width:${size}px;height:${size}px;border-radius:50%;background:rgba(31,122,90,${Math.random() * 0.12 + 0.04});left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation:float-particle ${Math.random() * 8 + 6}s ease-in-out infinite;animation-delay:${Math.random() * -10}s;`;
      container.appendChild(p);
    }
    if (!doc.getElementById('particleStyles')) {
      const style = doc.createElement('style');
      style.id = 'particleStyles';
      style.textContent = `@keyframes float-particle{0%,100%{transform:translate(0,0) scale(1);opacity:.6}25%{transform:translate(${Math.random() * 30}px,-${Math.random() * 40}px) scale(1.2);opacity:.8}50%{transform:translate(-${Math.random() * 20}px,${Math.random() * 30}px) scale(.8);opacity:.4}75%{transform:translate(${Math.random() * 25}px,${Math.random() * 20}px) scale(1.1);opacity:.7}}`;
      doc.head.appendChild(style);
    }
  }

  /* ═══════ MINI GAUGE (Landing Page) ═══════ */
  function initMiniGauge() {
    const canvas = doc.getElementById('miniGauge');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = 60, cy = 60, r = 46, value = 0.68;
    function draw(progress) {
      ctx.clearRect(0, 0, 120, 120);
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();
      const endAngle = Math.PI * 0.75 + Math.PI * 1.5 * value * progress;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, endAngle);
      const grad = ctx.createLinearGradient(0, 0, 120, 120); grad.addColorStop(0, '#E67E22'); grad.addColorStop(1, '#4FB286');
      ctx.strokeStyle = grad; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();
      ctx.fillStyle = '#1A1D21'; ctx.font = '700 22px "JetBrains Mono",monospace'; ctx.textAlign = 'center'; ctx.fillText((value * progress).toFixed(2), cx, cy + 4);
      ctx.fillStyle = '#9CA3AF'; ctx.font = '500 10px "Plus Jakarta Sans",sans-serif'; ctx.fillText('Risk Score', cx, cy + 18);
    }
    let prog = 0;
    function animate() { prog += 0.025; draw(Math.min(prog, 1)); if (prog < 1) requestAnimationFrame(animate); }
    const observer = new IntersectionObserver((entries) => { entries.forEach(e => { if (e.isIntersecting) { requestAnimationFrame(animate); observer.unobserve(canvas); } }); }, { threshold: 0.3 });
    observer.observe(canvas);
  }

  /* ═══════ MINI RAIN CHART (Landing Page) ═══════ */
  function initMiniRainChart() {
    const canvas = doc.getElementById('miniRainChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const actual = [5, 8, 7, 12, 18, 15, 11, 9, 14, 10], baseline = [7, 7, 7, 8, 10, 11, 10, 9, 9, 9], maxVal = 22;
    const pad = { t: 10, r: 10, b: 14, l: 24 }, cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    function mapX(i) { return pad.l + (i / (actual.length - 1)) * cw; }
    function mapY(v) { return pad.t + ch - (v / maxVal) * ch; }
    function drawChart(progress) {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      for (let i = 0; i <= 4; i++) { const y = pad.t + (ch / 4) * i; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); }
      ctx.setLineDash([]);
      const aData = actual.map(v => v * progress);
      ctx.beginPath(); aData.forEach((v, i) => { const x = mapX(i), y = mapY(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.lineTo(mapX(aData.length - 1), h - pad.b); ctx.lineTo(pad.l, h - pad.b); ctx.closePath();
      const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b); grad.addColorStop(0, 'rgba(31,122,90,0.2)'); grad.addColorStop(1, 'rgba(31,122,90,0)');
      ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath(); aData.forEach((v, i) => { const x = mapX(i), y = mapY(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.strokeStyle = '#1F7A5A'; ctx.lineWidth = 2; ctx.stroke();
      const bData = baseline.map(v => v * progress);
      ctx.beginPath(); bData.forEach((v, i) => { const x = mapX(i), y = mapY(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.strokeStyle = '#9CA3AF'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    let prog = 0;
    function anim() { prog += 0.03; drawChart(Math.min(prog, 1)); if (prog < 1) requestAnimationFrame(anim); }
    const observer = new IntersectionObserver((entries) => { entries.forEach(e => { if (e.isIntersecting) { requestAnimationFrame(anim); observer.unobserve(canvas); } }); }, { threshold: 0.3 });
    observer.observe(canvas);
  }

  /* ═══════ CTA EMAIL ═══════ */
  function initCtaForm() {
    const btn = doc.getElementById('ctaSubmit'), input = doc.getElementById('ctaEmail');
    if (!btn || !input) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!input.value.trim()) { input.focus(); return; }
      btn.innerHTML = '<span>✓ Request Sent</span>'; btn.style.background = '#4FB286'; input.value = '';
      setTimeout(() => { btn.innerHTML = '<span>Request Enterprise Demo</span><span class="btn-arrow-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'; btn.style.background = ''; }, 3000);
    });
  }

  /* ═══════ FOOTER YEAR ═══════ */
  function initYear() { const el = doc.getElementById('footerYear'); if (el) el.textContent = new Date().getFullYear(); }

  /* ═══════════════════════════════════════════════
     DASHBOARD PAGE — ML Integration + AI Advisory
     ═══════════════════════════════════════════════ */

  function initDashboard() {
    const shell = qs('.app-shell');
    if (!shell) return;

    // Sidebar toggle (mobile)
    const sidebar = qs('.sidebar');
    const toggle = doc.getElementById('sidebarToggle');
    if (sidebar && toggle) {
      toggle.addEventListener('click', () => sidebar.classList.toggle('is-open'));
    }

    initUploadZone();
    initRiskChart();
    initRainChart();
    initChatWidget();
    initCropRiskForecast();
    initRainfallIntelligence();
  }

  /* ─── Upload Zone with ML Integration ─── */
  function initUploadZone() {
    const zone = doc.getElementById('uploadZone');
    const input = doc.getElementById('fileInput');
    const uploadInner = doc.getElementById('uploadInner');
    const uploadPreview = doc.getElementById('uploadPreview');
    const previewImage = doc.getElementById('previewImage');
    const previewName = doc.getElementById('previewName');
    const previewSize = doc.getElementById('previewSize');
    const uploadActions = doc.getElementById('uploadActions');
    const analyzeBtn = doc.getElementById('analyzeBtn');
    const clearBtn = doc.getElementById('clearBtn');
    const uploadLoading = doc.getElementById('uploadLoading');
    const progressFill = doc.getElementById('progressFill');
    const uploadError = doc.getElementById('uploadError');
    const errorMessage = doc.getElementById('errorMessage');
    const retryBtn = doc.getElementById('retryBtn');

    if (!zone || !input) return;

    // File handling
    function handleFile(file) {
      if (!file) return;
      const valid = ['image/png', 'image/jpeg', 'image/jpg'];
      if (!valid.includes(file.type)) { toast('Please upload a PNG or JPEG image.'); return; }
      if (file.size > MAX_FILE_SIZE) { toast('File too large. Max 10 MB.'); return; }

      selectedFile = file;

      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewName.textContent = file.name;
        previewSize.textContent = formatBytes(file.size);
        uploadInner.style.display = 'none';
        uploadPreview.style.display = 'block';
        uploadActions.style.display = 'flex';
        analyzeBtn.disabled = false;
        uploadError.style.display = 'none';
        uploadLoading.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }

    input.addEventListener('change', (e) => { if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]); });

    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-dragging'); }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-dragging'); }));
    zone.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.[0]) handleFile(e.dataTransfer.files[0]); });

    // Clear button
    clearBtn.addEventListener('click', () => {
      selectedFile = null;
      input.value = '';
      previewImage.src = '';
      uploadInner.style.display = 'block';
      uploadPreview.style.display = 'none';
      uploadActions.style.display = 'none';
      uploadLoading.style.display = 'none';
      uploadError.style.display = 'none';
      analyzeBtn.disabled = true;
      hideResultCards();
    });

    // Retry button
    retryBtn.addEventListener('click', () => {
      uploadError.style.display = 'none';
      if (selectedFile) runPrediction();
    });

    // Analyze button
    analyzeBtn.addEventListener('click', () => {
      if (!selectedFile || isAnalyzing) return;
      runPrediction();
    });

    // ── Run Prediction ──
    async function runPrediction() {
      isAnalyzing = true;
      analyzeBtn.disabled = true;
      uploadActions.style.display = 'none';
      uploadError.style.display = 'none';
      uploadLoading.style.display = 'block';
      hideResultCards();
      detectionSource = 'ml';

      // Animate progress
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 90) progress = 90;
        progressFill.style.width = progress + '%';
      }, 250);

      try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const res = await fetch(PREDICT_URL, { method: 'POST', body: formData });

        clearInterval(interval);
        progressFill.style.width = '100%';

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Server error: ' + res.status);
        }

        let data = await res.json();
        lastPrediction = data;

        // ── Hybrid Detection: Puter.js Vision Fallback ──
        if (data.confidence < 0.40 && window.AgriShieldAI) {
          detectionSource = 'vision_puter';
          toast('Low confidence from ML model. Switching to AI Vision analysis…');

          try {
            // Convert file to base64 data URL for vision AI
            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(selectedFile);
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
            });

            const visionResult = await window.AgriShieldAI.analyzeImageWithVisionAI(base64);
            if (visionResult && visionResult.source !== 'failed') {
              data = {
                predicted_class: (visionResult.crop || 'Unknown') + '___' + (visionResult.disease || 'Unknown').replace(/\s+/g, '_'),
                confidence: typeof visionResult.confidence === 'number' ? visionResult.confidence : 0.70,
                top_3_predictions: [
                  { class: (visionResult.crop || 'Unknown') + '___' + (visionResult.disease || 'Unknown').replace(/\s+/g, '_'), confidence: visionResult.confidence || 0.70 },
                  { class: 'AI_Vision_Analysis', confidence: 0.0 },
                  { class: 'ML_Model_Inconclusive', confidence: data.confidence }
                ],
                vision_data: visionResult,
                source: visionResult.source
              };
              lastPrediction = data;
              detectionSource = visionResult.source;
            }
          } catch (visionErr) {
            console.error('[AgriShield] Puter Vision fallback failed:', visionErr);
            toast('AI Vision fallback failed. Using ML result.');
            detectionSource = 'ml';
          }
        }

        await new Promise(r => setTimeout(r, 400));

        uploadLoading.style.display = 'none';
        uploadActions.style.display = 'flex';
        progressFill.style.width = '0%';

        // Update all dashboard cards
        displayPredictionResults(data);

        // Sync state with global AgriShield
        if (window.AgriShield) {
          window.AgriShield.detectedDisease = data.predicted_class.replace(/_+/g, ' ');
          window.AgriShield.detectedCrop = extractPlantName(data.predicted_class);
          window.AgriShield.detectedConfidence = data.confidence;
          window.AgriShield.detectionSource = detectionSource;
        }

        // Trigger AI advisory
        generateAdvisory(data);

        // Update chat context
        updateChatContext(data);

      } catch (err) {
        clearInterval(interval);
        uploadLoading.style.display = 'none';
        uploadActions.style.display = 'flex';
        progressFill.style.width = '0%';
        errorMessage.textContent = err.message || 'Prediction service unavailable. Please try again.';
        uploadError.style.display = 'block';
      } finally {
        isAnalyzing = false;
        analyzeBtn.disabled = false;
      }
    }
  }

  /* ─── Display Prediction Results ─── */
  function displayPredictionResults(data) {
    const { predicted_class, confidence, top_3_predictions } = data;
    const confPercent = Math.round(confidence * 100);
    const plantData = getPlantData(predicted_class);
    const healthy = isHealthy(predicted_class);

    // 1️⃣ Update Confidence Display (risk score card)
    const confDisplay = doc.getElementById('confidenceDisplay');
    const riskChartWrap = doc.getElementById('riskChartWrap');
    const chartLegend = doc.getElementById('chartLegend');
    const confArc = doc.getElementById('confArc');
    const confPercentEl = doc.getElementById('confPercent');
    const confDisease = doc.getElementById('confDisease');
    const confRiskBadge = doc.getElementById('confRiskBadge');
    const riskSubtitle = doc.getElementById('riskSubtitle');
    const riskChip = doc.getElementById('riskChip');

    riskChartWrap.style.display = 'none';
    chartLegend.style.display = 'none';
    confDisplay.style.display = 'flex';
    riskSubtitle.textContent = 'Disease detection confidence from uploaded image.';
    riskChip.textContent = 'Result';

    // Animate gauge
    const totalLen = 326;
    const arcLen = (confPercent / 100) * totalLen;
    confArc.style.transition = 'stroke-dasharray 1.2s ease';
    confArc.setAttribute('stroke-dasharray', arcLen + ' ' + totalLen);

    // Animate percentage
    animateValue(confPercentEl, 0, confPercent, 1000, v => v + '%');

    // Disease name
    confDisease.textContent = predicted_class.replace(/_+/g, ' ');

    // Detection Source Badge (P5)
    let sourceBadge = doc.getElementById('detectionSourceBadge');
    if (!sourceBadge) {
      sourceBadge = doc.createElement('div');
      sourceBadge.id = 'detectionSourceBadge';
      sourceBadge.className = 'detection-source-badge';
      const confDetails = doc.querySelector('.confidence-details');
      if (confDetails) confDetails.prepend(sourceBadge);
    }
    if (detectionSource === 'gemini-vision') {
      sourceBadge.innerHTML = '✨ AI Vision Detection';
      sourceBadge.className = 'detection-source-badge vision-source';
    } else {
      sourceBadge.innerHTML = '🧠 ML Model Detection';
      sourceBadge.className = 'detection-source-badge ml-source';
    }
    sourceBadge.style.display = 'inline-flex';

    // Risk badge
    let riskClass, riskText;
    if (confPercent >= 85) { riskClass = 'low'; riskText = 'Low Risk'; }
    else if (confPercent >= 60) { riskClass = 'medium'; riskText = 'Moderate Risk'; }
    else { riskClass = 'high'; riskText = 'High Risk'; }
    confRiskBadge.className = 'risk-badge ' + riskClass;
    confRiskBadge.textContent = riskText;

    // 2️⃣ Plant Health Card
    const healthCard = doc.getElementById('plantHealthCard');
    const healthIcon = doc.getElementById('healthIcon');
    const healthLabel = doc.getElementById('healthLabel');
    const healthExplanation = doc.getElementById('healthExplanation');
    healthCard.style.display = 'flex';

    if (healthy) {
      healthCard.classList.remove('disease');
      healthIcon.textContent = '✅';
      healthLabel.textContent = 'Healthy';
      healthLabel.className = 'health-label healthy';
      healthExplanation.textContent = `Your ${plantData.displayName} plant looks healthy! Continue with regular care and monitoring.`;
    } else {
      healthCard.classList.add('disease');
      healthIcon.textContent = '⚠️';
      healthLabel.textContent = 'Disease Detected';
      healthLabel.className = 'health-label diseased';
      healthExplanation.textContent = `${predicted_class.replace(/_+/g, ' ')} detected with ${confPercent}% confidence. See AI advisory for treatment recommendations.`;
    }

    // 3️⃣ Top 3 Predictions
    const topPredCard = doc.getElementById('topPredCard');
    const top3List = doc.getElementById('top3List');
    topPredCard.style.display = 'flex';
    top3List.innerHTML = '';
    top_3_predictions.forEach((item, i) => {
      const el = doc.createElement('div');
      el.className = 'top3-item';
      el.innerHTML = `<span class="top3-rank">${i + 1}</span><span class="top3-class">${item.class.replace(/_+/g, ' ')}</span><span class="top3-conf">${(item.confidence * 100).toFixed(1)}%</span>`;
      top3List.appendChild(el);
    });

    // 4️⃣ Disease Severity Intelligence (4-tier)
    const severityCard = doc.getElementById('severityCard');
    const severityFill = doc.getElementById('severityFill');
    const severityBadge = doc.getElementById('severityBadge');
    const severityIcon = doc.getElementById('severityIcon');
    const severityText = doc.getElementById('severityText');
    const severityExplanation = doc.getElementById('severityExplanation');
    severityCard.style.display = 'flex';

    let sevLevel, sevClass, sevIconStr, sevColor, sevWidth, sevExpl;
    if (healthy || confidence < 0.40) {
      sevLevel = 'LOW'; sevClass = 'sev-low'; sevIconStr = '🟢'; sevColor = '#4FB286'; sevWidth = 15;
      sevExpl = 'Disease risk is minimal. Continue regular monitoring and preventive care.';
    } else if (confidence < 0.65) {
      sevLevel = 'MODERATE'; sevClass = 'sev-moderate'; sevIconStr = '🟡'; sevColor = '#F59E0B'; sevWidth = 42;
      sevExpl = 'Moderate disease pressure detected. Begin preventive treatment promptly.';
    } else if (confidence < 0.85) {
      sevLevel = 'HIGH'; sevClass = 'sev-high'; sevIconStr = '🟠'; sevColor = '#EA580C'; sevWidth = 72;
      sevExpl = 'High disease severity. Immediate treatment action is recommended.';
    } else {
      sevLevel = 'CRITICAL'; sevClass = 'sev-critical'; sevIconStr = '🔴'; sevColor = '#DC2626'; sevWidth = 95;
      sevExpl = 'Critical disease level. Urgent intervention required to prevent crop loss.';
    }
    severityBadge.className = 'severity-level-badge ' + sevClass;
    severityIcon.textContent = sevIconStr;
    severityText.textContent = sevLevel;
    severityExplanation.textContent = sevExpl;
    setTimeout(() => {
      severityFill.style.width = sevWidth + '%';
      severityFill.style.background = sevColor;
    }, 100);

    // 5️⃣ Plant Profile
    const profileCard = doc.getElementById('plantProfileCard');
    profileCard.style.display = 'flex';
    doc.getElementById('pfName').textContent = plantData.displayName;
    doc.getElementById('pfSciName').textContent = plantData.sciName;
    doc.getElementById('pfCommon').textContent = plantData.common;
    doc.getElementById('pfGenus').textContent = plantData.genus;
    doc.getElementById('pfFamily').textContent = plantData.family;
    doc.getElementById('pfOrder').textContent = plantData.order;
    doc.getElementById('pfClass').textContent = plantData.plantClass;

    // 6️⃣ Environment Conditions
    const envCard = doc.getElementById('envCard');
    envCard.style.display = 'flex';
    doc.getElementById('envSun').textContent = plantData.sunlight;
    doc.getElementById('envSoil').textContent = plantData.soil;
    doc.getElementById('envPH').textContent = plantData.ph;
    doc.getElementById('envTemp').textContent = plantData.temp;
    doc.getElementById('envWater').textContent = plantData.water;
    doc.getElementById('envRepot').textContent = plantData.repot;

    // 7️⃣ Pests & Diseases
    const pestsCard = doc.getElementById('pestsCard');
    pestsCard.style.display = 'flex';
    const pestList = doc.getElementById('pestList');
    const diseaseList = doc.getElementById('diseaseList');
    pestList.innerHTML = '';
    diseaseList.innerHTML = '';
    plantData.pests.forEach(p => { const li = doc.createElement('li'); li.textContent = p; pestList.appendChild(li); });
    plantData.diseases.forEach(d => { const li = doc.createElement('li'); li.textContent = d; diseaseList.appendChild(li); });

    // 8️⃣ Advisory Card (show it, content filled by generateAdvisory)
    doc.getElementById('advisoryCard').style.display = 'flex';

    // 9️⃣ Uses & Culture
    const usesCard = doc.getElementById('usesCard');
    usesCard.style.display = 'flex';
    doc.getElementById('plantUses').textContent = plantData.uses;
    doc.getElementById('plantCulture').textContent = plantData.culture;

    // Similar plants
    const similarGrid = doc.getElementById('similarPlants');
    similarGrid.innerHTML = '';
    const plantEmojis = { Tomato: '🍅', Pepper: '🌶️', Potato: '🥔', Corn: '🌽', Apple: '🍎', Grape: '🍇', Strawberry: '🍓', Peach: '🍑', Cherry: '🍒', Eggplant: '🍆', Peanut: '🥜', Lentil: '🫘', Chickpea: '🫛', Cucumber: '🥒', Melon: '🍈', Zucchini: '🥒', Pear: '🍐', Plum: '🫐', Nectarine: '🍑', Apricot: '🍑', Sorghum: '🌾', Wheat: '🌾', Rice: '🌾', Blueberry: '🫐', Raspberry: '🫐', Blackberry: '🫐', Currant: '🫐', Chili: '🌶️', 'Sweet Potato': '🍠' };
    (plantData.similar || []).forEach(name => {
      const item = doc.createElement('div');
      item.className = 'similar-plant-item';
      item.innerHTML = `<span>${plantEmojis[name] || '🌱'}</span>${name}`;
      similarGrid.appendChild(item);
    });

    // 🔟 Update Field Risk Table — add prediction as first row
    const tbody = doc.getElementById('fieldRiskBody');
    if (tbody) {
      const firstRow = tbody.querySelector('tr:first-child');
      if (firstRow) {
        const cells = firstRow.querySelectorAll('td');
        if (cells.length >= 4) {
          cells[0].textContent = 'Uploaded Crop';
          cells[1].textContent = plantData.displayName;
          cells[2].innerHTML = `<span class="risk-badge ${riskClass}">${confidence.toFixed(2)}</span>`;
          cells[3].textContent = healthy ? 'Healthy' : predicted_class.replace(/_+/g, ' ');
        }
      }
    }

    // 1️⃣1️⃣ Show Treatment, Recovery, Fertilizer cards (content filled by AI)
    doc.getElementById('treatmentCard').style.display = 'flex';
    doc.getElementById('recoveryCard').style.display = 'flex';
    doc.getElementById('fertilizerCard').style.display = 'flex';

    // Hide empty state placeholders now that we have data
    const plantEmpty = doc.getElementById('plantEmptyState');
    const treatmentEmpty = doc.getElementById('treatmentEmptyState');
    if (plantEmpty) plantEmpty.style.display = 'none';
    if (treatmentEmpty) treatmentEmpty.style.display = 'none';

    // 🔊 Announce detection result in the current UI language
    announceDetectionResult(predicted_class, confidence);
  }

  function announceDetectionResult(predictedClass, confidence) {
    if (!predictedClass) return;
    const plantName = extractPlantName(predictedClass);
    const diseaseText = predictedClass.replace(/_+/g, ' ');
    const confPercent = Math.round((confidence || 0) * 100);

    const messages = {
      en: `${plantName} detected with ${diseaseText} at ${confPercent}% confidence.`,
      hi: `${plantName} में ${diseaseText} ${confPercent}% विश्वास के साथ पता चला।`,
      te: `${plantName} పంటలో ${diseaseText} ${confPercent}% విశ్వసనీయతతో గుర్తించబడింది.`,
      ta: `${plantName} பயிரில் ${diseaseText} ${confPercent}% நம்பகத்தன்மையுடன் கண்டறியப்பட்டது.`,
      kn: `${plantName} ಬೆಳೆಯಲ್ಲಿ ${diseaseText} ${confPercent}% ವಿಶ್ವಾಸದೊಂದಿಗೆ ಪತ್ತೆಯಾಗಿದೆ.`,
      mr: `${plantName} पिकात ${diseaseText} ${confPercent}% विश्वासार्हतेसह आढळले.`,
    };

    const msg = messages[currentLang] || messages.en;
    const label = LANGUAGE_CONFIG[currentLang]?.label || 'English';
    setTimeout(() => speakAI(msg, label), 1000);
  }

  function hideResultCards() {
    const ids = ['plantHealthCard', 'topPredCard', 'severityCard', 'plantProfileCard', 'envCard', 'pestsCard', 'advisoryCard', 'usesCard', 'treatmentCard', 'recoveryCard', 'fertilizerCard'];
    ids.forEach(id => { const el = doc.getElementById(id); if (el) el.style.display = 'none'; });
    // Restore empty state placeholders
    const plantEmpty = doc.getElementById('plantEmptyState');
    const treatmentEmpty = doc.getElementById('treatmentEmptyState');
    if (plantEmpty) plantEmpty.style.display = '';
    if (treatmentEmpty) treatmentEmpty.style.display = '';
    // Reset risk chart
    const confDisplay = doc.getElementById('confidenceDisplay');
    const riskChartWrap = doc.getElementById('riskChartWrap');
    const chartLegend = doc.getElementById('chartLegend');
    if (confDisplay) confDisplay.style.display = 'none';
    if (riskChartWrap) riskChartWrap.style.display = 'block';
    if (chartLegend) chartLegend.style.display = 'flex';
    // Reset advisory
    resetAdvisory();
    resetTreatment();
    resetFertilizer();
  }

  function resetAdvisory() {
    const ph = doc.getElementById('advisoryPlaceholder');
    const ld = doc.getElementById('advisoryLoading');
    const ct = doc.getElementById('advisoryContent');
    const er = doc.getElementById('advisoryError');
    const ac = doc.getElementById('advisoryActions');
    if (ph) ph.style.display = 'block';
    if (ld) ld.style.display = 'none';
    if (ct) { ct.style.display = 'none'; ct.innerHTML = ''; }
    if (er) er.style.display = 'none';
    if (ac) ac.style.display = 'none';
  }

  function resetTreatment() {
    ['treatImmediate', 'treatOrganic', 'treatChemical', 'treatPrevention', 'treatRecovery'].forEach(id => {
      const el = doc.getElementById(id); if (el) el.textContent = '—';
    });
    const tl = doc.getElementById('treatmentLoading');
    const tb = doc.getElementById('treatmentBody');
    if (tl) tl.style.display = 'none';
    if (tb) tb.style.display = 'flex';
  }

  function resetFertilizer() {
    ['fertName', 'fertNPK', 'fertMethod', 'fertFrequency'].forEach(id => {
      const el = doc.getElementById(id); if (el) el.textContent = '—';
    });
    const fl = doc.getElementById('fertilizerLoading');
    const fb = doc.getElementById('fertilizerBody');
    if (fl) fl.style.display = 'none';
    if (fb) fb.style.display = 'flex';
  }

  function animateValue(el, start, end, duration, formatter) {
    const startTime = performance.now();
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = formatter(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  /* ─── AI Helper: Gemini backend with Smart Caching ─── */
  async function callAdvisoryAI(payload) {
    // Use the cached Gemini Advisory service if available
    if (window.GeminiAdvisory && typeof window.GeminiAdvisory.getAdvisory === 'function') {
      const advisory = await window.GeminiAdvisory.getAdvisory(
        payload.plant,
        payload.disease,
        parseFloat(payload.confidence) || 0,
        'India',
        payload.language || 'English'
      );
      if (advisory) {
        // Map the cached advisory result to the expected format
        return {
          advisory_markdown: advisory.advisoryMarkdown || '',
          immediate: advisory.immediate || (advisory.organicTreatment || []).join('. '),
          organic: (advisory.organicTreatment || []).join('. '),
          chemical: (advisory.chemicalTreatment || []).join('. '),
          prevention: (advisory.preventionTips || []).join('. '),
          recovery: advisory.recoveryTimeline || '',
          fertilizer: advisory.fertilizerRecommendation || '',
          source: advisory.source || 'cached'
        };
      }
    }

    // Fallback: direct API call
    const res = await fetch(AI_BASE + '/advisory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'AI advisory request failed');
    }
    return res.json();
  }

  async function callChatAI(payload) {
    // Use the ChatbotService if available
    if (window.ChatbotService && typeof window.ChatbotService.sendChatMessage === 'function') {
      const response = await window.ChatbotService.sendChatMessage(
        payload.message,
        payload.context ? {
          crop: payload.context.plant,
          disease: payload.context.disease,
          confidence: payload.context.confidence,
          environment: payload.context.environment
        } : {},
        payload.language || 'English'
      );
      return { response };
    }

    // Fallback: direct API call
    const res = await fetch(AI_BASE + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'AI chat request failed');
    }
    return res.json();
  }

  /* ─── Generate AI Advisory (Feature 1: Fixed + Enhanced) ─── */
  let _advisoryPending = false;
  let _lastAdvisoryDisease = null;
  async function generateAdvisory(data) {
    const { predicted_class, confidence } = data;

    // Debounce: skip if already running for the same disease
    if (_advisoryPending && _lastAdvisoryDisease === predicted_class) return;
    _advisoryPending = true;
    _lastAdvisoryDisease = predicted_class;

    const plantData = getPlantData(predicted_class);
    const ph = doc.getElementById('advisoryPlaceholder');
    const ld = doc.getElementById('advisoryLoading');
    const ct = doc.getElementById('advisoryContent');
    const er = doc.getElementById('advisoryError');
    const ac = doc.getElementById('advisoryActions');

    ph.style.display = 'none';
    ld.style.display = 'block';
    ct.style.display = 'none';
    er.style.display = 'none';
    ac.style.display = 'none';

    // Safety timeout for advisory loading
    const safetyTimer = setTimeout(() => {
      console.warn('[AgriShield] Advisory safety timeout reached');
      if (ld) ld.style.display = 'none';
      if (er) er.style.display = 'block';
      _advisoryPending = false;
    }, 20000);

    try {
      const aiPayload = {
        plant: plantData.displayName,
        disease: predicted_class.replace(/_+/g, ' '),
        confidence: (confidence * 100).toFixed(1) + '%',
        language: LANGUAGE_CONFIG[currentLang]?.label || 'English'
      };

      // Use error handler wrapper if available
      const safeCall = window.AIErrorHandler
        ? () => window.AIErrorHandler.safeAICall(
          () => callAdvisoryAI(aiPayload),
          null,
          'Advisory generation failed'
        )
        : () => callAdvisoryAI(aiPayload);

      const ai = await safeCall();
      if (!ai) throw new Error('Advisory returned null');
      lastAdvisory = ai;

      clearTimeout(safetyTimer);
      ld.style.display = 'none';

      // Prefer structured sections if backend provided them
      const sections = [];
      if (ai.explanation) sections.push('### Disease Explanation\n' + ai.explanation);
      if (ai.causes) sections.push('### Causes\n' + ai.causes);
      if (ai.immediate) sections.push('### Immediate Treatment\n' + ai.immediate);
      if (ai.organic) sections.push('### Organic Remedy\n' + ai.organic);
      if (ai.chemical) sections.push('### Chemical Treatment\n' + ai.chemical);
      if (ai.prevention) sections.push('### Prevention\n' + ai.prevention);
      if (ai.recovery) sections.push('### Recovery Timeline\n' + ai.recovery);
      if (ai.fertilizer) sections.push('### Recommended Fertilizer\n' + ai.fertilizer);

      const advisoryMarkdown = sections.length ? sections.join('\n\n') : (ai.advisory_markdown || 'AI advisory could not be generated.');
      ct.innerHTML = renderMarkdown(advisoryMarkdown);
      ct.style.display = 'block';
      ac.style.display = 'flex';
    } catch (err) {
      console.error('AI Advisory failed:', err);
      clearTimeout(safetyTimer);
      ld.style.display = 'none';
      if (er) {
        er.style.display = 'block';
      }
    } finally {
      _advisoryPending = false;
    }

    // Also populate Treatment Plan, Recovery Timeline, and Fertilizer panels
    generateTreatmentPlan(data);
    generateRecoveryTimeline(data);
    generateFertilizerPlan(data);
  }

  /* ─── Feature 3: Treatment Recommendation Engine ─── */
  async function generateTreatmentPlan(data) {
    const treatBody = doc.getElementById('treatmentBody');
    const treatLoading = doc.getElementById('treatmentLoading');

    treatBody.style.display = 'none';
    treatLoading.style.display = 'block';

    try {
      const src = lastAdvisory || {};
      treatLoading.style.display = 'none';
      treatBody.style.display = 'flex';
      doc.getElementById('treatImmediate').textContent = src.immediate || 'Apply appropriate fungicide/bactericide treatment immediately.';
      doc.getElementById('treatOrganic').textContent = src.organic || 'Use neem oil spray or garlic + chili extract solution.';
      doc.getElementById('treatChemical').textContent = src.chemical || 'Consult local agricultural extension for specific chemical recommendations.';
      doc.getElementById('treatPrevention').textContent = src.prevention || 'Maintain proper spacing, avoid overhead watering, ensure good airflow.';
      doc.getElementById('treatRecovery').textContent = src.recovery || '7–14 days with proper treatment.';
    } catch (err) {
      console.error('Treatment plan failed:', err);
      treatLoading.style.display = 'none';
      treatBody.style.display = 'flex';
    }
  }

  /* ─── Feature 5: Crop Recovery Timeline ─── */
  async function generateRecoveryTimeline(data) {
    const { predicted_class, confidence } = data;
    const plantData = getPlantData(predicted_class);
    const healthy = isHealthy(predicted_class);

    const recoveryDays = doc.getElementById('recoveryDays');
    const timelineDetection = doc.getElementById('timelineDetection');
    const timelineTreatment = doc.getElementById('timelineTreatment');
    const timelineRecovery = doc.getElementById('timelineRecovery');
    const step2 = doc.getElementById('timelineStep2');
    const step3 = doc.getElementById('timelineStep3');

    if (healthy) {
      recoveryDays.textContent = 'N/A';
      timelineDetection.textContent = `${plantData.displayName} identified as healthy`;
      timelineTreatment.textContent = 'No treatment needed';
      timelineRecovery.textContent = 'Plant is in good health';
      step2.classList.add('completed');
      step3.classList.add('completed');
    } else {
      // Estimate recovery based on confidence
      let minDays, maxDays;
      if (confidence >= 0.85) { minDays = 14; maxDays = 21; }
      else if (confidence >= 0.65) { minDays = 10; maxDays = 14; }
      else if (confidence >= 0.40) { minDays = 7; maxDays = 10; }
      else { minDays = 5; maxDays = 7; }

      recoveryDays.textContent = `${minDays} – ${maxDays} days`;
      timelineDetection.textContent = `${predicted_class.replace(/_+/g, ' ')} detected on ${new Date().toLocaleDateString()}`;
      timelineTreatment.textContent = 'Begin recommended treatment immediately';
      timelineRecovery.textContent = `Full recovery expected within ${maxDays} days`;

      // Animate timeline steps
      setTimeout(() => step2.classList.add('active'), 600);
      setTimeout(() => step3.classList.add('active'), 1200);
    }
  }

  /* ─── Feature 8: AI Crop Risk Forecast (7-Day) ─── */
  async function initCropRiskForecast() {
    const forecastCard = doc.getElementById('cropRiskForecastCard');
    if (!forecastCard) return;
    forecastCard.style.display = 'flex';

    // Fetch 7-day weather data from OpenWeatherMap (or simulate if no API key)
    let weatherData;
    try {
      // Try OpenWeatherMap API (user can set their own key)
      const OWM_KEY = localStorage.getItem('owm_api_key') || '';
      if (OWM_KEY) {
        const lat = localStorage.getItem('farm_lat') || '17.3850';
        const lon = localStorage.getItem('farm_lon') || '78.4867';
        const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric&cnt=56`);
        if (weatherRes.ok) {
          const weatherJson = await weatherRes.json();
          // Group by day (take one reading per day)
          const dailyMap = {};
          weatherJson.list.forEach(item => {
            const day = item.dt_txt.split(' ')[0];
            if (!dailyMap[day]) {
              dailyMap[day] = {
                temp: item.main.temp,
                humidity: item.main.humidity,
                rainfall: (item.rain && item.rain['3h']) || 0,
                windSpeed: item.wind.speed * 3.6 // m/s to km/h
              };
            }
          });
          weatherData = Object.values(dailyMap).slice(0, 7);
        }
      }
    } catch { /* fallback */ }

    // Fallback: simulated weather
    if (!weatherData || weatherData.length < 7) {
      weatherData = [
        { temp: 28, humidity: 65, rainfall: 2, windSpeed: 12 },
        { temp: 30, humidity: 72, rainfall: 8, windSpeed: 10 },
        { temp: 27, humidity: 78, rainfall: 15, windSpeed: 8 },
        { temp: 26, humidity: 82, rainfall: 20, windSpeed: 15 },
        { temp: 29, humidity: 68, rainfall: 5, windSpeed: 11 },
        { temp: 31, humidity: 55, rainfall: 0, windSpeed: 18 },
        { temp: 28, humidity: 60, rainfall: 3, windSpeed: 14 }
      ];
    }

    // Local risk score calculation (no AI call needed for the chart)
    const forecast = weatherData.map((d, i) => {
      let score = 0;
      const threats = [];
      // Fungal risk: high humidity + moderate temp
      if (d.humidity > 70 && d.temp >= 20 && d.temp <= 30) { score += 0.35; threats.push('Fungal disease risk'); }
      // Leaf disease: heavy rainfall
      if (d.rainfall > 15) { score += 0.30; threats.push('Leaf disease risk'); }
      else if (d.rainfall > 8) { score += 0.15; threats.push('Moderate rain'); }
      // Pest risk: hot + dry
      if (d.temp > 35 && d.humidity < 30) { score += 0.25; threats.push('Pest risk'); }
      // Wind damage
      if (d.windSpeed > 30) { score += 0.15; threats.push('Wind damage risk'); }
      // Base risk
      score = Math.min(1, score + 0.1);
      let risk;
      if (score < 0.3) risk = 'Low';
      else if (score < 0.55) risk = 'Moderate';
      else if (score < 0.75) risk = 'High';
      else risk = 'Critical';
      return { day: i + 1, risk, score: parseFloat(score.toFixed(2)), threats, weather: d };
    });

    // Render the 7-day forecast
    const forecastBody = doc.getElementById('forecastBody');
    if (forecastBody) {
      forecastBody.innerHTML = '';
      const riskColors = { Low: '#4FB286', Moderate: '#F59E0B', High: '#EA580C', Critical: '#DC2626' };
      forecast.forEach(f => {
        const dayName = new Date(Date.now() + (f.day - 1) * 86400000).toLocaleDateString(undefined, { weekday: 'short' });
        const el = doc.createElement('div');
        el.className = 'forecast-day';
        el.innerHTML = `
          <span class="forecast-day-label">${dayName}</span>
          <div class="forecast-bar-track"><div class="forecast-bar-fill" style="width:${f.score * 100}%;background:${riskColors[f.risk]}"></div></div>
          <span class="forecast-risk-label" style="color:${riskColors[f.risk]}">${f.risk}</span>
        `;
        el.title = f.threats.join(', ') || 'Normal conditions';
        forecastBody.appendChild(el);
      });
    }

    // Get AI explanation via Puter.js (primary) with Gemini fallback
    const forecastExplanation = doc.getElementById('forecastExplanation');
    if (forecastExplanation) {
      try {
        let aiData = null;
        // Try Puter.js first
        if (window.AgriShieldAI) {
          aiData = await window.AgriShieldAI.generateRiskForecastAI(
            weatherData,
            lastPrediction ? extractPlantName(lastPrediction.predicted_class) : 'General crops',
            currentLang
          );
        }
        // Gemini fallback
        if (!aiData) {
          const aiRes = await fetch(AI_BASE + '/risk-forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              weatherData,
              crop: lastPrediction ? extractPlantName(lastPrediction.predicted_class) : 'General crops',
              language: LANGUAGE_CONFIG[currentLang]?.label || 'English'
            })
          });
          if (aiRes.ok) aiData = await aiRes.json();
        }
        if (aiData) {
          forecastExplanation.textContent = (aiData.summary || '') + ' ' + (aiData.recommendation || '');
          forecastExplanation.style.display = 'block';
        }
      } catch {
        forecastExplanation.textContent = 'Risk forecast AI explanation unavailable.';
        forecastExplanation.style.display = 'block';
      }
    }
  }

  /* ─── Feature 9: Rainfall Intelligence ─── */
  async function initRainfallIntelligence() {
    const rainfallIntelCard = doc.getElementById('rainfallIntelCard');
    if (!rainfallIntelCard) return;

    // Simulated current and historical rainfall data
    const currentRainfall = 112;
    const historicalAverage = 98;
    const anomalyPercent = (((currentRainfall - historicalAverage) / historicalAverage) * 100).toFixed(1);

    const anomalyDisplay = doc.getElementById('rainfallAnomaly');
    const anomalyMessage = doc.getElementById('rainfallAnomalyMsg');
    const rainfallAdvisory = doc.getElementById('rainfallAdvisory');

    if (anomalyDisplay) {
      anomalyDisplay.textContent = (anomalyPercent > 0 ? '+' : '') + anomalyPercent + '%';
      anomalyDisplay.className = 'rainfall-anomaly-value ' + (anomalyPercent > 10 ? 'anomaly-high' : anomalyPercent > 0 ? 'anomaly-moderate' : 'anomaly-low');
    }
    if (anomalyMessage) {
      anomalyMessage.textContent = `Rainfall anomaly detected: ${anomalyPercent > 0 ? '+' : ''}${anomalyPercent}% ${anomalyPercent > 0 ? 'above' : 'below'} seasonal average. Current: ${currentRainfall}mm, Historical: ${historicalAverage}mm.`;
    }

    rainfallIntelCard.style.display = 'flex';

    // Get AI advisory via Puter.js (primary) with Gemini fallback
    if (rainfallAdvisory) {
      try {
        let aiData = null;
        // Try Puter.js first
        if (window.AgriShieldAI) {
          aiData = await window.AgriShieldAI.generateRainfallAI(
            currentRainfall, historicalAverage, 'Telangana', currentLang
          );
        }
        // Gemini fallback
        if (!aiData) {
          const aiRes = await fetch(AI_BASE + '/rainfall-intelligence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              currentRainfall,
              historicalAverage,
              region: 'Telangana',
              language: LANGUAGE_CONFIG[currentLang]?.label || 'English'
            })
          });
          if (aiRes.ok) aiData = await aiRes.json();
        }
        if (aiData) {
          rainfallAdvisory.textContent = aiData.advisory || 'Monitor rainfall patterns.';
          if (aiData.action_items && aiData.action_items.length) {
            const list = doc.createElement('ul');
            list.className = 'rainfall-actions-list';
            aiData.action_items.forEach(item => {
              const li = doc.createElement('li');
              li.textContent = item;
              list.appendChild(li);
            });
            rainfallAdvisory.appendChild(list);
          }
        }
      } catch {
        rainfallAdvisory.textContent = 'AI rainfall advisory unavailable.';
      }
      rainfallAdvisory.style.display = 'block';
    }
  }

  /* ─── Feature 10: Enhanced Fertilizer with AI ─── */
  let _fertilizerPending = false;
  async function generateFertilizerPlan(data) {
    const fertBody = doc.getElementById('fertilizerBody');
    const fertLoading = doc.getElementById('fertilizerLoading');

    if (!fertBody || !fertLoading) return;

    // Prevent duplicate concurrent calls
    if (_fertilizerPending) return;
    _fertilizerPending = true;

    // ── STRATEGY: Use advisory data first (no extra API call) ──
    // The advisory already includes fertilizer info. Only call the
    // separate /fertilizer-plan endpoint if advisory data is missing.
    if (lastAdvisory && lastAdvisory.fertilizer) {
      fertBody.style.display = 'flex';
      fertLoading.style.display = 'none';
      _applyFertilizerFromAdvisory(lastAdvisory);
      _fertilizerPending = false;
      return;
    }

    fertBody.style.display = 'none';
    fertLoading.style.display = 'block';

    // Safety timeout — 8s max, then show fallback
    const safetyTimer = setTimeout(() => {
      console.warn('[AgriShield] Fertilizer safety timeout reached');
      fertLoading.style.display = 'none';
      fertBody.style.display = 'flex';
      _applyFertilizerFallback();
      _fertilizerPending = false;
    }, 8000);

    try {
      const plantData = getPlantData(data.predicted_class);
      const langLabel = LANGUAGE_CONFIG[currentLang]?.label || 'English';
      let fertData = null;

      // Try the AI server endpoint (with a tight 6s timeout)
      try {
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 6000);
        const aiRes = await fetch(AI_BASE + '/fertilizer-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plant: plantData.displayName,
            disease: data.predicted_class.replace(/_+/g, ' '),
            confidence: (data.confidence * 100).toFixed(1) + '%',
            soilType: plantData.soil,
            language: langLabel
          }),
          signal: controller.signal
        });
        clearTimeout(fetchTimeout);
        if (aiRes.ok) fertData = await aiRes.json();
      } catch { /* fallback below */ }

      clearTimeout(safetyTimer);
      fertLoading.style.display = 'none';
      fertBody.style.display = 'flex';

      if (fertData) {
        doc.getElementById('fertName').textContent = fertData.fertilizer_name || 'Balanced NPK fertilizer';
        doc.getElementById('fertNPK').textContent = fertData.npk_ratio || '10-10-10';
        doc.getElementById('fertMethod').textContent = fertData.application_method || 'Apply near root zone.';
        doc.getElementById('fertFrequency').textContent = fertData.frequency || 'Every 2–3 weeks.';

        const fertRecoveryRow = doc.getElementById('fertRecoveryRow');
        const fertRecovery = doc.getElementById('fertRecoveryHelp');
        if (fertRecovery && fertData.disease_recovery_help) {
          fertRecovery.textContent = fertData.disease_recovery_help;
          fertRecovery.style.display = 'block';
          if (fertRecoveryRow) fertRecoveryRow.style.display = '';
        }
      } else {
        _applyFertilizerFallback();
      }
    } catch (err) {
      console.error('[AgriShield] Fertilizer plan failed:', err);
      clearTimeout(safetyTimer);
      fertLoading.style.display = 'none';
      fertBody.style.display = 'flex';
      _applyFertilizerFallback();
    } finally {
      _fertilizerPending = false;
    }
  }

  /** Parse fertilizer info from the advisory response text */
  function _applyFertilizerFromAdvisory(advisory) {
    const fertName = doc.getElementById('fertName');
    const fertNPK = doc.getElementById('fertNPK');
    const fertMethod = doc.getElementById('fertMethod');
    const fertFrequency = doc.getElementById('fertFrequency');

    // Advisory may have structured fertilizer text
    const fertText = advisory.fertilizer || '';
    if (fertName) fertName.textContent = fertText || 'Balanced NPK fertilizer';
    if (fertNPK) fertNPK.textContent = advisory.npk || '10-10-10';
    if (fertMethod) fertMethod.textContent = advisory.method || 'Apply near root zone.';
    if (fertFrequency) fertFrequency.textContent = advisory.frequency || 'Every 2–3 weeks.';
  }

  function _applyFertilizerFallback() {
    const src = lastAdvisory || {};
    const fertName = doc.getElementById('fertName');
    const fertNPK = doc.getElementById('fertNPK');
    const fertMethod = doc.getElementById('fertMethod');
    const fertFrequency = doc.getElementById('fertFrequency');
    if (fertName) fertName.textContent = src.fertilizer || 'Balanced NPK fertilizer';
    if (fertNPK) fertNPK.textContent = src.npk || '10-10-10';
    if (fertMethod) fertMethod.textContent = src.method || 'Apply near root zone, avoid direct stem contact.';
    if (fertFrequency) fertFrequency.textContent = src.frequency || 'Every 2–3 weeks.';
  }

  /* ─── Advisory Copy & Download ─── */
  doc.addEventListener('click', (e) => {
    if (e.target.closest('#copyAdvisoryBtn')) {
      const text = doc.getElementById('advisoryContent')?.innerText;
      if (text) navigator.clipboard.writeText(text).then(() => toast('Advisory copied!')).catch(() => toast('Copy failed.'));
    }
    if (e.target.closest('#downloadAdvisoryBtn')) {
      const text = doc.getElementById('advisoryContent')?.innerText;
      if (!text) return;
      const header = `AgriShield AI — Crop Disease Advisory\n${'='.repeat(40)}\nDate: ${new Date().toLocaleString()}\nDisease: ${lastPrediction?.predicted_class || 'Unknown'}\nConfidence: ${lastPrediction ? (lastPrediction.confidence * 100).toFixed(1) + '%' : 'N/A'}\n${'='.repeat(40)}\n\n`;
      const blob = new Blob([header + text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a'); a.href = url; a.download = `agrishield-advisory-${Date.now()}.txt`;
      doc.body.appendChild(a); a.click(); doc.body.removeChild(a); URL.revokeObjectURL(url);
      toast('Advisory downloaded!');
    }
  });

  /* ─── Risk Chart ─── */
  function initRiskChart() {
    const canvas = doc.getElementById('riskChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const disease = [0.52, 0.56, 0.61, 0.72, 0.68, 0.63, 0.59];
    const weather = [0.35, 0.39, 0.42, 0.51, 0.55, 0.49, 0.46];
    const pad = { t: 20, r: 18, b: 26, l: 28 }, w = canvas.width, h = canvas.height;
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    function my(v) { return h - pad.b - v * ch; }
    function mx(i) { return pad.l + (i / (labels.length - 1)) * cw; }
    function drawGrid() {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      for (let i = 0; i <= 5; i++) { const y = pad.t + (ch / 5) * i; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.font = '10px "Plus Jakarta Sans",sans-serif'; ctx.fillStyle = '#9CA3AF';
      labels.forEach((l, i) => ctx.fillText(l, mx(i) - 8, h - 10));
    }
    function drawLine(data, color) { ctx.beginPath(); data.forEach((v, i) => { i === 0 ? ctx.moveTo(mx(i), my(v)) : ctx.lineTo(mx(i), my(v)); }); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }
    function drawArea(data, color) {
      const g = ctx.createLinearGradient(0, pad.t, 0, h - pad.b); g.addColorStop(0, color.replace('1)', '0.2)')); g.addColorStop(1, color.replace('1)', '0)'));
      ctx.beginPath(); data.forEach((v, i) => { i === 0 ? ctx.moveTo(mx(i), my(v)) : ctx.lineTo(mx(i), my(v)); }); ctx.lineTo(mx(data.length - 1), h - pad.b); ctx.lineTo(pad.l, h - pad.b); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    }
    let p = 0;
    function animate() {
      p += 0.04; const e = 1 - Math.pow(1 - Math.min(p, 1), 3);
      drawGrid(); drawArea(disease.map(v => v * e), 'rgba(239,68,68,1)'); drawLine(disease.map(v => v * e), '#EF4444'); drawLine(weather.map(v => v * e), '#F59E0B');
      if (p < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  /* ─── Rain Chart ─── */
  function initRainChart() {
    const canvas = doc.getElementById('rainChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const actual = [5, 8, 7, 12, 18, 15, 11, 9, 14, 10], baseline = [7, 7, 7, 8, 10, 11, 10, 9, 9, 9];
    const pad = { t: 18, r: 12, b: 26, l: 32 }, w = canvas.width, h = canvas.height;
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b, maxV = 22;
    function my(v) { return h - pad.b - (v / maxV) * ch; }
    function mx(i) { return pad.l + (i / (actual.length - 1)) * cw; }
    function draw(progress) {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      for (let i = 0; i <= 4; i++) { const y = pad.t + (ch / 4) * i; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); }
      ctx.setLineDash([]);
      const aD = actual.map(v => v * progress);
      ctx.beginPath(); aD.forEach((v, i) => { i === 0 ? ctx.moveTo(mx(i), my(v)) : ctx.lineTo(mx(i), my(v)); }); ctx.lineTo(mx(aD.length - 1), h - pad.b); ctx.lineTo(pad.l, h - pad.b); ctx.closePath();
      const g = ctx.createLinearGradient(0, pad.t, 0, h - pad.b); g.addColorStop(0, 'rgba(31,122,90,0.3)'); g.addColorStop(1, 'rgba(31,122,90,0)'); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); aD.forEach((v, i) => { i === 0 ? ctx.moveTo(mx(i), my(v)) : ctx.lineTo(mx(i), my(v)); }); ctx.strokeStyle = '#1F7A5A'; ctx.lineWidth = 2; ctx.stroke();
      const bD = baseline.map(v => v * progress);
      ctx.beginPath(); bD.forEach((v, i) => { i === 0 ? ctx.moveTo(mx(i), my(v)) : ctx.lineTo(mx(i), my(v)); }); ctx.strokeStyle = '#9CA3AF'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '10px "Plus Jakarta Sans",sans-serif'; ctx.fillStyle = '#9CA3AF';
      actual.forEach((_, i) => ctx.fillText(String(i + 1), mx(i) - 3, h - 10));
    }
    let p = 0;
    function animate() { p += 0.04; draw(Math.min(p, 1)); if (p < 1) requestAnimationFrame(animate); }
    requestAnimationFrame(animate);
  }

  /* ─── Feature 2: Context-Aware Agronomy Chatbot + Feature 7: Voice Assistant ─── */
  function initChatWidget() {
    const widget = doc.getElementById('chatWidget');
    const toggle = doc.getElementById('chatToggle');
    const form = doc.getElementById('chatForm');
    const input = doc.getElementById('chatInput');
    const body = doc.getElementById('chatBody');
    const voiceBtn = doc.getElementById('voiceBtn');
    const voiceToggle = doc.getElementById('voiceToggle');
    if (!widget || !toggle || !form || !input || !body) return;

    toggle.addEventListener('click', () => {
      widget.classList.toggle('is-open');
      if (widget.classList.contains('is-open')) setTimeout(() => input.focus(), 200);
    });

    // ── Feature 7: Voice Assistant (SpeechRecognition) ──
    let recognition = null;
    let isRecording = false;

    // Listening animation helpers
    function showListeningAnimation() {
      if (!voiceBtn) return;
      voiceBtn.classList.add('recording');
      voiceBtn.innerHTML = '<span class="listening-pulse"></span>🎤';
      // Add listening indicator above chat
      let indicator = doc.getElementById('listeningIndicator');
      if (!indicator) {
        indicator = doc.createElement('div');
        indicator.id = 'listeningIndicator';
        indicator.className = 'listening-indicator';
        indicator.innerHTML = `
          <div class="listening-waves">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <p>🎤 Listening...</p>
        `;
        const chatBody = doc.getElementById('chatBody');
        if (chatBody) chatBody.appendChild(indicator);
      }
      indicator.style.display = 'flex';
      // Scroll to bottom
      const chatBody = doc.getElementById('chatBody');
      if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
    }

    function hideListeningAnimation() {
      if (!voiceBtn) return;
      voiceBtn.classList.remove('recording');
      voiceBtn.textContent = '🎤';
      const indicator = doc.getElementById('listeningIndicator');
      if (indicator) indicator.style.display = 'none';
    }

    if (voiceBtn && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.lang = LANGUAGE_CONFIG[currentLang]?.locale || 'en-US';
      window._agriRecognition = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        isRecording = true;
        showListeningAnimation();
        toast('Listening… Speak your question.');
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        input.value = transcript;
        toast('Voice captured!');
        hideListeningAnimation();
        // Auto-submit
        form.dispatchEvent(new Event('submit'));
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        hideListeningAnimation();
        if (event.error === 'not-allowed') {
          toast('Microphone access denied. Please allow mic permissions.');
        } else {
          toast('Could not recognize speech. Try again.');
        }
      };

      recognition.onend = () => {
        isRecording = false;
        hideListeningAnimation();
      };

      voiceBtn.addEventListener('click', () => {
        if (isRecording) {
          recognition.stop();
        } else {
          recognition.lang = LANGUAGE_CONFIG[currentLang]?.locale || 'en-US';
          recognition.start();
        }
      });
    } else if (voiceBtn) {
      // Browser doesn't support speech recognition
      voiceBtn.title = 'Speech recognition not supported in this browser';
      voiceBtn.style.opacity = '0.4';
      voiceBtn.style.cursor = 'not-allowed';
    }

    // ── Voice output toggle (TTS mute/unmute) ──
    if (voiceToggle) {
      const applyVoiceUi = () => {
        voiceToggle.textContent = voiceEnabled ? '🔊' : '🔇';
        voiceToggle.classList.toggle('muted', !voiceEnabled);
      };
      applyVoiceUi();
      voiceToggle.addEventListener('click', () => {
        voiceEnabled = !voiceEnabled;
        applyVoiceUi();
        try {
          localStorage.setItem('agrishield_voice_muted', String(!voiceEnabled));
        } catch { /* ignore */ }
        if (!voiceEnabled && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      });
    }

    // ── Chat Submit Handler ──
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) return;

      appendMsg(val, 'user', body);
      input.value = '';

      // If we have a prediction, use AI with full context
      if (lastPrediction) {
        appendMsg('Thinking…', 'ai-loading', body);

        try {
          const plantData = getPlantData(lastPrediction.predicted_class);
          const context = {
            plant: plantData.displayName,
            disease: lastPrediction.predicted_class.replace(/_+/g, ' '),
            confidence: (lastPrediction.confidence * 100).toFixed(1) + '%',
            environment: `Sunlight ${plantData.sunlight}, Soil ${plantData.soil}, pH ${plantData.ph}, Temp ${plantData.temp}, Water ${plantData.water}`
          };

          const { response } = await callChatAI({
            message: val,
            context,
            language: LANGUAGE_CONFIG[currentLang]?.label || 'English'
          });

          const loadingMsg = body.querySelector('.chat-message-loading');
          if (loadingMsg) loadingMsg.remove();

          const text = (response && response.trim()) || "I'm having trouble processing that. Please try rephrasing your question.";
          appendMsg(text, 'ai', body);
        } catch (err) {
          console.error('Chat AI error:', err);
          const loadingMsg = body.querySelector('.chat-message-loading');
          if (loadingMsg) loadingMsg.remove();
          appendMsg("I'm sorry, I couldn't process that right now. Please try again.", 'ai', body);
        }
      } else {
        // No prediction yet
        setTimeout(() => {
          appendMsg("Upload a crop image first so I can provide disease-specific guidance! I'll analyze results and answer your questions with AI-powered recommendations.", 'ai', body);
        }, 500);
      }
    });
  }

  function appendMsg(text, type, container) {
    const div = doc.createElement('div');
    if (type === 'ai-loading') {
      div.className = 'chat-message chat-message-ai chat-message-loading';
      div.innerHTML = '<em>Thinking…</em>';
    } else {
      div.className = 'chat-message ' + (type === 'user' ? 'chat-message-user' : 'chat-message-ai');
      div.textContent = text;
      if (type === 'ai' && text && voiceEnabled) {
        // Always use browser speech synthesis with language-specific voice
        const label = LANGUAGE_CONFIG[currentLang]?.label || 'English';
        speakAI(text, label);
      }
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function updateChatContext(data) {
    const chatContext = doc.getElementById('chatContext');
    if (chatContext && data) {
      chatContext.textContent = `Context: ${data.predicted_class.replace(/_+/g, ' ')} (${(data.confidence * 100).toFixed(0)}%)`;
    }
  }

  /* ═══════ INIT ═══════ */
  doc.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initSidebar();
    initLanguage();
    initStickyCta();
    initCounters();
    initReveal();
    initParticles();
    initMiniGauge();
    initMiniRainChart();
    initCtaForm();
    initYear();
    initDashboard();
  });
})();
