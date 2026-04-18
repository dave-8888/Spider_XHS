const page = document.body.dataset.page || 'home';
const THEME_STORAGE_KEY = 'spider_xhs_theme';
const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');

const sharedEls = {
  toast: document.querySelector('#toast'),
  themeButtons: Array.from(document.querySelectorAll('[data-theme-option]')),
};

const homeEls = {
  keywordList: document.querySelector('#keywordList'),
  addKeywordBtn: document.querySelector('#addKeywordBtn'),
  outputDirText: document.querySelector('#outputDirText'),
  pickOutputDirBtn: document.querySelector('#pickOutputDirBtn'),
  resetOutputDirBtn: document.querySelector('#resetOutputDirBtn'),
  countInput: document.querySelector('#countInput'),
  likeTopInput: document.querySelector('#likeTopInput'),
  publishDaysInput: document.querySelector('#publishDaysInput'),
  collectBtn: document.querySelector('#collectBtn'),
  collectOverlay: document.querySelector('#collectOverlay'),
  collectOverlayTitle: document.querySelector('#collectOverlayTitle'),
  collectOverlayDetail: document.querySelector('#collectOverlayDetail'),
  collectOverlaySteps: document.querySelector('#collectOverlaySteps'),
  collectOverlayCloseBtn: document.querySelector('#collectOverlayCloseBtn'),
  jobList: document.querySelector('#jobList'),
  jobSection: document.querySelector('#jobSection'),
  jobStatusSummary: document.querySelector('#jobStatusSummary'),
  jobFilters: document.querySelector('#jobFilters'),
  refreshJobsBtn: document.querySelector('#refreshJobsBtn'),
  deleteSelectedBtn: document.querySelector('#deleteSelectedBtn'),
  refreshFilesBtn: document.querySelector('#refreshFilesBtn'),
  fileList: document.querySelector('#fileList'),
  filePreview: document.querySelector('#filePreview'),
  filePreviewMeta: document.querySelector('#filePreviewMeta'),
  fileSelectionSummary: document.querySelector('#fileSelectionSummary'),
  sortTypeChoices: document.querySelector('#sortTypeChoices'),
  contentTypeChoices: document.querySelector('#contentTypeChoices'),
  publishTimeChoices: document.querySelector('#publishTimeChoices'),
  noteRangeChoices: document.querySelector('#noteRangeChoices'),
  posDistanceChoices: document.querySelector('#posDistanceChoices'),
};

const settingsEls = {
  cookieStatus: document.querySelector('#cookieStatus'),
  requestMultiplierInput: document.querySelector('#requestMultiplierInput'),
  searchDelayMinInput: document.querySelector('#searchDelayMinInput'),
  searchDelayMaxInput: document.querySelector('#searchDelayMaxInput'),
  detailDelayMinInput: document.querySelector('#detailDelayMinInput'),
  detailDelayMaxInput: document.querySelector('#detailDelayMaxInput'),
  scheduleEnabledInput: document.querySelector('#scheduleEnabledInput'),
  cycleInput: document.querySelector('#cycleInput'),
  dailyRunsInput: document.querySelector('#dailyRunsInput'),
  runTimesInput: document.querySelector('#runTimesInput'),
  weekdayChoices: document.querySelector('#weekdayChoices'),
  weekdaySection: document.querySelector('#weekdaySection'),
  saveConfigBtn: document.querySelector('#saveConfigBtn'),
  checkLoginBtn: document.querySelector('#checkLoginBtn'),
  openLoginBrowserBtn: document.querySelector('#openLoginBrowserBtn'),
  openExternalLoginBrowserBtn: document.querySelector('#openExternalLoginBrowserBtn'),
};

const desktopBridge = window.spiderDesktop && typeof window.spiderDesktop.isDesktop === 'function'
  ? window.spiderDesktop
  : null;

const state = {
  config: null,
  choices: {},
  currentOutputRoot: 'datas/markdown_datas',
  currentFiles: null,
  currentFileEntries: new Map(),
  currentPath: '',
  currentPreviewPath: '',
  jobPoller: null,
  loginPoller: null,
  homeFilters: {
    sort_type: 2,
    content_type: 2,
    publish_time: 2,
    note_range: 0,
    pos_distance: 0,
  },
  keywordItems: [],
  nextKeywordId: 0,
  draggedKeywordId: '',
  selectedOutputDir: '',
  defaultOutputRoot: 'datas/markdown_datas',
  outputDirDisplay: 'datas/markdown_datas',
  settingsWeekdays: [1, 2, 3, 4, 5, 6, 7],
  jobLogScrollState: new Map(),
  jobLogOpenState: new Map(),
  jobFilter: 'all',
  currentJobs: [],
  collectBusy: false,
  collectOverlayState: {
    status: 'idle',
    title: '',
    detail: '',
    open: false,
    dismissible: false,
  },
  collectProgressStatus: 'validating',
  highlightedJobId: '',
  highlightTimer: null,
  themeMode: document.documentElement.dataset.themeMode || 'system',
  desktopMode: false,
  selectedFilePaths: new Set(),
};

function getThemeMode() {
  return ['light', 'dark', 'system'].includes(state.themeMode) ? state.themeMode : 'system';
}

function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return themeMedia.matches ? 'dark' : 'light';
}

function updateThemeControls() {
  const activeMode = getThemeMode();
  sharedEls.themeButtons.forEach((button) => {
    const isActive = button.dataset.themeOption === activeMode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function applyTheme(mode, { persist = false } = {}) {
  const normalizedMode = ['light', 'dark', 'system'].includes(mode) ? mode : 'system';
  state.themeMode = normalizedMode;
  document.documentElement.dataset.themeMode = normalizedMode;
  document.documentElement.dataset.theme = resolveTheme(normalizedMode);

  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalizedMode);
    } catch (_error) {
      // Ignore storage failures and keep the in-memory selection.
    }
  }

  updateThemeControls();
}

