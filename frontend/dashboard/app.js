/* ================================================================
   AgriShield AI — Dashboard Application Logic
   Pure Vanilla JS · No frameworks · Production ready
   ================================================================ */

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────
  const API_BASE = 'http://127.0.0.1:8000';
  const PREDICT_URL = `${API_BASE}/predict`;
  const HEALTH_URL = `${API_BASE}/health`;
  const INSURANCE_URL = `${API_BASE}/admin/run-rainfall-monitor`;
  const PUTER_JS_URL = 'https://js.puter.com/v2/';
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  // ── State ───────────────────────────────────────────────────
  let selectedFile = null;
  let isAnalyzing = false;
  let lastPrediction = null;
  let puterLoaded = false;

  // ── DOM References ──────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const sidebar = $('#sidebar');
  const sidebarOverlay = $('#sidebarOverlay');
  const sidebarClose = $('#sidebarClose');
  const hamburgerBtn = $('#hamburgerBtn');
  const uploadZone = $('#uploadZone');
  const fileInput = $('#fileInput');
  const previewArea = $('#previewArea');
  const previewImage = $('#previewImage');
  const fileName = $('#fileName');
  const fileSize = $('#fileSize');
  const analyzeBtn = $('#analyzeBtn');
  const clearBtn = $('#clearBtn');
  const progressArea = $('#progressArea');
  const progressBar = $('#progressBar');
  const errorCard = $('#errorCard');
  const errorDesc = $('#errorDesc');
  const errorRetry = $('#errorRetry');
  const resultCard = $('#resultCard');
  const riskBadge = $('#riskBadge');
  const riskLabel = $('#riskLabel');
  const gaugeArc = $('#gaugeArc');
  const gaugeValue = $('#gaugeValue');
  const diseaseName = $('#diseaseName');
  const top3List = $('#top3List');
  const severityBar = $('#severityBar');
  const insuranceBtn = $('#insuranceBtn');
  const healthBadge = $('#healthBadge');
  const advisoryPlaceholder = $('#advisoryPlaceholder');
  const typingIndicator = $('#typingIndicator');
  const advisoryContent = $('#advisoryContent');
  const advisoryError = $('#advisoryError');
  const advisoryActions = $('#advisoryActions');
  const copyAdvisory = $('#copyAdvisory');
  const downloadAdvisory = $('#downloadAdvisory');

  // ── Utility Functions ───────────────────────────────────────

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function toast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  // ── Compress Image Before Upload ────────────────────────────
  function compressImage(file, maxWidth = 1024) {
    return new Promise((resolve) => {
      // If file is small enough, skip compression
      if (file.size < 500 * 1024) {
        resolve(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width;
          let h = img.height;

          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }

          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          canvas.toBlob(
            (blob) => {
              const compressed = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressed);
            },
            'image/jpeg',
            0.85
          );
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Health Check ────────────────────────────────────────────
  async function checkHealth() {
    try {
      const res = await fetch(HEALTH_URL, { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        healthBadge.classList.remove('offline');
        healthBadge.querySelector('span:last-child').textContent = 'System Online';
      } else {
        throw new Error('unhealthy');
      }
    } catch {
      healthBadge.classList.add('offline');
      healthBadge.querySelector('span:last-child').textContent = 'System Offline';
    }
  }

  // ── Sidebar ─────────────────────────────────────────────────
  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  hamburgerBtn.addEventListener('click', openSidebar);
  sidebarClose.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  // ── File Selection & Drag-Drop ──────────────────────────────
  uploadZone.addEventListener('click', () => fileInput.click());

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
  });

  function handleFile(file) {
    // Validate type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast('Please upload a PNG or JPEG image.');
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      toast('File too large. Max 10 MB allowed.');
      return;
    }

    selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      fileName.textContent = file.name;
      fileSize.textContent = formatBytes(file.size);
      show(previewArea);
      hide(uploadZone);
      analyzeBtn.disabled = false;

      // Reset previous results
      hide(resultCard);
      hide(errorCard);
      resetAdvisory();
    };
    reader.readAsDataURL(file);
  }

  // ── Clear ───────────────────────────────────────────────────
  clearBtn.addEventListener('click', resetUpload);

  function resetUpload() {
    selectedFile = null;
    fileInput.value = '';
    previewImage.src = '';
    hide(previewArea);
    hide(progressArea);
    hide(resultCard);
    hide(errorCard);
    show(uploadZone);
    analyzeBtn.disabled = true;
    isAnalyzing = false;
    resetAdvisory();
  }

  function resetAdvisory() {
    show(advisoryPlaceholder);
    hide(typingIndicator);
    hide(advisoryContent);
    hide(advisoryError);
    hide(advisoryActions);
    advisoryContent.innerHTML = '';
  }

  // ── Analyze ─────────────────────────────────────────────────
  const handleAnalyze = debounce(async () => {
    if (!selectedFile || isAnalyzing) return;
    isAnalyzing = true;
    analyzeBtn.disabled = true;

    // Show progress
    hide(previewArea);
    hide(errorCard);
    hide(resultCard);
    show(progressArea);
    resetAdvisory();

    // Animate progress bar
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 12;
      if (progress > 90) progress = 90;
      progressBar.style.width = progress + '%';
    }, 300);

    try {
      // Compress image
      const compressed = await compressImage(selectedFile);

      // Build form data
      const formData = new FormData();
      formData.append('file', compressed);

      // Send to backend
      const res = await fetch(PREDICT_URL, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      progressBar.style.width = '100%';

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error: ${res.status}`);
      }

      const data = await res.json();
      lastPrediction = data;

      // Short delay for UX
      await new Promise((r) => setTimeout(r, 400));

      hide(progressArea);
      progressBar.style.width = '0%';
      displayResult(data);

      // Trigger AI advisory
      generateAdvisory(data);
    } catch (err) {
      clearInterval(progressInterval);
      hide(progressArea);
      progressBar.style.width = '0%';
      showError(err.message);
    } finally {
      isAnalyzing = false;
    }
  }, 500);

  analyzeBtn.addEventListener('click', handleAnalyze);

  // ── Display Result ──────────────────────────────────────────
  function displayResult(data) {
    const { predicted_class, confidence, top_3_predictions } = data;
    const confPercent = Math.round(confidence * 100);

    // Disease name
    diseaseName.textContent = predicted_class.replace(/_/g, ' ');

    // Gauge animation
    const arcLength = 251.3;
    const dashValue = (confPercent / 100) * arcLength;
    gaugeArc.style.transition = 'stroke-dasharray 1.2s ease';
    gaugeArc.setAttribute('stroke-dasharray', `${dashValue} ${arcLength}`);

    // Animate value
    animateValue(gaugeValue, 0, confPercent, 1200, (v) => v + '%');

    // Risk badge
    let riskClass, riskText;
    if (confPercent >= 85) {
      riskClass = 'low';
      riskText = 'Low Risk';
    } else if (confPercent >= 60) {
      riskClass = 'moderate';
      riskText = 'Moderate Risk';
    } else {
      riskClass = 'high';
      riskText = 'High Risk';
    }
    riskBadge.className = 'risk-badge ' + riskClass;
    riskLabel.textContent = riskText;

    // Top 3
    top3List.innerHTML = '';
    top_3_predictions.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'top3-item';
      el.innerHTML = `
        <span class="top3-rank">${i + 1}</span>
        <span class="top3-class">${item.class.replace(/_/g, ' ')}</span>
        <span class="top3-conf">${(item.confidence * 100).toFixed(1)}%</span>
      `;
      top3List.appendChild(el);
    });

    // Severity bar
    const sevWidth = Math.min(100, Math.max(0, (1 - confidence) * 100 * 1.5));
    let sevColor;
    if (sevWidth < 33) sevColor = 'var(--success)';
    else if (sevWidth < 66) sevColor = 'var(--warning)';
    else sevColor = 'var(--error)';
    severityBar.style.width = sevWidth + '%';
    severityBar.style.background = sevColor;

    show(resultCard);
    show(previewArea);
  }

  function animateValue(el, start, end, duration, formatter) {
    const startTime = performance.now();
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(start + (end - start) * eased);
      el.textContent = formatter(current);
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  // ── Error Handling ──────────────────────────────────────────
  function showError(msg) {
    errorDesc.textContent = msg || 'Please check your connection and try again.';
    show(errorCard);
    show(previewArea);
  }

  errorRetry.addEventListener('click', () => {
    hide(errorCard);
    if (selectedFile) handleAnalyze();
  });

  // Legacy Puter.js loader removed; AI features are handled by Gemini layer.

  // ── Generate AI Advisory ────────────────────────────────────
  async function generateAdvisory(data) {
    const { predicted_class, confidence } = data;

    hide(advisoryPlaceholder);
    show(typingIndicator);
    hide(advisoryContent);
    hide(advisoryError);
    hide(advisoryActions);

    try {
      await loadPuterJS();

      const prompt = `You are an expert agricultural advisor and plant pathologist.

The detected crop disease is: ${predicted_class.replace(/_/g, ' ')}
Confidence level: ${(confidence * 100).toFixed(1)}%

Provide a comprehensive advisory in the following structured format. Use markdown headers and bullet points:

## 🔬 Disease Explanation
Brief description of what this disease is and how it affects crops.

## 🔍 Common Causes
List the primary causes (environmental, pathogenic, etc.)

## 💊 Immediate Treatment
Specific actionable steps the farmer should take right now.

## 🌿 Organic Remedy
Natural and organic treatment options available.

## 🛡️ Prevention Strategy
Long-term prevention measures to avoid recurrence.

## ⏱️ Estimated Recovery Time
Expected timeline for crop recovery with proper treatment.

Keep it structured, concise, professional, and farmer-friendly. Use simple language.`;

      const response = await puter.ai.chat(prompt, {
        model: 'gpt-5-nano',
        temperature: 0.3,
      });

      hide(typingIndicator);

      // Parse response — handle both string and object
      let text = '';
      if (typeof response === 'string') {
        text = response;
      } else if (response && response.message && response.message.content) {
        text = response.message.content;
      } else if (response && typeof response.toString === 'function') {
        text = response.toString();
      }

      if (!text || text.trim() === '' || text === '[object Object]') {
        throw new Error('Empty response');
      }

      // Render markdown-ish content
      advisoryContent.innerHTML = renderMarkdown(text);
      show(advisoryContent);
      show(advisoryActions);
    } catch (err) {
      console.error('AI Advisory failed:', err);
      hide(typingIndicator);
      show(advisoryError);
    }
  }

  // ── Minimal Markdown Renderer ───────────────────────────────
  function renderMarkdown(text) {
    let html = text
      // Escape HTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers
      .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
      .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Inline code
      .replace(/`(.+?)`/g, '<code>$1</code>')
      // Unordered list items
      .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
      // Numbered list items
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
      // Paragraphs (double newline)
      .replace(/\n\n/g, '</p><p>')
      // Single newlines
      .replace(/\n/g, '<br>');

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*?<\/li><br>?)+)/g, (match) => {
      const items = match.replace(/<br>/g, '');
      return '<ul>' + items + '</ul>';
    });

    return '<p>' + html + '</p>';
  }

  // ── Copy Advisory ───────────────────────────────────────────
  copyAdvisory.addEventListener('click', () => {
    const text = advisoryContent.innerText;
    navigator.clipboard.writeText(text).then(() => {
      toast('Advisory copied to clipboard!');
    }).catch(() => {
      toast('Failed to copy.');
    });
  });

  // ── Download Advisory as Text (PDF-like) ────────────────────
  downloadAdvisory.addEventListener('click', () => {
    const text = advisoryContent.innerText;
    const header = `AgriShield AI — Crop Disease Advisory Report\n${'='.repeat(48)}\nGenerated: ${new Date().toLocaleString()}\nDisease: ${lastPrediction?.predicted_class || 'Unknown'}\nConfidence: ${lastPrediction ? (lastPrediction.confidence * 100).toFixed(1) + '%' : 'N/A'}\n${'='.repeat(48)}\n\n`;

    const blob = new Blob([header + text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agrishield-advisory-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Advisory downloaded!');
  });

  // ── Insurance Check ─────────────────────────────────────────
  insuranceBtn.addEventListener('click', async () => {
    insuranceBtn.disabled = true;
    insuranceBtn.querySelector('span').textContent = 'Running…';
    try {
      const res = await fetch(INSURANCE_URL, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast(`Insurance check complete. ${data.alerts_generated || 0} alerts generated.`);
    } catch {
      toast('Insurance check failed. Please try later.');
    } finally {
      insuranceBtn.disabled = false;
      insuranceBtn.querySelector('span').textContent = 'Run Insurance Check';
    }
  });

  // ── Init ────────────────────────────────────────────────────
  checkHealth();
  setInterval(checkHealth, 30000); // Recheck every 30s

})();
