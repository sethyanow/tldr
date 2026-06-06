const STORAGE_KEY = 'tldr.savedSummaries.v1';

const presetModel = document.getElementById('presetModel');
const customModel = document.getElementById('customModel');
const hfApiKey = document.getElementById('hfApiKey');
const loadModelBtn = document.getElementById('loadModelBtn');
const modelStatus = document.getElementById('modelStatus');
const sourceText = document.getElementById('sourceText');
const summarizeBtn = document.getElementById('summarizeBtn');
const saveBtn = document.getElementById('saveBtn');
const summaryOutput = document.getElementById('summaryOutput');
const feedback = document.getElementById('feedback');
const historySearch = document.getElementById('historySearch');
const historySuggestions = document.getElementById('historySuggestions');
const historyList = document.getElementById('historyList');

let summarizer = null;
let currentModel = '';
let currentSummary = '';
let savedItems = loadSavedItems();

renderHistory(savedItems);

presetModel.addEventListener('change', () => {
  if (presetModel.value) customModel.value = presetModel.value;
});

loadModelBtn.addEventListener('click', handleLoadModel);
summarizeBtn.addEventListener('click', handleSummarize);
saveBtn.addEventListener('click', saveCurrentSummary);
historySearch.addEventListener('input', handleSearchInput);

async function handleLoadModel() {
  const modelId = (customModel.value.trim() || presetModel.value || '').trim();

  if (!modelId) {
    setFeedback('Please choose or enter a model ID.', true);
    return;
  }

  loadModelBtn.disabled = true;
  modelStatus.textContent = 'Loading model...';
  setFeedback('Preparing model download and cache in this browser.');

  try {
    const token = hfApiKey.value.trim();
    if (token) {
      await probeModelAccess(modelId, token);
    }

    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    summarizer = await pipeline('summarization', modelId, {
      progress_callback(progress) {
        if (progress?.status === 'downloading') {
          modelStatus.textContent = `Downloading ${Math.round((progress.progress || 0) * 100)}%`;
        }
      }
    });

    currentModel = modelId;
    modelStatus.textContent = `Loaded: ${modelId}`;
    setFeedback('Model is ready. Summarization runs on-device after model load.');
  } catch (error) {
    summarizer = null;
    currentModel = '';
    modelStatus.textContent = 'Load failed';
    setFeedback(error?.message || 'Unable to load model.', true);
  } finally {
    loadModelBtn.disabled = false;
  }
}

async function handleSummarize() {
  if (!summarizer) {
    setFeedback('Load a model before summarizing.', true);
    return;
  }

  const text = sourceText.value.trim();
  if (!text) {
    setFeedback('Please add text to summarize.', true);
    return;
  }

  summarizeBtn.disabled = true;
  saveBtn.disabled = true;
  setFeedback('Summarizing...');

  try {
    const output = await summarizer(text, {
      max_length: 130,
      min_length: 30,
      do_sample: false
    });

    const summaryText = output?.[0]?.summary_text?.trim();
    if (!summaryText) {
      throw new Error('Model returned empty output. Try shorter input text.');
    }

    currentSummary = summaryText;
    summaryOutput.textContent = summaryText;
    saveBtn.disabled = false;
    setFeedback(`Summary complete with ${currentModel || 'current model'}.`);
  } catch (error) {
    setFeedback(error?.message || 'Summarization failed.', true);
  } finally {
    summarizeBtn.disabled = false;
  }
}

function saveCurrentSummary() {
  if (!currentSummary) {
    setFeedback('No summary available to save.', true);
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    model: currentModel || 'unknown-model',
    sourcePreview: sourceText.value.trim().slice(0, 120),
    summary: currentSummary
  };

  savedItems = [entry, ...savedItems].slice(0, 200);
  persistSavedItems(savedItems);
  renderHistory(savedItems);
  setFeedback('Summary saved locally in your browser.');
}

function handleSearchInput() {
  const query = historySearch.value.trim();
  const filtered = fuzzyFind(savedItems, query);
  renderHistory(filtered);
  renderSuggestions(filtered.slice(0, 8));
}

function renderHistory(items) {
  historyList.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No saved summaries yet.';
    historyList.appendChild(empty);
    return;
  }

  for (const item of items) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ghost';
    button.textContent = `${new Date(item.createdAt).toLocaleString()} — ${item.model}`;

    button.addEventListener('click', () => {
      sourceText.value = item.sourcePreview;
      summaryOutput.textContent = item.summary;
      currentSummary = item.summary;
      saveBtn.disabled = false;
      setFeedback('Loaded saved summary.');
    });

    li.appendChild(button);
    historyList.appendChild(li);
  }
}

function renderSuggestions(items) {
  historySuggestions.innerHTML = '';

  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.summary.slice(0, 80);
    historySuggestions.appendChild(option);
  }
}

function loadSavedItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function fuzzyFind(items, query) {
  if (!query) return items;

  const q = query.toLowerCase();
  return items
    .map((item) => ({ item, score: fuzzyScore(`${item.model} ${item.summary}`.toLowerCase(), q) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

function fuzzyScore(text, pattern) {
  let ti = 0;
  let score = 0;

  for (let pi = 0; pi < pattern.length; pi++) {
    const ch = pattern[pi];
    ti = text.indexOf(ch, ti);
    if (ti === -1) return 0;
    score += 1 + Math.max(0, 3 - Math.min(3, ti));
    ti += 1;
  }

  return score;
}

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.style.color = isError ? '#f87171' : '';
}

async function probeModelAccess(modelId, token) {
  const response = await fetch(`https://huggingface.co/api/models/${encodeURIComponent(modelId)}`, {
    headers: {
      Authorization: 'Bearer ' + token
    }
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('API key rejected for this model. Please verify access.');
  }
}