function bindThemeEvents() {
  updateThemeControls();

  sharedEls.themeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      applyTheme(button.dataset.themeOption, { persist: true });
      toast(`已切换为${button.textContent}模式`);
    });
  });

  const syncTheme = () => {
    if (getThemeMode() === 'system') {
      applyTheme('system');
    }
  };

  if (typeof themeMedia.addEventListener === 'function') {
    themeMedia.addEventListener('change', syncTheme);
    return;
  }

  if (typeof themeMedia.addListener === 'function') {
    themeMedia.addListener(syncTheme);
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createKeywordItem(value = '') {
  state.nextKeywordId += 1;
  return {
    id: `keyword-${state.nextKeywordId}`,
    value: String(value ?? ''),
  };
}

function ensureKeywordItems() {
  if (!state.keywordItems.length) {
    state.keywordItems = [createKeywordItem('')];
  }
}

function setKeywordItems(values) {
  const normalized = Array.isArray(values) ? values : [];
  state.keywordItems = (normalized.length ? normalized : ['']).map((value) => createKeywordItem(value));
}

function updateKeywordValue(id, value) {
  const item = state.keywordItems.find((entry) => entry.id === id);
  if (item) {
    item.value = value;
  }
}

function insertKeywordItemAfter(id) {
  const index = state.keywordItems.findIndex((entry) => entry.id === id);
  const nextItem = createKeywordItem('');
  const insertIndex = index >= 0 ? index + 1 : state.keywordItems.length;
  state.keywordItems.splice(insertIndex, 0, nextItem);
  renderKeywordList({ focusId: nextItem.id });
}

function removeKeywordItem(id) {
  if (state.keywordItems.length <= 1) {
    state.keywordItems[0].value = '';
    renderKeywordList({ focusId: state.keywordItems[0].id });
    return;
  }
  const index = state.keywordItems.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  const fallback = state.keywordItems[Math.max(0, index - 1)]?.id || '';
  state.keywordItems.splice(index, 1);
  ensureKeywordItems();
  renderKeywordList({ focusId: fallback || state.keywordItems[0].id });
}

function moveKeywordItem(sourceId, targetId, { after = false } = {}) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const fromIndex = state.keywordItems.findIndex((entry) => entry.id === sourceId);
  const toIndex = state.keywordItems.findIndex((entry) => entry.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return;

  const [movedItem] = state.keywordItems.splice(fromIndex, 1);
  const baseIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
  const insertIndex = after ? baseIndex + 1 : baseIndex;
  state.keywordItems.splice(insertIndex, 0, movedItem);
  renderKeywordList({ focusId: sourceId });
}

function keywordValues() {
  return state.keywordItems
    .map((item) => item.value.trim())
    .filter(Boolean);
}

function renderKeywordList({ focusId = '' } = {}) {
  if (!homeEls.keywordList) return;
  ensureKeywordItems();

  homeEls.keywordList.innerHTML = state.keywordItems.map((item, index) => `
    <div class="keyword-row" data-keyword-id="${item.id}" draggable="${state.collectBusy ? 'false' : 'true'}">
      <span class="keyword-drag" aria-hidden="true">⋮⋮</span>
      <span class="keyword-index">${String(index + 1).padStart(2, '0')}</span>
      <input class="keyword-input" type="text" value="${escapeHtml(item.value)}" placeholder="输入关键词" ${state.collectBusy ? 'disabled' : ''}>
      <button class="btn btn-ghost keyword-remove-btn" data-keyword-remove="${item.id}" type="button" ${state.collectBusy ? 'disabled' : ''}>删除</button>
    </div>
  `).join('');

  homeEls.keywordList.querySelectorAll('.keyword-row').forEach((row) => {
    const keywordId = row.dataset.keywordId || '';
    const input = row.querySelector('.keyword-input');

    if (input) {
      input.addEventListener('input', (event) => {
        updateKeywordValue(keywordId, event.target.value);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          insertKeywordItemAfter(keywordId);
        }
      });
    }

    if (!state.collectBusy) {
      row.addEventListener('dragstart', (event) => {
        state.draggedKeywordId = keywordId;
        row.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', keywordId);
      });

      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        const rect = row.getBoundingClientRect();
        const dropAfter = event.clientY > rect.top + rect.height / 2;
        row.dataset.dropAfter = dropAfter ? 'true' : 'false';
        row.classList.toggle('is-drag-target', !dropAfter);
        row.classList.toggle('is-drop-after', dropAfter);
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('is-drag-target');
        row.classList.remove('is-drop-after');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drag-target');
        row.classList.remove('is-drop-after');
        moveKeywordItem(state.draggedKeywordId, keywordId, {
          after: row.dataset.dropAfter === 'true',
        });
        delete row.dataset.dropAfter;
      });

      row.addEventListener('dragend', () => {
        state.draggedKeywordId = '';
        row.classList.remove('is-dragging');
        homeEls.keywordList.querySelectorAll('.keyword-row').forEach((itemRow) => {
          itemRow.classList.remove('is-drag-target');
          itemRow.classList.remove('is-drop-after');
          itemRow.classList.remove('is-dragging');
          delete itemRow.dataset.dropAfter;
        });
      });
    }
  });

  homeEls.keywordList.querySelectorAll('[data-keyword-remove]').forEach((button) => {
    button.addEventListener('click', () => removeKeywordItem(button.dataset.keywordRemove || ''));
  });

  if (homeEls.addKeywordBtn) {
    homeEls.addKeywordBtn.disabled = state.collectBusy;
  }

  if (focusId) {
    window.requestAnimationFrame(() => {
      const input = homeEls.keywordList.querySelector(`[data-keyword-id="${focusId}"] .keyword-input`);
      if (input) {
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    });
  }
}

function renderOutputDirSelection() {
  if (homeEls.outputDirText) {
    homeEls.outputDirText.textContent = state.outputDirDisplay || state.defaultOutputRoot;
    homeEls.outputDirText.classList.toggle('is-default', !state.selectedOutputDir);
  }
  if (homeEls.pickOutputDirBtn) {
    homeEls.pickOutputDirBtn.disabled = state.collectBusy;
  }
  if (homeEls.resetOutputDirBtn) {
    homeEls.resetOutputDirBtn.disabled = state.collectBusy || !state.selectedOutputDir;
  }
}

const collectStepOrder = ['validating', 'starting', 'waiting_job_render', 'success'];
const collectStepLabels = {
  validating: '校验配置',
  starting: '创建任务',
  waiting_job_render: '同步任务面板',
  success: '准备完成',
};

function renderCollectOverlaySteps(status) {
  if (!homeEls.collectOverlaySteps) return;
  const progressStatus = status === 'error' ? state.collectProgressStatus : status;
  const activeIndex = collectStepOrder.indexOf(progressStatus);
  homeEls.collectOverlaySteps.innerHTML = collectStepOrder.map((step, index) => {
    let tone = 'pending';
    if (status === 'error') {
      tone = index < activeIndex ? 'done' : (index === activeIndex ? 'error' : 'pending');
    } else if (activeIndex >= 0) {
      tone = index < activeIndex ? 'done' : (index === activeIndex ? 'active' : 'pending');
    }
    return `<div class="collect-step collect-step-${tone}">${collectStepLabels[step]}</div>`;
  }).join('');
}

function setCollectOverlay({
  open = true,
  status = 'validating',
  title = '',
  detail = '',
  dismissible = false,
} = {}) {
  state.collectOverlayState = {
    open,
    status,
    title,
    detail,
    dismissible,
  };
  if (status !== 'error' && open) {
    state.collectProgressStatus = status;
  }

  if (!homeEls.collectOverlay) return;

  homeEls.collectOverlay.classList.toggle('is-hidden', !open);
  homeEls.collectOverlay.classList.toggle('is-dismissible', dismissible);
  homeEls.collectOverlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  document.body.classList.toggle('has-collect-overlay', open);

  if (homeEls.collectOverlayTitle) {
    homeEls.collectOverlayTitle.textContent = title;
  }
  if (homeEls.collectOverlayDetail) {
    homeEls.collectOverlayDetail.textContent = detail;
  }
  if (homeEls.collectOverlayCloseBtn) {
    homeEls.collectOverlayCloseBtn.classList.toggle('is-hidden', !dismissible);
  }
  renderCollectOverlaySteps(status);
}

function closeCollectOverlay() {
  setCollectOverlay({
    open: false,
    status: 'idle',
    title: '',
    detail: '',
    dismissible: false,
  });
}

function setHomeBusy(isBusy) {
  state.collectBusy = isBusy;
  [
    homeEls.collectBtn,
    homeEls.countInput,
    homeEls.likeTopInput,
    homeEls.publishDaysInput,
    homeEls.deleteSelectedBtn,
    homeEls.refreshFilesBtn,
  ].forEach((element) => {
    if (element) {
      element.disabled = isBusy;
    }
  });

  renderKeywordList();
  renderOutputDirSelection();
  renderHomeChoices();
  if (state.currentFiles) {
    renderFiles(state.currentFiles);
  } else {
    updateFileToolbarState();
  }
}

function findJobCard(jobId) {
  if (!jobId || !homeEls.jobList) return null;
  return homeEls.jobList.querySelector(`[data-job-card-id="${jobId}"]`);
}

function highlightJobCard(jobId) {
  if (!jobId) return;
  state.highlightedJobId = jobId;
  if (state.highlightTimer) {
    window.clearTimeout(state.highlightTimer);
  }
  state.highlightTimer = window.setTimeout(() => {
    state.highlightedJobId = '';
    const card = findJobCard(jobId);
    if (card) {
      card.classList.remove('job-card-highlight');
    }
  }, 4000);
}

function scrollToJobCard(jobId) {
  const card = findJobCard(jobId);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (homeEls.jobSection) {
    homeEls.jobSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function waitForJobCard(jobId, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await loadJobs();
    const card = findJobCard(jobId);
    if (card) {
      return card;
    }
    await sleep(350);
  }
  return null;
}

function toast(message) {
  if (!sharedEls.toast) return;
  sharedEls.toast.textContent = message;
  sharedEls.toast.classList.add('show');
  window.clearTimeout(sharedEls.toast.timer);
  sharedEls.toast.timer = window.setTimeout(() => sharedEls.toast.classList.remove('show'), 3200);
}

async function copyText(value) {
  const text = String(value || '');
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cloneData(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, patch) {
  if (patch === undefined) return cloneData(base);
  if (Array.isArray(patch)) return cloneData(patch);
  if (isPlainObject(patch)) {
    const source = isPlainObject(base) ? base : {};
    const merged = {};
    const keys = new Set([...Object.keys(source), ...Object.keys(patch)]);
    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        merged[key] = deepMerge(source[key], patch[key]);
      } else {
        merged[key] = cloneData(source[key]);
      }
    });
    return merged;
  }
  return patch;
}

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `请求失败：${response.status}`);
  }
  return data;
}

function detectDesktopMode(config = state.config) {
  const bridgeDesktop = Boolean(desktopBridge && desktopBridge.isDesktop());
  return bridgeDesktop || Boolean(config?.paths?.desktop_mode);
}

function applyDesktopMode(config = state.config) {
  state.desktopMode = detectDesktopMode(config);

  if (settingsEls.openLoginBrowserBtn) {
    settingsEls.openLoginBrowserBtn.textContent = state.desktopMode ? '打开登录窗口' : '打开浏览器登录';
  }

  if (settingsEls.openExternalLoginBrowserBtn) {
    settingsEls.openExternalLoginBrowserBtn.classList.toggle('is-hidden', !state.desktopMode);
  }
}

async function getConfigRaw() {
  const data = await api('/api/config');
  state.config = data.config;
  state.choices = data.config?.choices || {};
  applyDesktopMode(data.config);
  return data.config;
}

function updateOutputRoot(config) {
  state.currentOutputRoot = config.paths?.output_root || config.paths?.markdown_root || 'datas/markdown_datas';
}

function renderChoiceButtons(container, choiceMap, value, onSelect, { multi = false, disabled = false } = {}) {
  if (!container) return;
  const entries = Object.entries(choiceMap || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  container.innerHTML = entries.map(([key, label]) => {
    const numericKey = Number(key);
    const active = multi ? value.includes(numericKey) : Number(value) === numericKey;
    return `<button class="choice ${active ? 'active' : ''}" data-value="${numericKey}" type="button" ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</button>`;
  }).join('');

  container.querySelectorAll('.choice').forEach((button) => {
    if (disabled) return;
    button.addEventListener('click', () => {
      const selected = Number(button.dataset.value);
      if (multi) {
        const set = new Set(value);
        if (set.has(selected) && set.size > 1) {
          set.delete(selected);
        } else {
          set.add(selected);
        }
        onSelect(Array.from(set).sort((a, b) => a - b));
        return;
      }
      onSelect(selected);
    });
  });
}

function renderHomeChoices() {
  renderChoiceButtons(homeEls.sortTypeChoices, state.choices.sort_type, state.homeFilters.sort_type, (selected) => {
    state.homeFilters.sort_type = selected;
    renderHomeChoices();
  }, { disabled: state.collectBusy });
  renderChoiceButtons(homeEls.contentTypeChoices, state.choices.content_type, state.homeFilters.content_type, (selected) => {
    state.homeFilters.content_type = selected;
    renderHomeChoices();
  }, { disabled: state.collectBusy });
  renderChoiceButtons(homeEls.publishTimeChoices, state.choices.publish_time, state.homeFilters.publish_time, (selected) => {
    state.homeFilters.publish_time = selected;
    renderHomeChoices();
  }, { disabled: state.collectBusy });
  renderChoiceButtons(homeEls.noteRangeChoices, state.choices.note_range, state.homeFilters.note_range, (selected) => {
    state.homeFilters.note_range = selected;
    renderHomeChoices();
  }, { disabled: state.collectBusy });
  renderChoiceButtons(homeEls.posDistanceChoices, state.choices.pos_distance, state.homeFilters.pos_distance, (selected) => {
    state.homeFilters.pos_distance = selected;
    renderHomeChoices();
  }, { disabled: state.collectBusy });
}

function renderSettingsWeekdays() {
  renderChoiceButtons(settingsEls.weekdayChoices, state.choices.weekdays, state.settingsWeekdays, (selected) => {
    state.settingsWeekdays = selected;
    renderSettingsWeekdays();
  }, { multi: true });
}

function updateScheduleView() {
  if (!settingsEls.weekdaySection || !settingsEls.cycleInput) return;
  settingsEls.weekdaySection.classList.toggle('is-hidden', settingsEls.cycleInput.value !== 'weekly');
}

function applyHomeConfig(config) {
  const filters = config.filters || {};
  const collect = config.collect || {};

  state.homeFilters.sort_type = Number(filters.sort_type ?? 2);
  state.homeFilters.content_type = Number(filters.content_type ?? 2);
  state.homeFilters.publish_time = Number(filters.publish_time ?? 2);
  state.homeFilters.note_range = Number(filters.note_range ?? 0);
  state.homeFilters.pos_distance = Number(filters.pos_distance ?? 0);
  state.selectedOutputDir = config.storage?.output_dir ?? '';
  state.defaultOutputRoot = config.paths?.markdown_root || 'datas/markdown_datas';
  state.outputDirDisplay = config.paths?.output_root || state.defaultOutputRoot;

  setKeywordItems(config.keywords || ['男士穿搭']);
  if (homeEls.countInput) {
    homeEls.countInput.value = collect.count ?? 10;
  }
  if (homeEls.likeTopInput) {
    homeEls.likeTopInput.value = collect.like_top_n ?? 10;
  }
  if (homeEls.publishDaysInput) {
    homeEls.publishDaysInput.value = filters.publish_days ?? 7;
  }

  updateOutputRoot(config);
  renderKeywordList();
  renderOutputDirSelection();
  renderHomeChoices();
}

function setLoginStatus(message, tone = 'muted') {
  if (!settingsEls.cookieStatus) return;
  settingsEls.cookieStatus.textContent = message;
  settingsEls.cookieStatus.className = `status-panel ${tone}`;
}

function applyLoginSummary(config) {
  const preview = config.login?.cookies_preview ? ` · ${config.login.cookies_preview}` : '';
  if (config.login?.cookie_present) {
    setLoginStatus(`已保存 Cookie，可直接采集${preview}`, 'good');
    return;
  }
  setLoginStatus('未保存 Cookie，请打开浏览器登录', 'bad');
}

function applySettingsConfig(config) {
  if (!settingsEls.saveConfigBtn) return;
  const collect = config.collect || {};
  const schedule = config.schedule || {};

  applyHomeConfig(config);
  applyLoginSummary(config);
  settingsEls.requestMultiplierInput.value = collect.request_multiplier ?? 3;
  settingsEls.searchDelayMinInput.value = collect.search_delay_min_sec ?? 2;
  settingsEls.searchDelayMaxInput.value = collect.search_delay_max_sec ?? 4;
  settingsEls.detailDelayMinInput.value = collect.detail_delay_min_sec ?? 1;
  settingsEls.detailDelayMaxInput.value = collect.detail_delay_max_sec ?? 3;
  settingsEls.scheduleEnabledInput.checked = Boolean(schedule.enabled);
  settingsEls.cycleInput.value = schedule.cycle || 'daily';
  settingsEls.dailyRunsInput.value = schedule.daily_runs || 1;
  settingsEls.runTimesInput.value = (schedule.run_times || ['09:00']).join(', ');
  state.settingsWeekdays = (schedule.weekdays || [1, 2, 3, 4, 5, 6, 7]).map(Number);

  renderSettingsWeekdays();
  updateScheduleView();
}

async function loadHomeConfig() {
  const config = await getConfigRaw();
  applyHomeConfig(config);
  return config;
}

async function loadSettingsConfig() {
  const config = await getConfigRaw();
  applySettingsConfig(config);
  return config;
}

function readRunTimes() {
  return (settingsEls.runTimesInput?.value || '')
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readHomeDraft() {
  return {
    keywords: keywordValues(),
    collect: {
      count: toNumber(homeEls.countInput?.value, 10),
      like_top_n: toNumber(homeEls.likeTopInput?.value, 10),
    },
    filters: {
      sort_type: state.homeFilters.sort_type,
      content_type: state.homeFilters.content_type,
      publish_time: state.homeFilters.publish_time,
      publish_days: toNumber(homeEls.publishDaysInput?.value, 7),
      note_range: state.homeFilters.note_range,
      pos_distance: state.homeFilters.pos_distance,
    },
    storage: {
      output_dir: state.selectedOutputDir.trim() || '',
    },
  };
}

function readSettingsDraft() {
  const collectionDraft = readHomeDraft();
  const runTimes = readRunTimes();
  return {
    keywords: collectionDraft.keywords,
    collect: {
      ...collectionDraft.collect,
      request_multiplier: toNumber(settingsEls.requestMultiplierInput?.value, 3),
      search_delay_min_sec: toNumber(settingsEls.searchDelayMinInput?.value, 2),
      search_delay_max_sec: toNumber(settingsEls.searchDelayMaxInput?.value, 4),
      detail_delay_min_sec: toNumber(settingsEls.detailDelayMinInput?.value, 1),
      detail_delay_max_sec: toNumber(settingsEls.detailDelayMaxInput?.value, 3),
    },
    filters: collectionDraft.filters,
    storage: collectionDraft.storage,
    schedule: {
      enabled: Boolean(settingsEls.scheduleEnabledInput?.checked),
      cycle: settingsEls.cycleInput?.value || 'daily',
      daily_runs: toNumber(settingsEls.dailyRunsInput?.value, 1),
      run_times: runTimes.length ? runTimes : ['09:00'],
      weekdays: state.settingsWeekdays,
    },
  };
}

async function saveSettings() {
  const data = await api('/api/config', {
    method: 'POST',
    body: JSON.stringify(readSettingsDraft()),
  });
  state.config = data.config;
  state.choices = data.config?.choices || state.choices;
  applySettingsConfig(data.config);
  toast('设置已保存');
}

async function pickOutputFolder() {
  const currentPath = state.selectedOutputDir || state.outputDirDisplay || state.currentOutputRoot || state.defaultOutputRoot;
  const data = await api('/api/storage/pick-folder', {
    method: 'POST',
    body: JSON.stringify({ current_path: currentPath }),
  });
  if (data.canceled) return;
  state.selectedOutputDir = data.folder?.path || '';
  state.outputDirDisplay = data.folder?.path || state.outputDirDisplay;
  renderOutputDirSelection();
  toast(`已选择目录：${state.outputDirDisplay}，保存设置后生效`);
}

function resetOutputFolder() {
  state.selectedOutputDir = '';
  state.outputDirDisplay = state.defaultOutputRoot;
  renderOutputDirSelection();
  toast('已恢复默认目录，保存设置后生效');
}

async function startCollect() {
  if (!homeEls.collectBtn || state.collectBusy) return;
  const previousRoot = state.currentOutputRoot;
  setCollectOverlay({
    open: true,
    status: 'validating',
    title: '正在校验采集配置',
    detail: '检查已保存的关键词、筛选条件和目录设置。',
  });
  setHomeBusy(true);

  try {
    const savedConfig = await getConfigRaw();
    const savedKeywords = Array.isArray(savedConfig.keywords) ? savedConfig.keywords.filter(Boolean) : [];
    if (!savedKeywords.length) {
      throw new Error('请至少填写一个关键词');
    }

    setCollectOverlay({
      open: true,
      status: 'starting',
      title: '正在创建采集任务',
      detail: '配置校验通过，正在提交采集请求。',
    });

    const data = await api('/api/collect', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setCollectOverlay({
      open: true,
      status: 'waiting_job_render',
      title: '任务已启动',
      detail: `任务 ${data.job.id} 已创建，正在同步任务面板。`,
    });

    await loadHomeConfig();
    if (previousRoot !== state.currentOutputRoot) {
      state.currentPath = '';
      setPreviewState(defaultPreviewState({
        meta: '目录已刷新。',
      }));
      await loadFiles('');
    }

    await waitForJobCard(data.job.id);
    highlightJobCard(data.job.id);
    await loadJobs();
    scrollToJobCard(data.job.id);

    setCollectOverlay({
      open: true,
      status: 'success',
      title: '采集任务已启动',
      detail: `任务 ${data.job.id} 已进入任务面板，正在继续采集。`,
    });
    await sleep(800);
    closeCollectOverlay();
    setHomeBusy(false);
    toast(`采集任务已启动：${data.job.id}`);
  } catch (error) {
    setCollectOverlay({
      open: true,
      status: 'error',
      title: '启动采集失败',
      detail: error.message || '启动采集时发生错误，请稍后重试。',
      dismissible: true,
    });
    setHomeBusy(false);
  }
}

async function checkLogin({ silent = false } = {}) {
  if (!settingsEls.checkLoginBtn) return;
  settingsEls.checkLoginBtn.disabled = true;
  setLoginStatus('正在检查登录...', 'muted');

  try {
    const data = await api('/api/login/check', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const nickname = data.user?.nickname ? `，账号：${data.user.nickname}` : '';
    setLoginStatus(`登录有效${nickname}`, 'good');
    if (!silent) toast('登录状态有效');
    await loadSettingsConfig();
  } catch (error) {
    setLoginStatus(error.message, 'bad');
    if (!silent) toast(error.message);
  } finally {
    settingsEls.checkLoginBtn.disabled = false;
  }
}

async function fetchLoginStatus() {
  if (state.desktopMode && desktopBridge) {
    return { login: await desktopBridge.getLoginStatus() };
  }
  return api('/api/login/browser/status', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

async function triggerLoginStart() {
  if (state.desktopMode && desktopBridge) {
    return { login: await desktopBridge.startLogin() };
  }
  return api('/api/login/browser/start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

async function startExternalBrowserLogin() {
  const data = await api('/api/login/browser/start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  applyBrowserLoginState(data.login || {});
  startLoginPolling();
  await pollBrowserLogin();
}

function stopLoginPolling() {
  if (state.loginPoller) {
    window.clearInterval(state.loginPoller);
    state.loginPoller = null;
  }
}

function applyBrowserLoginState(login) {
  const nickname = login.user?.nickname ? `，账号：${login.user.nickname}` : '';
  const message = `${login.message || '等待浏览器登录...'}${nickname}`;
  const tone = login.status === 'saved'
    ? 'good'
    : (login.status === 'closed' ? 'bad' : 'muted');
  setLoginStatus(message, tone);
}

async function pollBrowserLogin() {
  const data = await fetchLoginStatus();
  const login = data.login || {};
  applyBrowserLoginState(login);

  if (login.status === 'saved') {
    stopLoginPolling();
    toast('Cookie 已保存');
    await loadSettingsConfig();
  }

  if (login.status === 'closed' || login.status === 'idle') {
    stopLoginPolling();
  }
}

function startLoginPolling() {
  stopLoginPolling();
  state.loginPoller = window.setInterval(() => {
    pollBrowserLogin().catch((error) => setLoginStatus(error.message, 'bad'));
  }, 3000);
}

async function startBrowserLogin() {
  if (!settingsEls.openLoginBrowserBtn) return;
  settingsEls.openLoginBrowserBtn.disabled = true;

  try {
    const data = await triggerLoginStart();
    applyBrowserLoginState(data.login || {});
    startLoginPolling();
    await pollBrowserLogin();
  } catch (error) {
    setLoginStatus(error.message, 'bad');
    toast(error.message);
  } finally {
    settingsEls.openLoginBrowserBtn.disabled = false;
  }
}

async function syncBrowserLoginStatus() {
  if (!settingsEls.cookieStatus) return;
  try {
    const data = await fetchLoginStatus();
    const login = data.login || {};
    if (login.status === 'waiting') {
      applyBrowserLoginState(login);
      startLoginPolling();
      return;
    }
    if (login.status === 'saved') {
      applyBrowserLoginState(login);
      await loadSettingsConfig();
    }
  } catch (_error) {
    // Ignore background sync failures and keep the last saved summary.
  }
}

function isNearBottom(element, threshold = 24) {
  return element.scrollHeight - element.clientHeight - element.scrollTop <= threshold;
}

function jobStatusMeta(status) {
  const map = {
    running: { label: '运行中', tone: 'running' },
    success: { label: '已完成', tone: 'success' },
    failed: { label: '失败', tone: 'failed' },
    interrupted: { label: '已中断', tone: 'interrupted' },
  };
  return map[status] || { label: status || '未知', tone: 'idle' };
}

function jobSourceLabel(source) {
  return source === 'schedule' ? '定时任务' : '手动采集';
}

function compactTime(value) {
  const text = String(value || '').trim();
  if (!text) return '未记录';
  const [date = '', time = ''] = text.split(' ');
  if (!time) return text;
  const shortDate = date.length >= 10 ? date.slice(5) : date;
  return `${shortDate} ${time.slice(0, 5)}`;
}

function parseLocalDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text.replace(/-/g, '/'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDuration(startedAt, finishedAt) {
  const start = parseLocalDate(startedAt);
  const finish = parseLocalDate(finishedAt) || new Date();
  if (!start) return '计算中';
  const seconds = Math.max(0, Math.round((finish.getTime() - start.getTime()) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return `${minutes} 分 ${restSeconds} 秒`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 时 ${minutes % 60} 分`;
}

function truncateText(value, maxLength = 84) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function latestJobLog(job) {
  const logs = Array.isArray(job.logs) ? job.logs : [];
  return logs.length ? logs[logs.length - 1] : null;
}

function countJobLogIssues(job) {
  const logs = Array.isArray(job.logs) ? job.logs : [];
  return logs.filter((item) => /失败|错误|异常|error|exception/i.test(String(item.message || ''))).length;
}

function jobKeywords(summary = {}) {
  const keywords = Array.isArray(summary.keywords) ? summary.keywords.filter(Boolean) : [];
  if (!keywords.length) return '未设置关键词';
  const shown = keywords.slice(0, 3).join('、');
  return keywords.length > 3 ? `${shown} 等 ${keywords.length} 个` : shown;
}

function jobScopeText(summary = {}) {
  const parts = [
    summary.sort_type,
    summary.content_type,
    summary.publish_time,
    summary.note_range && summary.note_range !== '不限' ? summary.note_range : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '默认筛选';
}

function jobProgress(job) {
  const status = job.status || '';
  if (status === 'success') {
    return { value: 100, label: '已完成' };
  }
  if (status === 'failed' || status === 'interrupted') {
    return { value: 100, label: jobStatusMeta(status).label };
  }

  const logs = Array.isArray(job.logs) ? job.logs : [];
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const message = String(logs[index].message || '');
    const match = message.match(/拉取详情.+?(\d+)\s*\/\s*(\d+)/);
    if (match) {
      const current = Number(match[1]);
      const total = Number(match[2]);
      if (total > 0) {
        return {
          value: Math.max(4, Math.min(96, Math.round((current / total) * 100))),
          label: `详情 ${current}/${total}`,
        };
      }
    }
  }

  return { value: status === 'running' ? 12 : 0, label: status === 'running' ? '准备中' : '未开始' };
}

function jobPrimaryMessage(job) {
  const result = job.result || {};
  const latestLog = latestJobLog(job);
  if (job.status === 'success') {
    return `保存 ${result.saved_count || 0} 篇，失败 ${result.failed_count || 0} 条`;
  }
  if (job.status === 'failed' || job.status === 'interrupted') {
    return truncateText(job.error || latestLog?.message || jobStatusMeta(job.status).label, 120);
  }
  return truncateText(latestLog?.message || '正在等待采集日志', 120);
}

function jobMetricItems(job) {
  const summary = job.summary || {};
  const result = job.result || {};
  const saved = result.saved_count ?? '—';
  const failed = result.failed_count ?? countJobLogIssues(job);
  return [
    { label: '目标', value: `${summary.count || '—'} 篇` },
    { label: '已保存', value: saved === '—' ? saved : `${saved} 篇` },
    { label: '异常', value: `${failed || 0} 条` },
    { label: '耗时', value: formatDuration(job.started_at || job.created_at, job.finished_at) },
  ];
}

function jobFilterOptions(jobs) {
  const issueCount = jobs.filter((job) => ['failed', 'interrupted'].includes(job.status)).length;
  return [
    { value: 'all', label: '全部', count: jobs.length },
    { value: 'running', label: '运行中', count: jobs.filter((job) => job.status === 'running').length },
    { value: 'success', label: '已完成', count: jobs.filter((job) => job.status === 'success').length },
    { value: 'failed', label: '异常', count: issueCount },
  ];
}

function filterJobs(jobs) {
  const filter = state.jobFilter;
  if (filter === 'running') return jobs.filter((job) => job.status === 'running');
  if (filter === 'success') return jobs.filter((job) => job.status === 'success');
  if (filter === 'failed') return jobs.filter((job) => ['failed', 'interrupted'].includes(job.status));
  return jobs;
}

function renderJobStatusSummary(jobs) {
  if (!homeEls.jobStatusSummary) return;
  const runningJobs = jobs.filter((job) => job.status === 'running');
  const latest = runningJobs[0] || jobs[0];

  if (!latest) {
    homeEls.jobStatusSummary.innerHTML = `
      <div class="job-summary-main">
        <span class="job-status-dot idle" aria-hidden="true"></span>
        <div>
          <div class="job-summary-title">暂无任务记录</div>
          <div class="job-summary-subtitle">当前没有采集历史。</div>
        </div>
      </div>
    `;
    return;
  }

  const meta = jobStatusMeta(latest.status);
  const title = runningJobs.length ? '正在采集' : `最近任务${meta.label}`;
  const subtitle = `${jobSourceLabel(latest.source)} · ${compactTime(latest.started_at || latest.created_at)} · ${jobPrimaryMessage(latest)}`;
  const successCount = jobs.filter((job) => job.status === 'success').length;
  const issueCount = jobs.filter((job) => ['failed', 'interrupted'].includes(job.status)).length;

  homeEls.jobStatusSummary.innerHTML = `
    <div class="job-summary-main">
      <span class="job-status-dot ${escapeHtml(meta.tone)}" aria-hidden="true"></span>
      <div>
        <div class="job-summary-title">${escapeHtml(title)}</div>
        <div class="job-summary-subtitle">${escapeHtml(subtitle)}</div>
      </div>
    </div>
    <div class="job-summary-stats" aria-label="任务统计">
      <span><strong>${escapeHtml(runningJobs.length)}</strong>运行中</span>
      <span><strong>${escapeHtml(successCount)}</strong>完成</span>
      <span><strong>${escapeHtml(issueCount)}</strong>异常</span>
    </div>
  `;
}

function renderJobFilters(jobs) {
  if (!homeEls.jobFilters) return;
  const options = jobFilterOptions(jobs);
  if (!options.some((option) => option.value === state.jobFilter)) {
    state.jobFilter = 'all';
  }

  homeEls.jobFilters.innerHTML = options.map((option) => {
    const active = option.value === state.jobFilter;
    return `
      <button
        class="job-filter${active ? ' active' : ''}"
        type="button"
        role="tab"
        aria-selected="${active ? 'true' : 'false'}"
        data-job-filter="${escapeHtml(option.value)}"
      >
        <span>${escapeHtml(option.label)}</span>
        <strong>${escapeHtml(option.count)}</strong>
      </button>
    `;
  }).join('');
}

function saveJobLogOpenState() {
  if (!homeEls.jobList) return;
  homeEls.jobList.querySelectorAll('.job-detail[data-job-id]').forEach((element) => {
    state.jobLogOpenState.set(element.dataset.jobId, element.open);
  });
}

function saveJobLogScrollState() {
  if (!homeEls.jobList) return;
  homeEls.jobList.querySelectorAll('.job-log[data-job-id]').forEach((element) => {
    const jobId = element.dataset.jobId;
    state.jobLogScrollState.set(jobId, {
      stickToBottom: isNearBottom(element),
      offsetFromBottom: Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop),
    });
  });
}

function pruneJobUiState(visibleJobIds) {
  Array.from(state.jobLogScrollState.keys()).forEach((jobId) => {
    if (!visibleJobIds.has(jobId)) {
      state.jobLogScrollState.delete(jobId);
    }
  });
  Array.from(state.jobLogOpenState.keys()).forEach((jobId) => {
    if (!visibleJobIds.has(jobId)) {
      state.jobLogOpenState.delete(jobId);
    }
  });
}

function bindJobLogAutoScroll() {
  if (!homeEls.jobList) return;
  const visibleJobIds = new Set();

  homeEls.jobList.querySelectorAll('.job-log[data-job-id]').forEach((element) => {
    const jobId = element.dataset.jobId;
    const previous = state.jobLogScrollState.get(jobId);
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    visibleJobIds.add(jobId);

    if (!previous || previous.stickToBottom) {
      element.scrollTop = element.scrollHeight;
    } else {
      element.scrollTop = Math.max(0, maxScrollTop - previous.offsetFromBottom);
    }

    element.addEventListener('scroll', () => {
      state.jobLogScrollState.set(jobId, {
        stickToBottom: isNearBottom(element),
        offsetFromBottom: Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop),
      });
    }, { passive: true });
  });

  homeEls.jobList.querySelectorAll('.job-detail[data-job-id]').forEach((element) => {
    const jobId = element.dataset.jobId;
    visibleJobIds.add(jobId);
    element.addEventListener('toggle', () => {
      state.jobLogOpenState.set(jobId, element.open);
    });
  });

  pruneJobUiState(visibleJobIds);
}

function renderJobEmptyState(message) {
  homeEls.jobList.classList.add('muted', 'job-list-empty');
  homeEls.jobList.innerHTML = `<div class="job-empty-state">${escapeHtml(message)}</div>`;
}

function renderJobs(jobs) {
  if (!homeEls.jobList) return;
  const allJobs = Array.isArray(jobs) ? jobs : [];
  state.currentJobs = allJobs;
  renderJobStatusSummary(allJobs);
  renderJobFilters(allJobs);

  if (allJobs.length === 0) {
    state.jobLogScrollState.clear();
    state.jobLogOpenState.clear();
    renderJobEmptyState('暂无任务记录');
    return;
  }

  saveJobLogScrollState();
  saveJobLogOpenState();

  const visibleJobs = filterJobs(allJobs).slice(0, 8);
  if (!visibleJobs.length) {
    renderJobEmptyState('该状态下暂无任务');
    return;
  }

  homeEls.jobList.classList.remove('muted', 'job-list-empty');
  homeEls.jobList.innerHTML = visibleJobs.map((job) => {
    const meta = jobStatusMeta(job.status);
    const summary = job.summary || {};
    const logs = Array.isArray(job.logs) ? job.logs : [];
    const logText = logs.map((item) => `[${item.time}] ${item.message}`).join('\n');
    const progress = jobProgress(job);
    const highlight = job.id === state.highlightedJobId ? ' job-card-highlight' : '';
    const storedOpen = state.jobLogOpenState.get(job.id);
    const shouldOpen = storedOpen !== undefined ? storedOpen : (job.status === 'running' || job.id === state.highlightedJobId);
    const metricHtml = jobMetricItems(job).map((item) => `
      <div class="job-metric">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
      </div>
    `).join('');
    const detailHtml = logs.length ? `
      <details class="job-detail" data-job-id="${escapeHtml(job.id)}"${shouldOpen ? ' open' : ''}>
        <summary>
          <span>运行日志</span>
          <strong>${escapeHtml(logs.length)} 条</strong>
        </summary>
        <pre class="job-log" data-job-id="${escapeHtml(job.id)}">${escapeHtml(logText)}</pre>
      </details>
    ` : '';

    return `
      <article class="job-card job-status-${escapeHtml(meta.tone)}${highlight}" data-job-card-id="${escapeHtml(job.id)}">
        <div class="job-card-top">
          <div class="job-title-block">
            <div class="job-title-row">
              <span class="job-status-dot ${escapeHtml(meta.tone)}" aria-hidden="true"></span>
              <strong class="job-title">${escapeHtml(jobKeywords(summary))}</strong>
              <span class="job-id">#${escapeHtml(job.id)}</span>
            </div>
            <div class="job-subtitle">${escapeHtml(jobSourceLabel(job.source))} · ${escapeHtml(compactTime(job.started_at || job.created_at))} · ${escapeHtml(jobScopeText(summary))}</div>
          </div>
          <div class="job-card-actions">
            <button class="job-copy-id" type="button" data-job-id="${escapeHtml(job.id)}">复制ID</button>
            <span class="badge ${escapeHtml(meta.tone)}">${escapeHtml(meta.label)}</span>
          </div>
        </div>
        <div class="job-progress" aria-label="${escapeHtml(progress.label)}">
          <span style="width: ${escapeHtml(progress.value)}%"></span>
        </div>
        <div class="job-card-grid">${metricHtml}</div>
        <div class="job-latest">${escapeHtml(jobPrimaryMessage(job))}</div>
        ${detailHtml}
      </article>
    `;
  }).join('');
  bindJobLogAutoScroll();
}

async function loadJobs() {
  if (!homeEls.jobList) return;
  const data = await api('/api/jobs');
  renderJobs(data.jobs || []);
}

function sizeText(size) {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function fileBaseName(path = '') {
  const parts = String(path || '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function defaultPreviewState(overrides = {}) {
  return {
    path: '',
    meta: '',
    content: '选择 Markdown / JSON / TXT 文件。',
    ...overrides,
  };
}

function updateFileToolbarState() {
  if (homeEls.fileSelectionSummary) {
    homeEls.fileSelectionSummary.textContent = `已选 ${state.selectedFilePaths.size} 项`;
  }
  if (homeEls.deleteSelectedBtn) {
    homeEls.deleteSelectedBtn.disabled = state.collectBusy || state.selectedFilePaths.size === 0;
  }
  if (homeEls.refreshFilesBtn) {
    homeEls.refreshFilesBtn.disabled = state.collectBusy;
  }
}

function setPreviewState({
  path = '',
  meta = '',
  content = '选择 Markdown / JSON / TXT 文件。',
} = {}) {
  if (!homeEls.filePreview) return;
  state.currentPreviewPath = path;
  if (homeEls.filePreviewMeta) {
    homeEls.filePreviewMeta.textContent = meta;
  }
  homeEls.filePreview.textContent = content;
}

async function openFolder(path = '') {
  await api('/api/files/open', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
  toast('已打开文件夹');
}

function setCurrentFiles(files) {
  state.currentFiles = files;
  state.currentFileEntries = new Map((files?.entries || []).map((entry) => [entry.path, entry]));
}

function clearFileSelection() {
  state.selectedFilePaths = new Set();
  updateFileToolbarState();
}

function toggleFileSelection(path, checked) {
  const next = new Set(state.selectedFilePaths);
  if (checked) {
    next.add(path);
  } else {
    next.delete(path);
  }
  state.selectedFilePaths = next;
  updateFileToolbarState();
}

function shouldResetPreview(removedPaths) {
  if (!state.currentPreviewPath) return false;
  return removedPaths.some((path) => (
    state.currentPreviewPath === path || state.currentPreviewPath.startsWith(`${path}/`)
  ));
}

async function deleteEntries(paths, label = '') {
  const targets = Array.from(new Set((paths || []).map((value) => String(value || '').trim()).filter(Boolean)));
  if (!targets.length) {
    toast('请选择要删除的文件或目录');
    return;
  }
  const confirmText = targets.length === 1
    ? `确定删除“${label || fileBaseName(targets[0]) || '该项'}”吗？`
    : `确定删除已选 ${targets.length} 项吗？`;
  if (!window.confirm(confirmText)) return;

  const data = await api('/api/files/delete', {
    method: 'POST',
    body: JSON.stringify({ paths: targets }),
  });

  if (shouldResetPreview(data.deleted_paths || targets)) {
    setPreviewState(defaultPreviewState());
  }
  await loadFiles(state.currentPath);
  toast(targets.length === 1 ? '已删除' : `已删除 ${data.deleted_count || targets.length} 项`);
}

function renderFiles(files) {
  if (!homeEls.fileList) return;
  setCurrentFiles(files);
  updateFileToolbarState();

  const disabledAttr = state.collectBusy ? 'disabled' : '';
  const parentButton = files.cwd
    ? `<button class="file-parent-item" data-kind="directory" data-path="${escapeHtml(files.parent || '')}" type="button" ${disabledAttr}><span>../ 返回上级</span><span class="file-meta">目录</span></button>`
    : '';
  const rows = files.entries.map((entry) => `
    <div class="file-row" data-path="${escapeHtml(entry.path)}">
      <label class="file-select" aria-label="选择 ${escapeHtml(entry.name)}">
        <input class="file-select-input" data-path="${escapeHtml(entry.path)}" type="checkbox" ${state.selectedFilePaths.has(entry.path) ? 'checked' : ''} ${disabledAttr}>
      </label>
      <button
        class="file-entry-button"
        data-kind="${entry.type}"
        data-path="${escapeHtml(entry.path)}"
        data-name="${escapeHtml(entry.name)}"
        data-previewable="${entry.previewable ? 'true' : 'false'}"
        type="button"
        ${disabledAttr}
      >
        <span>${entry.type === 'directory' ? escapeHtml(entry.name) : `[文件] ${escapeHtml(entry.name)}`}</span>
        <span class="file-meta">${entry.type === 'directory' ? '目录' : sizeText(entry.size)} · ${escapeHtml(entry.modified)}</span>
      </button>
      <div class="file-actions">
        <button class="btn btn-ghost file-action-btn" data-action="open-folder" data-path="${escapeHtml(entry.path)}" type="button" ${disabledAttr}>打开所在文件夹</button>
        <button class="btn btn-ghost file-action-btn file-delete-btn" data-action="delete" data-path="${escapeHtml(entry.path)}" data-name="${escapeHtml(entry.name)}" type="button" ${disabledAttr}>删除</button>
      </div>
    </div>
  `).join('');
  homeEls.fileList.innerHTML = parentButton + (rows || '<div class="empty-state">目录为空</div>');

  homeEls.fileList.querySelectorAll('.file-parent-item').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const path = button.dataset.path || '';
        setPreviewState(defaultPreviewState({
          meta: '已进入目录。',
          content: '继续选择 Markdown / JSON / TXT 文件进行预览。',
        }));
        await loadFiles(path);
      } catch (error) {
        toast(error.message);
      }
    });
  });

  homeEls.fileList.querySelectorAll('.file-select-input').forEach((input) => {
    input.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    input.addEventListener('change', () => {
      toggleFileSelection(input.dataset.path || '', input.checked);
    });
  });

  homeEls.fileList.querySelectorAll('.file-entry-button').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const path = button.dataset.path || '';
        const name = button.dataset.name || fileBaseName(path);
        if (button.dataset.kind === 'directory') {
          setPreviewState(defaultPreviewState({
            meta: '已进入目录。',
            content: '继续选择 Markdown / JSON / TXT 文件进行预览。',
          }));
          await loadFiles(path);
          return;
        }

        if (button.dataset.previewable === 'true') {
          await previewFile(path);
          return;
        }

        setPreviewState({
          path,
          meta: `${name} 不支持文本预览。`,
          content: '该文件不支持文本预览，已尝试在新窗口打开。',
        });
        window.open(`/download?path=${encodeURIComponent(path)}`, '_blank', 'noopener');
      } catch (error) {
        toast(error.message);
      }
    });
  });

  homeEls.fileList.querySelectorAll('.file-action-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      try {
        event.preventDefault();
        event.stopPropagation();
        const path = button.dataset.path || '';
        if (!path) return;
        if (button.dataset.action === 'open-folder') {
          await openFolder(path);
          return;
        }
        if (button.dataset.action === 'delete') {
          await deleteEntries([path], button.dataset.name || fileBaseName(path));
        }
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

async function loadFiles(path = state.currentPath) {
  if (!homeEls.fileList) return;
  const data = await api(`/api/files?path=${encodeURIComponent(path || '')}`);
  state.currentPath = data.files.cwd || '';
  clearFileSelection();
  renderFiles(data.files);
}

async function previewFile(path) {
  const data = await api(`/api/file?path=${encodeURIComponent(path)}`);
  const entryName = state.currentFileEntries.get(path)?.name || fileBaseName(data.file.path);
  setPreviewState({
    path,
    meta: entryName ? `预览：${entryName}` : '文件预览',
    content: `${data.file.content}${data.file.truncated ? '\n\n...内容过长，已截断预览' : ''}`,
  });
}

function bindCollectionConfigEvents() {
  if (homeEls.addKeywordBtn) {
    homeEls.addKeywordBtn.addEventListener('click', () => {
      const keyword = createKeywordItem('');
      state.keywordItems.push(keyword);
      renderKeywordList({ focusId: keyword.id });
    });
  }
  if (homeEls.pickOutputDirBtn) {
    homeEls.pickOutputDirBtn.addEventListener('click', () => {
      pickOutputFolder().catch((error) => toast(error.message));
    });
  }
  if (homeEls.resetOutputDirBtn) {
    homeEls.resetOutputDirBtn.addEventListener('click', resetOutputFolder);
  }
}

function bindHomeEvents() {
  if (homeEls.collectBtn) {
    homeEls.collectBtn.addEventListener('click', () => {
      startCollect().catch((error) => {
        setCollectOverlay({
          open: true,
          status: 'error',
          title: '启动采集失败',
          detail: error.message || '启动采集时发生错误，请稍后重试。',
          dismissible: true,
        });
        setHomeBusy(false);
      });
    });
  }
  if (homeEls.collectOverlayCloseBtn) {
    homeEls.collectOverlayCloseBtn.addEventListener('click', closeCollectOverlay);
  }
  if (homeEls.refreshJobsBtn) {
    homeEls.refreshJobsBtn.addEventListener('click', async () => {
      homeEls.refreshJobsBtn.disabled = true;
      try {
        await loadJobs();
        toast('任务状态已刷新');
      } catch (error) {
        toast(error.message);
      } finally {
        homeEls.refreshJobsBtn.disabled = false;
      }
    });
  }
  if (homeEls.jobFilters) {
    homeEls.jobFilters.addEventListener('click', (event) => {
      const button = event.target.closest('[data-job-filter]');
      if (!button) return;
      state.jobFilter = button.dataset.jobFilter || 'all';
      renderJobs(state.currentJobs);
    });
  }
  if (homeEls.jobList) {
    homeEls.jobList.addEventListener('click', (event) => {
      const button = event.target.closest('.job-copy-id');
      if (!button) return;
      copyText(button.dataset.jobId || '')
        .then(() => toast('任务 ID 已复制'))
        .catch((error) => toast(error.message || '复制失败'));
    });
  }
  if (homeEls.deleteSelectedBtn) {
    homeEls.deleteSelectedBtn.addEventListener('click', () => {
      deleteEntries(Array.from(state.selectedFilePaths)).catch((error) => toast(error.message));
    });
  }
  if (homeEls.refreshFilesBtn) {
    homeEls.refreshFilesBtn.addEventListener('click', () => {
      loadFiles().catch((error) => toast(error.message));
    });
  }
}

function bindSettingsEvents() {
  bindCollectionConfigEvents();
  if (settingsEls.saveConfigBtn) {
    settingsEls.saveConfigBtn.addEventListener('click', () => {
      saveSettings().catch((error) => toast(error.message));
    });
  }
  if (settingsEls.checkLoginBtn) {
    settingsEls.checkLoginBtn.addEventListener('click', () => {
      checkLogin().catch((error) => toast(error.message));
    });
  }
  if (settingsEls.openLoginBrowserBtn) {
    settingsEls.openLoginBrowserBtn.addEventListener('click', () => {
      startBrowserLogin().catch((error) => toast(error.message));
    });
  }
  if (settingsEls.openExternalLoginBrowserBtn) {
    settingsEls.openExternalLoginBrowserBtn.addEventListener('click', () => {
      startExternalBrowserLogin().catch((error) => toast(error.message));
    });
  }
  if (settingsEls.cycleInput) {
    settingsEls.cycleInput.addEventListener('change', updateScheduleView);
  }
}

async function bootHome() {
  bindHomeEvents();
  await loadHomeConfig();
  setPreviewState(defaultPreviewState());
  await loadJobs();
  await loadFiles('');
  state.jobPoller = window.setInterval(() => {
    loadJobs().catch(() => {});
  }, 5000);
}

async function bootSettings() {
  bindSettingsEvents();
  await loadSettingsConfig();
  await syncBrowserLoginStatus();
}

function cleanup() {
  if (state.jobPoller) {
    window.clearInterval(state.jobPoller);
  }
  stopLoginPolling();
}

async function boot() {
  applyDesktopMode();
  bindThemeEvents();
  if (page === 'settings') {
    await bootSettings();
    return;
  }
  await bootHome();
}

window.addEventListener('beforeunload', cleanup);

boot().catch((error) => toast(error.message));
