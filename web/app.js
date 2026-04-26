const page = document.body.dataset.page || 'home';
const THEME_STORAGE_KEY = 'spider_xhs_theme';
const SIDEBAR_STORAGE_KEY = 'spider_xhs_sidebar';
const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');

const sharedEls = {
  toast: document.querySelector('#toast'),
  themeButtons: Array.from(document.querySelectorAll('[data-theme-option]')),
  sidebarToggle: document.querySelector('[data-sidebar-toggle]'),
};

const homeEls = {
  keywordList: document.querySelector('#keywordList'),
  addKeywordBtn: document.querySelector('#addKeywordBtn'),
  outputDirText: document.querySelector('#outputDirText'),
  outputDirSummary: document.querySelector('#outputDirSummary'),
  openOutputDirBtn: document.querySelector('#openOutputDirBtn'),
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
  jobTypeFilters: document.querySelector('#jobTypeFilters'),
  jobPagination: document.querySelector('#jobPagination'),
  refreshJobsBtn: document.querySelector('#refreshJobsBtn'),
  jobSelectionWrap: document.querySelector('#jobSelectionWrap'),
  jobSelectionSummary: document.querySelector('#jobSelectionSummary'),
  selectAllJobsBtn: document.querySelector('#selectAllJobsBtn'),
  clearJobSelectionBtn: document.querySelector('#clearJobSelectionBtn'),
  deleteSelectedJobsBtn: document.querySelector('#deleteSelectedJobsBtn'),
  jobMultiSelectModeBtn: document.querySelector('#jobMultiSelectModeBtn'),
  deleteSelectedBtn: document.querySelector('#deleteSelectedBtn'),
  rewriteSelectedBtn: document.querySelector('#rewriteSelectedBtn'),
  multiSelectModeBtn: document.querySelector('#multiSelectModeBtn'),
  refreshFilesBtn: document.querySelector('#refreshFilesBtn'),
  selectAllFilesBtn: document.querySelector('#selectAllFilesBtn'),
  clearFileSelectionBtn: document.querySelector('#clearFileSelectionBtn'),
  fileLayout: document.querySelector('#fileLayout'),
  fileLayoutResizer: document.querySelector('#fileLayoutResizer'),
  fileList: document.querySelector('#fileList'),
  fileListMeta: document.querySelector('#fileListMeta'),
  fileBreadcrumbs: document.querySelector('#fileBreadcrumbs'),
  filePreviewPanel: document.querySelector('#filePreviewPanel'),
  filePreview: document.querySelector('#filePreview'),
  filePreviewMeta: document.querySelector('#filePreviewMeta'),
  filePreviewSubMeta: document.querySelector('#filePreviewSubMeta'),
  previewEditBtn: document.querySelector('#previewEditBtn'),
  previewRewriteBtn: document.querySelector('#previewRewriteBtn'),
  previewRewritePopover: document.querySelector('#previewRewritePopover'),
  previewRewriteInput: document.querySelector('#previewRewriteInput'),
  previewRewriteName: document.querySelector('#previewRewriteName'),
  submitPreviewRewriteBtn: document.querySelector('#submitPreviewRewriteBtn'),
  cancelPreviewRewriteBtn: document.querySelector('#cancelPreviewRewriteBtn'),
  copyPreviewTextBtn: document.querySelector('#copyPreviewTextBtn'),
  previewFullscreenBtn: document.querySelector('#previewFullscreenBtn'),
  closePreviewBtn: document.querySelector('#closePreviewBtn'),
  markdownImageLightbox: document.querySelector('#markdownImageLightbox'),
  markdownImageLightboxImg: document.querySelector('#markdownImageLightboxImg'),
  markdownImageLightboxTitle: document.querySelector('#markdownImageLightboxTitle'),
  markdownImageLightboxStatus: document.querySelector('#markdownImageLightboxStatus'),
  closeMarkdownImageLightboxBtn: document.querySelector('#closeMarkdownImageLightboxBtn'),
  fileSelectionWrap: document.querySelector('#fileSelectionWrap'),
  fileSelectionSummary: document.querySelector('#fileSelectionSummary'),
  recentCrawledMdList: document.querySelector('#recentCrawledMdList'),
  recentRewriteMdList: document.querySelector('#recentRewriteMdList'),
  recentCrawledMdMeta: document.querySelector('#recentCrawledMdMeta'),
  recentRewriteMdMeta: document.querySelector('#recentRewriteMdMeta'),
  refreshRecentMdBtn: document.querySelector('#refreshRecentMdBtn'),
  mdQuickShell: document.querySelector('.md-quick-shell'),
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
  rewriteEnabledInput: document.querySelector('#rewriteEnabledInput'),
  rewriteApiKeyInput: document.querySelector('#rewriteApiKeyInput'),
  rewriteApiKeyToggleBtn: document.querySelector('#rewriteApiKeyToggleBtn'),
  rewriteTopicSettingsInput: document.querySelector('#rewriteTopicSettingsInput'),
  rewriteRequirementSummary: document.querySelector('#rewriteRequirementSummary'),
  rewriteTextModelInput: document.querySelector('#rewriteTextModelInput'),
  rewriteImageModelInput: document.querySelector('#rewriteImageModelInput'),
  rewriteRegionInput: document.querySelector('#rewriteRegionInput'),
  rewriteGenerateImagesInput: document.querySelector('#rewriteGenerateImagesInput'),
  rewriteApiStatus: document.querySelector('#rewriteApiStatus'),
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
  fileTreeCache: new Map(),
  fileTreeExpandedPaths: new Set(['']),
  fileTreeLoadingPaths: new Set(),
  fileTreeLoadPromises: new Map(),
  fileTreeVisibleNodes: [],
  renamePath: '',
  renameSaving: false,
  currentPreviewPath: '',
  currentPreviewContent: '',
  currentPreviewMode: 'text',
  currentPreviewSubMeta: '',
  currentPreviewTruncated: false,
  previewFullscreen: false,
  previewEditorActive: false,
  previewEditorDraft: '',
  previewEditorDirty: false,
  previewEditorSaving: false,
  previewEditorSaveTimer: null,
  previewEditorSavePromise: null,
  previewEditorSaveError: '',
  previewEditorLastSavedContent: '',
  previewEditorSavedOnce: false,
  previewEditorInstance: null,
  previewEditorMount: null,
  previewRewriteOpen: false,
  previewRewritePath: '',
  markdownImageLightboxPreviousFocus: null,
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
  jobTypeFilter: 'all',
  jobPage: 1,
  jobPageSize: 10,
  currentJobs: [],
  jobMultiSelectMode: false,
  selectedJobIds: new Set(),
  recentMarkdown: {
    crawled: [],
    rewritten: [],
  },
  collectBusy: false,
  rewriteBusy: false,
  savedRewriteApiKey: '',
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
  sidebarCollapsed: document.documentElement.dataset.sidebar === 'collapsed',
  desktopMode: false,
  multiSelectMode: false,
  fileDetailExpandedPaths: new Set(),
  selectedFilePaths: new Set(),
};

const JOB_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_JOB_PAGE_SIZE = 10;
const FILE_LAYOUT_DEFAULT_LIST_PERCENT = 20;
const FILE_LAYOUT_MIN_LIST_PERCENT = 16;
const FILE_LAYOUT_MAX_LIST_PERCENT = 55;
const MARKDOWN_AUTOSAVE_DELAY_MS = 700;
const VDITOR_CDN = '/vendor/vditor';
const MARKDOWN_EDITOR_TOOLBAR = [
  'headings',
  'bold',
  'italic',
  'strike',
  'link',
  '|',
  'list',
  'ordered-list',
  'check',
  'outdent',
  'indent',
  '|',
  'quote',
  'line',
  'code',
  'inline-code',
  'table',
  '|',
  'undo',
  'redo',
];

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

function applySidebarState(collapsed, { persist = false } = {}) {
  state.sidebarCollapsed = Boolean(collapsed);
  document.documentElement.dataset.sidebar = state.sidebarCollapsed ? 'collapsed' : 'expanded';

  if (sharedEls.sidebarToggle) {
    const label = state.sidebarCollapsed ? '展开左侧菜单' : '收起左侧菜单';
    const labelNode = sharedEls.sidebarToggle.querySelector('.sidebar-toggle-label');
    sharedEls.sidebarToggle.setAttribute('aria-label', label);
    sharedEls.sidebarToggle.setAttribute('aria-expanded', state.sidebarCollapsed ? 'false' : 'true');
    sharedEls.sidebarToggle.setAttribute('title', label);
    if (labelNode) {
      labelNode.textContent = state.sidebarCollapsed ? '展开菜单' : '收起菜单';
    }
  }

  if (!persist) return;
  try {
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      state.sidebarCollapsed ? 'collapsed' : 'expanded',
    );
  } catch (_error) {
    // Ignore storage failures and keep the current view state.
  }
}

function bindSidebarEvents() {
  applySidebarState(document.documentElement.dataset.sidebar === 'collapsed');

  if (!sharedEls.sidebarToggle) return;
  sharedEls.sidebarToggle.addEventListener('click', () => {
    applySidebarState(!state.sidebarCollapsed, { persist: true });
    toast(state.sidebarCollapsed ? '左侧菜单已收起' : '左侧菜单已展开');
  });
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
  const displayPath = state.outputDirDisplay || state.defaultOutputRoot;
  const isDefaultPath = !state.selectedOutputDir;
  if (homeEls.outputDirSummary) {
    homeEls.outputDirSummary.textContent = isDefaultPath ? '默认目录' : '自定义目录';
  }
  if (homeEls.outputDirText) {
    homeEls.outputDirText.textContent = displayPath;
    homeEls.outputDirText.classList.toggle('is-default', isDefaultPath);
  }
  if (homeEls.openOutputDirBtn) {
    homeEls.openOutputDirBtn.disabled = state.collectBusy;
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
    homeEls.jobMultiSelectModeBtn,
    homeEls.selectAllJobsBtn,
    homeEls.clearJobSelectionBtn,
    homeEls.deleteSelectedJobsBtn,
    homeEls.deleteSelectedBtn,
    homeEls.multiSelectModeBtn,
    homeEls.refreshFilesBtn,
    homeEls.selectAllFilesBtn,
    homeEls.clearFileSelectionBtn,
    homeEls.closePreviewBtn,
  ].forEach((element) => {
    if (element) {
      element.disabled = isBusy;
    }
  });

  renderKeywordList();
  renderOutputDirSelection();
  renderHomeChoices();
  updateJobToolbarState();
  if (state.currentFiles) {
    renderFiles(state.currentFiles);
  } else {
    updateFileToolbarState();
  }
  updatePreviewRewriteState();
}

function findJobCard(jobId) {
  if (!jobId || !homeEls.jobList) return null;
  return homeEls.jobList.querySelector(`[data-job-card-id="${jobId}"]`);
}

function ensureJobVisibleOnCurrentPage(jobId) {
  if (!jobId) return;
  const targetJob = state.currentJobs.find((job) => job.id === jobId);
  if (!targetJob) return;
  if (!filterJobs([targetJob]).length) {
    state.jobFilter = 'all';
    state.jobTypeFilter = 'all';
  }
  const filteredJobs = filterJobs(state.currentJobs);
  const index = filteredJobs.findIndex((job) => job.id === jobId);
  if (index >= 0) {
    state.jobPage = Math.floor(index / state.jobPageSize) + 1;
  }
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
    ensureJobVisibleOnCurrentPage(jobId);
    renderJobs(state.currentJobs);
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

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(String(value ?? ''));
  }
  return String(value ?? '').replace(/["\\]/g, '\\$&');
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

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeJobPageSize(value) {
  const size = Number(value);
  return JOB_PAGE_SIZE_OPTIONS.includes(size) ? size : DEFAULT_JOB_PAGE_SIZE;
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
    const label = state.desktopMode ? '打开登录窗口' : '打开浏览器登录';
    const labelNode = settingsEls.openLoginBrowserBtn.querySelector('.btn-label');
    if (labelNode) {
      labelNode.textContent = label;
    } else {
      settingsEls.openLoginBrowserBtn.textContent = label;
    }
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

function renderChoiceSelect(select, choiceMap, value, onSelect, { disabled = false } = {}) {
  if (!select) return;
  const entries = Object.entries(choiceMap || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  select.innerHTML = entries.map(([key, label]) => (
    `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`
  )).join('');
  select.value = String(value);
  select.disabled = disabled;
  select.onchange = () => {
    onSelect(Number(select.value));
  };
}

function renderHomeChoices() {
  renderChoiceSelect(homeEls.sortTypeChoices, state.choices.sort_type, state.homeFilters.sort_type, (selected) => {
    state.homeFilters.sort_type = selected;
    renderHomeChoices();
  }, { disabled: state.collectBusy });
  renderChoiceSelect(homeEls.contentTypeChoices, state.choices.content_type, state.homeFilters.content_type, (selected) => {
    state.homeFilters.content_type = selected;
    renderHomeChoices();
  }, { disabled: state.collectBusy });
  renderChoiceSelect(homeEls.publishTimeChoices, state.choices.publish_time, state.homeFilters.publish_time, (selected) => {
    state.homeFilters.publish_time = selected;
    renderHomeChoices();
  }, { disabled: state.collectBusy });
  renderChoiceSelect(homeEls.noteRangeChoices, state.choices.note_range, state.homeFilters.note_range, (selected) => {
    state.homeFilters.note_range = selected;
    renderHomeChoices();
  }, { disabled: state.collectBusy });
  renderChoiceSelect(homeEls.posDistanceChoices, state.choices.pos_distance, state.homeFilters.pos_distance, (selected) => {
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
  state.jobPageSize = normalizeJobPageSize(config.ui?.job_page_size);
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

function applyRewriteSummary(config) {
  if (!settingsEls.rewriteApiStatus) return;
  const rewrite = config.rewrite || {};
  const requirement = rewrite.topic || '创业沙龙';
  const source = rewrite.api_key_source ? ` · 来源：${rewrite.api_key_source}` : '';
  const preview = rewrite.api_key_preview ? ` · ${rewrite.api_key_preview}` : '';
  const textModel = rewrite.text_model || 'qwen-plus';
  const imageModel = rewrite.image_model || 'wan2.6-image';
  const message = rewrite.api_key_present
    ? `模型配置可用${source}${preview} · ${textModel} / ${imageModel} · 默认要求：${truncateText(requirement, 36)}`
    : '未配置 DashScope API Key，仿写接口会等待模型密钥';
  settingsEls.rewriteApiStatus.textContent = message;
  settingsEls.rewriteApiStatus.className = `status-panel ${rewrite.api_key_present ? 'good' : 'muted'}`;
}

function updateRewriteRequirementSummary() {
  if (!settingsEls.rewriteRequirementSummary) return;
  const requirement = (settingsEls.rewriteTopicSettingsInput?.value || '').trim() || '创业沙龙';
  settingsEls.rewriteRequirementSummary.textContent = truncateText(requirement.replace(/\s+/g, ' '), 34);
}

function setRewriteApiKeyVisible(visible) {
  const input = settingsEls.rewriteApiKeyInput;
  const toggle = settingsEls.rewriteApiKeyToggleBtn;
  if (!input) return;
  const hasValue = Boolean(input.value);
  const nextVisible = hasValue && visible;
  input.type = nextVisible ? 'text' : 'password';
  if (!toggle) return;
  toggle.disabled = !hasValue;
  toggle.classList.toggle('is-visible', nextVisible);
  toggle.title = nextVisible ? '隐藏 API Key' : '显示 API Key';
  toggle.setAttribute('aria-label', nextVisible ? '隐藏 DashScope API Key' : '显示 DashScope API Key');
  toggle.setAttribute('aria-pressed', String(nextVisible));
}

function applyRewriteApiKeyField(rewrite) {
  if (!settingsEls.rewriteApiKeyInput) return;
  const apiKey = typeof rewrite.api_key === 'string' ? rewrite.api_key.trim() : '';
  state.savedRewriteApiKey = apiKey;
  settingsEls.rewriteApiKeyInput.value = apiKey;
  settingsEls.rewriteApiKeyInput.placeholder = rewrite.api_key_present
    ? '已保存 DashScope API Key，可直接修改或粘贴新 Key 覆盖'
    : '粘贴 DashScope API Key 后保存';
  setRewriteApiKeyVisible(false);
}

function applySettingsConfig(config) {
  if (!settingsEls.saveConfigBtn) return;
  const collect = config.collect || {};
  const schedule = config.schedule || {};
  const rewrite = config.rewrite || {};

  applyHomeConfig(config);
  applyLoginSummary(config);
  applyRewriteSummary(config);
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
  if (settingsEls.rewriteEnabledInput) settingsEls.rewriteEnabledInput.checked = Boolean(rewrite.enabled);
  applyRewriteApiKeyField(rewrite);
  if (settingsEls.rewriteTopicSettingsInput) settingsEls.rewriteTopicSettingsInput.value = rewrite.topic || '创业沙龙';
  updateRewriteRequirementSummary();
  if (settingsEls.rewriteTextModelInput) settingsEls.rewriteTextModelInput.value = rewrite.text_model || 'qwen-plus';
  if (settingsEls.rewriteImageModelInput) settingsEls.rewriteImageModelInput.value = rewrite.image_model || 'wan2.6-image';
  if (settingsEls.rewriteRegionInput) settingsEls.rewriteRegionInput.value = rewrite.region || 'cn-beijing';
  if (settingsEls.rewriteGenerateImagesInput) settingsEls.rewriteGenerateImagesInput.checked = Boolean(rewrite.generate_images);

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
  const rewriteApiKeyValue = (settingsEls.rewriteApiKeyInput?.value || '').trim();
  const rewriteApiKeyChanged = Boolean(rewriteApiKeyValue && rewriteApiKeyValue !== state.savedRewriteApiKey);
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
    rewrite: {
      enabled: Boolean(settingsEls.rewriteEnabledInput?.checked),
      api_key: rewriteApiKeyChanged ? rewriteApiKeyValue : '',
      topic: (settingsEls.rewriteTopicSettingsInput?.value || '创业沙龙').trim() || '创业沙龙',
      text_model: (settingsEls.rewriteTextModelInput?.value || 'qwen-plus').trim() || 'qwen-plus',
      image_model: (settingsEls.rewriteImageModelInput?.value || 'wan2.6-image').trim() || 'wan2.6-image',
      region: settingsEls.rewriteRegionInput?.value || 'cn-beijing',
      generate_image_prompts: true,
      generate_images: Boolean(settingsEls.rewriteGenerateImagesInput?.checked),
    },
  };
}

async function saveSettings() {
  const draft = readSettingsDraft();
  const submittedApiKey = Boolean(draft.rewrite?.api_key);
  const data = await api('/api/config', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
  state.config = data.config;
  state.choices = data.config?.choices || state.choices;
  applySettingsConfig(data.config);
  const rewrite = data.config?.rewrite || {};
  if (submittedApiKey && rewrite.api_key_present) {
    toast(`设置已保存，DashScope API Key 已更新${rewrite.api_key_preview ? `：${rewrite.api_key_preview}` : ''}`);
    return;
  }
  if (rewrite.api_key_present) {
    toast(`设置已保存，已保留 DashScope API Key${rewrite.api_key_preview ? `：${rewrite.api_key_preview}` : ''}`);
    return;
  }
  toast('设置已保存，尚未配置 DashScope API Key');
}

async function pickOutputFolder() {
  const currentPath = state.outputDirDisplay || state.selectedOutputDir || state.currentOutputRoot || state.defaultOutputRoot;
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

function jobSourceLabel(source, type = 'collect') {
  if (type === 'rewrite') {
    return source === 'schedule' ? '自动仿写' : '手动仿写';
  }
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

const JOB_LOG_GROUPS = {
  crawl: { label: '爬取日志' },
  rewrite: { label: '创作日志' },
};

function normalizeJobLogEntry(item, fallbackType = '') {
  if (item && typeof item === 'object') {
    const type = ['crawl', 'rewrite'].includes(item.type) ? item.type : fallbackType;
    return {
      time: String(item.time || ''),
      message: String(item.message || ''),
      type,
    };
  }
  return {
    time: '',
    message: String(item || ''),
    type: fallbackType,
  };
}

function looksLikeRewriteLog(message) {
  return /仿写|文本模型|配图|DashScope|DASHSCOPE|阿里百炼|图片任务|图片生成/.test(String(message || ''));
}

function jobLogGroups(job) {
  const groups = { crawl: [], rewrite: [] };
  const storedGroups = job.log_groups || job.logGroups;
  if (storedGroups && typeof storedGroups === 'object') {
    Object.keys(groups).forEach((key) => {
      const entries = Array.isArray(storedGroups[key]) ? storedGroups[key] : [];
      groups[key] = entries.map((item) => normalizeJobLogEntry(item, key));
    });
  }

  if (!groups.crawl.length && !groups.rewrite.length) {
    let rewriteActive = (job.type || 'collect') === 'rewrite';
    const logs = Array.isArray(job.logs) ? job.logs : [];
    logs.forEach((item) => {
      const entry = normalizeJobLogEntry(item);
      let type = ['crawl', 'rewrite'].includes(entry.type) ? entry.type : '';
      if (!type) {
        type = rewriteActive || looksLikeRewriteLog(entry.message) ? 'rewrite' : 'crawl';
        entry.type = type;
      }
      if (type === 'rewrite') rewriteActive = true;
      groups[type].push(entry);
    });
  }

  const order = (job.type || 'collect') === 'rewrite'
    ? ['rewrite', 'crawl']
    : ['crawl', 'rewrite'];
  return order
    .map((key) => ({
      id: key,
      label: JOB_LOG_GROUPS[key]?.label || '运行日志',
      logs: groups[key] || [],
    }))
    .filter((group) => group.logs.length);
}

function visibleJobLogGroups(job) {
  const groups = jobLogGroups(job);
  if (state.jobTypeFilter === 'crawl') {
    return groups.filter((group) => group.id === 'crawl');
  }
  if (state.jobTypeFilter === 'rewrite') {
    return groups.filter((group) => group.id === 'rewrite');
  }
  return groups;
}

function jobMatchesLogType(job, type = 'all') {
  if (type === 'all') return true;
  const jobType = job.type || 'collect';
  const groups = jobLogGroups(job);
  if (type === 'crawl') {
    return jobType === 'collect' || groups.some((group) => group.id === 'crawl');
  }
  if (type === 'rewrite') {
    return jobType === 'rewrite'
      || Boolean(job.result?.rewrite || job.result?.rewrite_error)
      || groups.some((group) => group.id === 'rewrite');
  }
  return true;
}

function jobAllLogs(job) {
  const logs = Array.isArray(job.logs) ? job.logs : [];
  if (logs.length) return logs.map((item) => normalizeJobLogEntry(item));
  return jobLogGroups(job).flatMap((group) => group.logs);
}

function latestJobLog(job) {
  const logs = jobAllLogs(job);
  return logs.length ? logs[logs.length - 1] : null;
}

function countJobLogIssues(job) {
  const logs = jobAllLogs(job);
  return logs.filter((item) => /失败|错误|异常|error|exception/i.test(String(item.message || ''))).length;
}

function jobKeywords(summary = {}, job = {}) {
  if ((job.type || 'collect') === 'rewrite') {
    const topic = summary.rewrite_topic || job.result?.topic || 'AI仿写要求';
    const names = Array.isArray(summary.target_names) ? summary.target_names.filter(Boolean) : [];
    if (!names.length) return topic;
    const shown = names.slice(0, 2).join('、');
    return names.length > 2 ? `${topic} · ${shown} 等 ${names.length} 篇` : `${topic} · ${shown}`;
  }
  const keywords = Array.isArray(summary.keywords) ? summary.keywords.filter(Boolean) : [];
  if (!keywords.length) return '未设置关键词';
  const shown = keywords.slice(0, 3).join('、');
  return keywords.length > 3 ? `${shown} 等 ${keywords.length} 个` : shown;
}

function jobScopeText(summary = {}, job = {}) {
  if ((job.type || 'collect') === 'rewrite') {
    const count = summary.target_count || job.result?.target_count || 0;
    const topic = summary.rewrite_topic || job.result?.topic || '默认要求';
    return `${topic} · ${count || '—'} 篇`;
  }
  const parts = [
    summary.sort_type,
    summary.content_type,
    summary.publish_time,
    summary.note_range && summary.note_range !== '不限' ? summary.note_range : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '默认筛选';
}

function jobProgress(job) {
  const structured = job.progress || {};
  const structuredValue = Number(structured.value);
  if (Number.isFinite(structuredValue) && structured.label) {
    return {
      value: Math.max(0, Math.min(100, Math.round(structuredValue))),
      label: String(structured.label),
    };
  }

  const status = job.status || '';
  if (status === 'success') {
    return { value: 100, label: '已完成' };
  }
  if (status === 'failed' || status === 'interrupted') {
    return { value: 100, label: jobStatusMeta(status).label };
  }

  const logs = jobAllLogs(job);
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
  if ((job.type || 'collect') === 'rewrite') {
    const targetCount = result.target_count || job.summary?.target_count || 0;
    const successCount = result.success_count || 0;
    const failedCount = result.failed_count || 0;
    if (job.status === 'success') {
      return `仿写完成：成功 ${successCount} 篇，失败 ${failedCount} 篇`;
    }
    if (job.status === 'failed' || job.status === 'interrupted') {
      return truncateText(job.error || latestLog?.message || jobStatusMeta(job.status).label, 120);
    }
    return truncateText(latestLog?.message || `正在仿写：${successCount}/${targetCount || '—'}`, 120);
  }
  if (job.status === 'success') {
    const rewriteText = result.rewrite?.article_count
      ? `，仿写 ${result.rewrite.article_count} 篇`
      : (result.rewrite_error ? `，仿写失败：${truncateText(result.rewrite_error, 36)}` : '');
    return `保存 ${result.saved_count || 0} 篇，失败 ${result.failed_count || 0} 条${rewriteText}`;
  }
  if (job.status === 'failed' || job.status === 'interrupted') {
    return truncateText(job.error || latestLog?.message || jobStatusMeta(job.status).label, 120);
  }
  return truncateText(latestLog?.message || '正在等待采集日志', 120);
}

function jobMetricItems(job) {
  const summary = job.summary || {};
  const result = job.result || {};
  if ((job.type || 'collect') === 'rewrite') {
    const targetCount = result.target_count ?? summary.target_count ?? '—';
    const successCount = result.success_count ?? 0;
    const failedCount = result.failed_count ?? countJobLogIssues(job);
    return [
      { label: '目标', value: targetCount === '—' ? targetCount : `${targetCount} 篇` },
      { label: '成功', value: `${successCount || 0} 篇` },
      { label: '异常', value: `${failedCount || 0} 篇` },
      { label: '耗时', value: formatDuration(job.started_at || job.created_at, job.finished_at) },
    ];
  }
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
  const typedJobs = filterJobsByLogType(jobs);
  const issueCount = typedJobs.filter((job) => ['failed', 'interrupted'].includes(job.status)).length;
  return [
    { value: 'all', label: '全部', count: typedJobs.length },
    { value: 'running', label: '运行中', count: typedJobs.filter((job) => job.status === 'running').length },
    { value: 'success', label: '已完成', count: typedJobs.filter((job) => job.status === 'success').length },
    { value: 'failed', label: '异常', count: issueCount },
  ];
}

function jobTypeFilterOptions(jobs) {
  const statusJobs = filterJobsByStatus(jobs);
  return [
    { value: 'all', label: '全部日志', count: statusJobs.length },
    { value: 'crawl', label: '爬取日志', count: statusJobs.filter((job) => jobMatchesLogType(job, 'crawl')).length },
    { value: 'rewrite', label: '创作日志', count: statusJobs.filter((job) => jobMatchesLogType(job, 'rewrite')).length },
  ];
}

function filterJobsByStatus(jobs) {
  const filter = state.jobFilter;
  if (filter === 'running') return jobs.filter((job) => job.status === 'running');
  if (filter === 'success') return jobs.filter((job) => job.status === 'success');
  if (filter === 'failed') return jobs.filter((job) => ['failed', 'interrupted'].includes(job.status));
  return jobs;
}

function filterJobsByLogType(jobs) {
  const filter = state.jobTypeFilter;
  if (filter === 'crawl' || filter === 'rewrite') {
    return jobs.filter((job) => jobMatchesLogType(job, filter));
  }
  return jobs;
}

function filterJobs(jobs) {
  return filterJobsByLogType(filterJobsByStatus(jobs));
}

function jobCanBeDeleted(job = {}) {
  return Boolean(job.id) && job.status !== 'running';
}

function currentPageJobs(jobs = state.currentJobs) {
  const filteredJobs = filterJobs(Array.isArray(jobs) ? jobs : []);
  const pageStart = (state.jobPage - 1) * state.jobPageSize;
  return filteredJobs.slice(pageStart, pageStart + state.jobPageSize);
}

function pruneSelectedJobIds(jobs = state.currentJobs) {
  const deletableIds = new Set((Array.isArray(jobs) ? jobs : [])
    .filter((job) => jobCanBeDeleted(job))
    .map((job) => String(job.id)));
  state.selectedJobIds = new Set(Array.from(state.selectedJobIds).filter((jobId) => deletableIds.has(jobId)));
}

function updateJobToolbarState() {
  const multiSelectActive = state.jobMultiSelectMode;
  const selectedCount = state.selectedJobIds.size;
  const visibleSelectableJobs = currentPageJobs().filter((job) => jobCanBeDeleted(job));
  const visibleSelectableIds = visibleSelectableJobs.map((job) => String(job.id));
  const allVisibleSelected = visibleSelectableIds.length > 0
    && visibleSelectableIds.every((jobId) => state.selectedJobIds.has(jobId));
  const busy = state.collectBusy;
  const multiSelectControls = [
    homeEls.jobSelectionWrap,
    homeEls.selectAllJobsBtn,
    homeEls.clearJobSelectionBtn,
    homeEls.deleteSelectedJobsBtn,
  ];

  multiSelectControls.forEach((element) => setElementHidden(element, !multiSelectActive));

  if (homeEls.jobList) {
    homeEls.jobList.classList.toggle('is-multiselect', multiSelectActive);
  }
  if (homeEls.jobMultiSelectModeBtn) {
    homeEls.jobMultiSelectModeBtn.disabled = busy;
    homeEls.jobMultiSelectModeBtn.classList.toggle('is-active', multiSelectActive);
    homeEls.jobMultiSelectModeBtn.setAttribute('aria-pressed', multiSelectActive ? 'true' : 'false');
    homeEls.jobMultiSelectModeBtn.title = multiSelectActive ? '退出多选' : '显示多选';
  }
  if (homeEls.jobSelectionSummary) {
    homeEls.jobSelectionSummary.textContent = selectedCount
      ? `已选 ${selectedCount} 条日志`
      : '未选择日志';
  }
  if (homeEls.selectAllJobsBtn) {
    homeEls.selectAllJobsBtn.disabled = busy || !multiSelectActive || visibleSelectableIds.length === 0;
    homeEls.selectAllJobsBtn.classList.toggle('is-active', multiSelectActive && allVisibleSelected);
  }
  if (homeEls.clearJobSelectionBtn) {
    homeEls.clearJobSelectionBtn.disabled = busy || !multiSelectActive || selectedCount === 0;
  }
  if (homeEls.deleteSelectedJobsBtn) {
    homeEls.deleteSelectedJobsBtn.disabled = busy || !multiSelectActive || selectedCount === 0;
  }
}

function clearJobSelection({ render = false } = {}) {
  state.selectedJobIds = new Set();
  if (render) {
    renderJobs(state.currentJobs);
    return;
  }
  updateJobToolbarState();
}

function setJobMultiSelectMode(enabled) {
  state.jobMultiSelectMode = Boolean(enabled);
  if (!state.jobMultiSelectMode) {
    state.selectedJobIds = new Set();
  }
  renderJobs(state.currentJobs);
}

function toggleJobSelection(jobId, checked) {
  const normalizedId = String(jobId || '').trim();
  if (!normalizedId || !state.jobMultiSelectMode) return;
  const job = state.currentJobs.find((item) => String(item.id) === normalizedId);
  if (!jobCanBeDeleted(job)) {
    toast('运行中的任务日志暂不能删除');
    renderJobs(state.currentJobs);
    return;
  }
  const next = new Set(state.selectedJobIds);
  if (checked) {
    next.add(normalizedId);
  } else {
    next.delete(normalizedId);
  }
  state.selectedJobIds = next;
  renderJobs(state.currentJobs);
}

function selectAllVisibleJobs() {
  if (!state.jobMultiSelectMode) {
    state.jobMultiSelectMode = true;
  }
  const next = new Set(state.selectedJobIds);
  currentPageJobs().forEach((job) => {
    if (jobCanBeDeleted(job)) {
      next.add(String(job.id));
    }
  });
  state.selectedJobIds = next;
  renderJobs(state.currentJobs);
}

async function deleteSelectedJobs() {
  const targets = Array.from(state.selectedJobIds).filter(Boolean);
  if (!targets.length) {
    toast('请选择要删除的任务日志');
    return;
  }
  if (!window.confirm(`确定删除已选 ${targets.length} 条任务日志吗？`)) return;

  const data = await api('/api/jobs/delete', {
    method: 'POST',
    body: JSON.stringify({ ids: targets }),
  });
  const deletedIds = new Set((data.deleted_ids || []).map((jobId) => String(jobId)));
  state.selectedJobIds = new Set(Array.from(state.selectedJobIds).filter((jobId) => !deletedIds.has(jobId)));
  await loadJobs();

  const deletedCount = Number(data.deleted_count) || deletedIds.size;
  const skippedCount = Array.isArray(data.skipped_running_ids) ? data.skipped_running_ids.length : 0;
  if (deletedCount && skippedCount) {
    toast(`已删除 ${deletedCount} 条，${skippedCount} 条运行中未删除`);
    return;
  }
  if (deletedCount) {
    toast(`已删除 ${deletedCount} 条任务日志`);
    return;
  }
  toast(skippedCount ? '运行中的任务日志暂不能删除' : '没有可删除的任务日志');
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
  const title = runningJobs.length
    ? ((latest.type || 'collect') === 'rewrite' ? '正在仿写' : '正在采集')
    : `最近任务${meta.label}`;
  const subtitle = `${jobSourceLabel(latest.source, latest.type || 'collect')} · ${compactTime(latest.started_at || latest.created_at)} · ${jobPrimaryMessage(latest)}`;
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

function renderJobTypeFilters(jobs) {
  if (!homeEls.jobTypeFilters) return;
  const options = jobTypeFilterOptions(jobs);
  if (!options.some((option) => option.value === state.jobTypeFilter)) {
    state.jobTypeFilter = 'all';
  }

  homeEls.jobTypeFilters.innerHTML = options.map((option) => {
    const active = option.value === state.jobTypeFilter;
    return `
      <button
        class="job-filter job-type-filter${active ? ' active' : ''}"
        type="button"
        role="tab"
        aria-selected="${active ? 'true' : 'false'}"
        data-job-type-filter="${escapeHtml(option.value)}"
      >
        <span>${escapeHtml(option.label)}</span>
        <strong>${escapeHtml(option.count)}</strong>
      </button>
    `;
  }).join('');
}

function jobPageCount(total) {
  return Math.max(1, Math.ceil(total / state.jobPageSize));
}

function clampJobPage(total) {
  const pageCount = jobPageCount(total);
  state.jobPage = Math.min(Math.max(1, state.jobPage), pageCount);
  return pageCount;
}

function jobPaginationItems(pageCount, currentPage) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_item, index) => index + 1);
  }
  const pages = new Set([1, pageCount, currentPage, currentPage - 1, currentPage + 1]);
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= pageCount - 2) {
    pages.add(pageCount - 1);
    pages.add(pageCount - 2);
    pages.add(pageCount - 3);
  }
  const sorted = Array.from(pages)
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= pageCount)
    .sort((left, right) => left - right);
  return sorted.reduce((items, pageNumber, index) => {
    if (index > 0 && pageNumber - sorted[index - 1] > 1) {
      items.push('ellipsis');
    }
    items.push(pageNumber);
    return items;
  }, []);
}

function renderJobPagination(totalJobs, pageCount = jobPageCount(totalJobs)) {
  if (!homeEls.jobPagination) return;
  if (!totalJobs) {
    homeEls.jobPagination.classList.add('is-hidden');
    homeEls.jobPagination.innerHTML = '';
    return;
  }

  const currentPage = state.jobPage;
  const from = (currentPage - 1) * state.jobPageSize + 1;
  const to = Math.min(totalJobs, currentPage * state.jobPageSize);
  const pageItems = jobPaginationItems(pageCount, currentPage).map((item, index) => {
    if (item === 'ellipsis') {
      return `<span class="job-page-ellipsis" aria-hidden="true" data-page-gap="${index}">…</span>`;
    }
    const active = item === currentPage;
    return `
      <button
        class="job-page-btn${active ? ' active' : ''}"
        type="button"
        data-job-page="${item}"
        aria-current="${active ? 'page' : 'false'}"
      >${item}</button>
    `;
  }).join('');
  const pageSizeOptions = JOB_PAGE_SIZE_OPTIONS.map((size) => (
    `<option value="${size}" ${state.jobPageSize === size ? 'selected' : ''}>每页 ${size} 条</option>`
  )).join('');

  homeEls.jobPagination.classList.remove('is-hidden');
  homeEls.jobPagination.innerHTML = `
    <div class="job-page-summary-wrap">
      <div class="job-page-summary">第 ${escapeHtml(currentPage)} / ${escapeHtml(pageCount)} 页 · ${escapeHtml(from)}-${escapeHtml(to)} / ${escapeHtml(totalJobs)} 条</div>
      <label class="job-page-size-control">
        <span>分页大小</span>
        <select data-job-page-size aria-label="设置任务分页大小">${pageSizeOptions}</select>
      </label>
    </div>
    <div class="job-page-buttons">
      <button class="job-page-btn job-page-arrow" type="button" data-job-page="prev" title="上一页" aria-label="上一页" ${currentPage <= 1 ? 'disabled' : ''}>
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>
      </button>
      ${pageItems}
      <button class="job-page-btn job-page-arrow" type="button" data-job-page="next" title="下一页" aria-label="下一页" ${currentPage >= pageCount ? 'disabled' : ''}>
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </button>
    </div>
  `;
}

async function saveJobPageSize(size, previousSize) {
  try {
    const data = await api('/api/config', {
      method: 'POST',
      body: JSON.stringify({ ui: { job_page_size: size } }),
    });
    state.config = data.config;
    state.choices = data.config?.choices || state.choices;
    state.jobPageSize = normalizeJobPageSize(data.config?.ui?.job_page_size);
    state.jobPage = 1;
    renderJobs(state.currentJobs);
    toast(`任务分页已设置为每页 ${state.jobPageSize} 条`);
  } catch (error) {
    state.jobPageSize = previousSize;
    state.jobPage = 1;
    renderJobs(state.currentJobs);
    toast(error.message || '分页大小保存失败');
  }
}

function saveJobLogOpenState() {
  if (!homeEls.jobList) return;
  homeEls.jobList.querySelectorAll('.job-detail[data-log-key]').forEach((element) => {
    state.jobLogOpenState.set(element.dataset.logKey, element.open);
  });
}

function saveJobLogScrollState() {
  if (!homeEls.jobList) return;
  homeEls.jobList.querySelectorAll('.job-log[data-log-key]').forEach((element) => {
    const logKey = element.dataset.logKey;
    state.jobLogScrollState.set(logKey, {
      stickToBottom: isNearBottom(element),
      offsetFromBottom: Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop),
    });
  });
}

function pruneJobUiState(visibleLogKeys) {
  Array.from(state.jobLogScrollState.keys()).forEach((logKey) => {
    if (!visibleLogKeys.has(logKey)) {
      state.jobLogScrollState.delete(logKey);
    }
  });
  Array.from(state.jobLogOpenState.keys()).forEach((logKey) => {
    if (!visibleLogKeys.has(logKey)) {
      state.jobLogOpenState.delete(logKey);
    }
  });
}

function bindJobLogAutoScroll() {
  if (!homeEls.jobList) return;
  const visibleLogKeys = new Set();

  homeEls.jobList.querySelectorAll('.job-log[data-log-key]').forEach((element) => {
    const logKey = element.dataset.logKey;
    const previous = state.jobLogScrollState.get(logKey);
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    visibleLogKeys.add(logKey);

    if (!previous || previous.stickToBottom) {
      element.scrollTop = element.scrollHeight;
    } else {
      element.scrollTop = Math.max(0, maxScrollTop - previous.offsetFromBottom);
    }

    element.addEventListener('scroll', () => {
      state.jobLogScrollState.set(logKey, {
        stickToBottom: isNearBottom(element),
        offsetFromBottom: Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop),
      });
    }, { passive: true });
  });

  homeEls.jobList.querySelectorAll('.job-detail[data-log-key]').forEach((element) => {
    const logKey = element.dataset.logKey;
    visibleLogKeys.add(logKey);
    element.addEventListener('toggle', () => {
      state.jobLogOpenState.set(logKey, element.open);
    });
  });

  pruneJobUiState(visibleLogKeys);
}

function renderJobEmptyState(message) {
  homeEls.jobList.classList.add('muted', 'job-list-empty');
  homeEls.jobList.innerHTML = `<div class="job-empty-state">${escapeHtml(message)}</div>`;
}

function renderJobs(jobs) {
  if (!homeEls.jobList) return;
  const allJobs = Array.isArray(jobs) ? jobs : [];
  state.currentJobs = allJobs;
  pruneSelectedJobIds(allJobs);
  renderJobStatusSummary(allJobs);
  renderJobFilters(allJobs);
  renderJobTypeFilters(allJobs);

  if (allJobs.length === 0) {
    state.jobLogScrollState.clear();
    state.jobLogOpenState.clear();
    renderJobPagination(0);
    updateJobToolbarState();
    renderJobEmptyState('暂无任务记录');
    return;
  }

  saveJobLogScrollState();
  saveJobLogOpenState();

  const filteredJobs = filterJobs(allJobs);
  const pageCount = clampJobPage(filteredJobs.length);
  renderJobPagination(filteredJobs.length, pageCount);
  updateJobToolbarState();
  if (!filteredJobs.length) {
    renderJobEmptyState('该状态下暂无任务');
    return;
  }
  const pageStart = (state.jobPage - 1) * state.jobPageSize;
  const visibleJobs = filteredJobs.slice(pageStart, pageStart + state.jobPageSize);

  homeEls.jobList.classList.remove('muted', 'job-list-empty');
  homeEls.jobList.innerHTML = visibleJobs.map((job) => {
    const meta = jobStatusMeta(job.status);
    const summary = job.summary || {};
    const logGroups = visibleJobLogGroups(job);
    const progress = jobProgress(job);
    const highlight = job.id === state.highlightedJobId ? ' job-card-highlight' : '';
    const deletable = jobCanBeDeleted(job);
    const selected = state.jobMultiSelectMode && state.selectedJobIds.has(String(job.id));
    const metricHtml = jobMetricItems(job).map((item) => `
      <div class="job-metric">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
      </div>
    `).join('');
    const detailHtml = logGroups.map((group) => {
      const logKey = `${job.id}:${group.id}`;
      const storedOpen = state.jobLogOpenState.get(logKey);
      const shouldOpen = storedOpen !== undefined ? storedOpen : (job.status === 'running' || job.id === state.highlightedJobId);
      const logText = group.logs.map((item) => `${item.time ? `[${item.time}] ` : ''}${item.message}`).join('\n');
      return `
        <details class="job-detail" data-job-id="${escapeHtml(job.id)}" data-log-key="${escapeHtml(logKey)}"${shouldOpen ? ' open' : ''}>
          <summary>
            <span>${escapeHtml(group.label)}</span>
            <strong>${escapeHtml(group.logs.length)} 条</strong>
          </summary>
          <pre class="job-log" data-job-id="${escapeHtml(job.id)}" data-log-key="${escapeHtml(logKey)}">${escapeHtml(logText)}</pre>
        </details>
      `;
    }).join('');

    return `
      <article class="job-card job-status-${escapeHtml(meta.tone)}${selected ? ' is-selected' : ''}${highlight}" data-job-card-id="${escapeHtml(job.id)}">
        <div class="job-card-top">
          <label class="job-select" aria-label="选择任务日志 ${escapeHtml(job.id)}" title="${deletable ? '选择任务日志' : '运行中的任务日志暂不能删除'}">
            <input class="job-select-input" data-job-id="${escapeHtml(job.id)}" type="checkbox" ${selected ? 'checked' : ''} ${state.jobMultiSelectMode && deletable ? '' : 'disabled'}>
          </label>
          <div class="job-title-block">
            <div class="job-title-row">
              <span class="job-status-dot ${escapeHtml(meta.tone)}" aria-hidden="true"></span>
              <strong class="job-title">${escapeHtml(jobKeywords(summary, job))}</strong>
              <span class="job-id">#${escapeHtml(job.id)}</span>
            </div>
            <div class="job-subtitle">${escapeHtml(jobSourceLabel(job.source, job.type || 'collect'))} · ${escapeHtml(compactTime(job.started_at || job.created_at))} · ${escapeHtml(jobScopeText(summary, job))}</div>
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

function fileExtension(path = '') {
  const name = fileBaseName(path).toLowerCase();
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex) : '';
}

const textPreviewExtensions = new Set(['.md', '.markdown', '.txt', '.json', '.log']);
const imagePreviewExtensions = new Set(['.apng', '.avif', '.gif', '.jpg', '.jpeg', '.png', '.svg', '.webp']);
const videoPreviewExtensions = new Set(['.m4v', '.mov', '.mp4', '.webm']);

function isTextPreviewPath(path = '') {
  return textPreviewExtensions.has(fileExtension(path));
}

function isMarkdownPath(path = '') {
  const extension = fileExtension(path);
  return extension === '.md' || extension === '.markdown';
}

function isImagePreviewPath(path = '') {
  return imagePreviewExtensions.has(fileExtension(path));
}

function isVideoPreviewPath(path = '') {
  return videoPreviewExtensions.has(fileExtension(path));
}

function filePreviewMode(entry = {}) {
  const path = entry.path || entry.name || '';
  if (entry.type === 'directory') return 'directory';
  if (entry.previewable || isTextPreviewPath(path)) return isMarkdownPath(path) ? 'markdown' : 'text';
  if (isImagePreviewPath(path)) return 'image';
  if (isVideoPreviewPath(path)) return 'video';
  return 'download';
}

function canPreviewEntry(entry = {}) {
  return ['markdown', 'text', 'image', 'video'].includes(filePreviewMode(entry));
}

function fileKindLabel(entry = {}) {
  if (entry.type === 'directory') return '目录';
  if (isImagePreviewPath(entry.path || entry.name)) return '图片';
  if (isVideoPreviewPath(entry.path || entry.name)) return '视频';
  if (isMarkdownPath(entry.path || entry.name)) return 'Markdown';
  const extension = fileExtension(entry.path || entry.name).replace('.', '').toUpperCase();
  return extension || '文件';
}

function iconSvg(name) {
  const icons = {
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l1.7 2h9.3v7.8a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2z"/><path d="M3.5 9.5V6.7c0-1.2 1-2.2 2.2-2.2h4.1l1.7 2h6.8c1.2 0 2.2 1 2.2 2.2v.8"/></svg>',
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h6.8L18 7.7v12.8H7z"/><path d="M13.5 3.8v4.4h4.3"/></svg>',
    markdown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="M7 15V9l2.4 3 2.4-3v6"/><path d="M15 9v6"/><path d="m13.5 13.5 1.5 1.5 1.5-1.5"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="m7 16 3.1-3.1 2.2 2.2 2.8-3.6L18 16"/><path d="M8.5 9.2h.1"/></svg>',
    video: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h11v10h-11z"/><path d="m15.5 10 4-2.2v8.4l-4-2.2z"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h8v8"/><path d="m8 16 8-8"/><path d="M5 5h5"/><path d="M5 5v14h14v-5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"/><path d="M9 7V5.8c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3V7"/><path d="M8 10v8M12 10v8M16 10v8"/><path d="M7 7l.8 13h8.4L17 7"/></svg>',
    rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.5 19.5 4.2-.8 9.8-9.8-3.4-3.4-9.8 9.8z"/><path d="m13.8 6.8 3.4 3.4"/><path d="M12 19.5h7.5"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4"/><path d="M4 4l6 6"/><path d="M16 4h4v4"/><path d="m20 4-6 6"/><path d="M8 20H4v-4"/><path d="m4 20 6-6"/><path d="M16 20h4v-4"/><path d="m20 20-6-6"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4v6H4"/><path d="m4 10 6-6"/><path d="M14 4v6h6"/><path d="m20 10-6-6"/><path d="M10 20v-6H4"/><path d="m4 14 6 6"/><path d="M14 20v-6h6"/><path d="m20 14-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 6-6 6 6 6"/><path d="M5 12h14"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    details: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11v5"/><path d="M12 8h.01"/><path d="M4.5 12a7.5 7.5 0 1 0 15 0 7.5 7.5 0 0 0-15 0z"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12h.01"/><path d="M12 12h.01"/><path d="M17.5 12h.01"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a7 7 0 0 0-12.2-2.4L5 7.5"/><path d="M5 4v3.5h3.5"/><path d="M5 16a7 7 0 0 0 12.2 2.4L19 16.5"/><path d="M19 20v-3.5h-3.5"/></svg>',
    rewrite: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.5 19.5 9.8-9.8 2 2-9.8 9.8h-2z"/><path d="m13.7 6.3 2-2 4 4-2 2"/><path d="M6 4.5v3M4.5 6h3M18 16.5v3M16.5 18h3"/></svg>',
  };
  return icons[name] || icons.file;
}

function fileIconName(entry = {}) {
  if (entry.type === 'directory') return 'folder';
  if (isMarkdownPath(entry.path || entry.name)) return 'markdown';
  if (isImagePreviewPath(entry.path || entry.name)) return 'image';
  if (isVideoPreviewPath(entry.path || entry.name)) return 'video';
  return 'file';
}

function filePathParts(path = '') {
  return String(path || '').replaceAll('\\', '/').split('/').filter(Boolean);
}

function normalizeFilePath(path = '') {
  return filePathParts(path).join('/');
}

function pathFromParts(parts = [], endIndex = parts.length) {
  return parts.slice(0, endIndex).join('/');
}

function fileDirectoryParts(path = '') {
  const parts = String(path || '').replaceAll('\\', '/').split('/').filter(Boolean);
  parts.pop();
  return parts;
}

function filePathDepth(path = '') {
  return filePathParts(path).length;
}

function localMarkdownDownloadUrl(url, sourcePath = '') {
  let raw = String(url || '').trim();
  if (raw.startsWith('<') && raw.endsWith('>')) {
    raw = raw.slice(1, -1).trim();
  }
  if (!raw || raw.startsWith('#')) return raw;
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (/^(javascript:|data:|vbscript:)/i.test(raw)) return '';

  const hashIndex = raw.indexOf('#');
  const pathPart = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hashPart = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const joinedParts = pathPart.startsWith('/')
    ? pathPart.split('/')
    : [...fileDirectoryParts(sourcePath), ...pathPart.split('/')];
  const resolvedParts = [];

  joinedParts.forEach((part) => {
    const cleanPart = part.trim();
    if (!cleanPart || cleanPart === '.') return;
    if (cleanPart === '..') {
      resolvedParts.pop();
      return;
    }
    resolvedParts.push(cleanPart);
  });

  const resolvedPath = resolvedParts.join('/');
  return resolvedPath ? `/download?path=${encodeURIComponent(resolvedPath)}${hashPart}` : '';
}

function unwrapMarkdownDestination(value = '') {
  const raw = String(value || '').trim();
  return raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1).trim() : raw;
}

function wrapMarkdownDestination(value = '') {
  const raw = String(value || '').trim();
  return /\s/.test(raw) ? `<${raw}>` : raw;
}

function relativeMarkdownPathFromSource(targetPath = '', sourcePath = '') {
  const targetParts = filePathParts(targetPath);
  if (!targetParts.length) return '';
  const sourceParts = fileDirectoryParts(sourcePath);
  let shared = 0;
  while (shared < sourceParts.length && shared < targetParts.length && sourceParts[shared] === targetParts[shared]) {
    shared += 1;
  }
  const upParts = sourceParts.slice(shared).map(() => '..');
  const downParts = targetParts.slice(shared);
  return [...upParts, ...downParts].join('/') || fileBaseName(targetPath);
}

function markdownResourceUrlForEditor(rawUrl = '', sourcePath = '') {
  const downloadUrl = localMarkdownDownloadUrl(rawUrl, sourcePath);
  return downloadUrl.startsWith('/download?path=') ? downloadUrl : String(rawUrl || '').trim();
}

function markdownResourceUrlFromEditor(rawUrl = '', sourcePath = '') {
  const raw = unwrapMarkdownDestination(String(rawUrl || '').replaceAll('&amp;', '&'));
  if (!raw) return raw;
  try {
    const url = new URL(raw, window.location.href);
    if (url.pathname !== '/download') return raw;
    const targetPath = url.searchParams.get('path') || '';
    if (!targetPath) return raw;
    const relativePath = relativeMarkdownPathFromSource(targetPath, sourcePath);
    return `${relativePath}${url.hash || ''}`;
  } catch (_error) {
    return raw;
  }
}

function rewriteMarkdownResourceUrls(content = '', sourcePath = '', mapper) {
  const mapUrl = (url) => (typeof mapper === 'function' ? mapper(unwrapMarkdownDestination(url), sourcePath) : url);
  return String(content ?? '')
    .replace(/(!?\[[^\]\n]*]\()([^)\n]+)(\))/g, (_match, prefix, rawUrl, suffix) => {
      const mappedUrl = mapUrl(rawUrl);
      return `${prefix}${wrapMarkdownDestination(mappedUrl)}${suffix}`;
    })
    .replace(/(<(?:video|img|source)\b[^>]*?\s(?:src|poster)\s*=\s*)(["'])([^"']*)(\2)/gi, (_match, prefix, quote, rawUrl, closingQuote) => {
      const mappedUrl = mapUrl(rawUrl);
      return `${prefix}${quote}${escapeHtml(mappedUrl)}${closingQuote}`;
    });
}

function markdownToEditorValue(content = '', sourcePath = '') {
  return rewriteMarkdownResourceUrls(content, sourcePath, markdownResourceUrlForEditor);
}

function markdownFromEditorValue(content = '', sourcePath = '') {
  return rewriteMarkdownResourceUrls(content, sourcePath, markdownResourceUrlFromEditor);
}

function renderMarkdownImage(src, alt = '') {
  const label = String(alt || '').trim();
  const ariaLabel = label ? `预览图片：${label}` : '预览图片';
  return `<img class="markdown-preview-image" src="${escapeHtml(src)}" alt="${escapeHtml(label)}" loading="lazy" tabindex="0" role="button" title="点击预览图片" aria-label="${escapeHtml(ariaLabel)}">`;
}

function renderInlineStyles(html) {
  return html
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\s][^*]*?)\*/g, '<em>$1</em>')
    .replace(/_([^_\s][^_]*?)_/g, '<em>$1</em>');
}

function renderInlineMarkdown(text, sourcePath = '') {
  const source = String(text ?? '');
  const tokenPattern = /(`+)([\s\S]*?)\1|(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/g;
  let html = '';
  let lastIndex = 0;
  let match = tokenPattern.exec(source);

  while (match) {
    html += renderInlineStyles(escapeHtml(source.slice(lastIndex, match.index)));

    if (match[1]) {
      html += `<code>${escapeHtml(match[2])}</code>`;
    } else {
      const isImage = match[3] === '!';
      const label = match[4] || '';
      const href = localMarkdownDownloadUrl(match[5], sourcePath);
      if (!href) {
        html += renderInlineStyles(escapeHtml(label));
      } else if (isImage) {
        html += renderMarkdownImage(href, label);
      } else {
        const external = /^(https?:|mailto:|tel:)/i.test(href);
        const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
        html += `<a href="${escapeHtml(href)}"${attrs}>${renderInlineStyles(escapeHtml(label))}</a>`;
      }
    }

    lastIndex = tokenPattern.lastIndex;
    match = tokenPattern.exec(source);
  }

  html += renderInlineStyles(escapeHtml(source.slice(lastIndex)));
  return html;
}

function splitMarkdownTableRow(row) {
  const trimmed = String(row || '').trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cell = '';
  let escaped = false;

  Array.from(trimmed).forEach((char) => {
    if (char === '\\' && !escaped) {
      escaped = true;
      cell += char;
      return;
    }
    if (char === '|' && !escaped) {
      cells.push(cell.trim().replaceAll('\\|', '|'));
      cell = '';
      return;
    }
    escaped = false;
    cell += char;
  });

  cells.push(cell.trim().replaceAll('\\|', '|'));
  return cells;
}

function isMarkdownTableSeparator(row) {
  const cells = splitMarkdownTableRow(row);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replaceAll(' ', '')));
}

function renderMarkdownTable(lines, startIndex, sourcePath = '') {
  const headers = splitMarkdownTableRow(lines[startIndex]);
  const rows = [];
  let index = startIndex + 2;

  while (index < lines.length && lines[index].trim().startsWith('|')) {
    if (!lines[index].includes('|') || isMarkdownTableSeparator(lines[index])) break;
    rows.push(splitMarkdownTableRow(lines[index]));
    index += 1;
  }

  const headerHtml = headers
    .map((cell) => `<th>${renderInlineMarkdown(cell, sourcePath)}</th>`)
    .join('');
  const bodyHtml = rows
    .map((row) => `<tr>${headers.map((_header, cellIndex) => `<td>${renderInlineMarkdown(row[cellIndex] || '', sourcePath)}</td>`).join('')}</tr>`)
    .join('');

  return {
    html: `<div class="markdown-table-wrap"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
    nextIndex: index,
  };
}

function readHtmlAttribute(markup, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = pattern.exec(markup);
  return match ? (match[1] || match[2] || match[3] || '') : '';
}

function renderSafeVideo(markup, sourcePath = '') {
  const src = localMarkdownDownloadUrl(readHtmlAttribute(markup, 'src'), sourcePath);
  if (!src) return '';
  const poster = localMarkdownDownloadUrl(readHtmlAttribute(markup, 'poster'), sourcePath);
  const posterAttr = poster ? ` poster="${escapeHtml(poster)}"` : '';
  return `<video class="markdown-media-video" controls src="${escapeHtml(src)}"${posterAttr}></video>`;
}

function isMarkdownListLine(line) {
  return /^(\s*)([-*+]\s+|\d+\.\s+)/.test(line);
}

function renderMarkdownList(lines, startIndex, sourcePath = '') {
  const first = lines[startIndex].trim();
  const ordered = /^\d+\.\s+/.test(first);
  const markerPattern = ordered ? /^\d+\.\s+/ : /^[-*+]\s+/;
  const tag = ordered ? 'ol' : 'ul';
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!markerPattern.test(trimmed)) break;
    const itemLines = [trimmed.replace(markerPattern, '')];
    index += 1;

    while (index < lines.length && /^\s{2,}\S/.test(lines[index]) && !isMarkdownListLine(lines[index])) {
      itemLines.push(lines[index].trim());
      index += 1;
    }

    items.push(`<li>${itemLines.map((line) => renderInlineMarkdown(line, sourcePath)).join('<br>')}</li>`);
  }

  return {
    html: `<${tag}>${items.join('')}</${tag}>`,
    nextIndex: index,
  };
}

function parseMarkdownImageLine(line = '') {
  const match = /^!\[([^\]]*)]\(([^)]+)\)$/.exec(String(line || '').trim());
  if (!match) return null;
  return {
    alt: match[1] || '',
    rawSrc: match[2] || '',
  };
}

function renderMarkdownImageGrid(images = [], sourcePath = '') {
  const items = images
    .map((image) => {
      const src = localMarkdownDownloadUrl(image.rawSrc, sourcePath);
      if (!src) return '';
      return `<figure>${renderMarkdownImage(src, image.alt)}</figure>`;
    })
    .filter(Boolean);
  return items.length ? `<div class="markdown-image-grid">${items.join('')}</div>` : '';
}

function isMarkdownBlockStart(lines, index) {
  const trimmed = lines[index]?.trim() || '';
  return !trimmed
    || trimmed.startsWith('```')
    || /^#{1,6}\s+/.test(trimmed)
    || trimmed.startsWith('<video')
    || Boolean(parseMarkdownImageLine(trimmed))
    || isMarkdownListLine(lines[index])
    || (trimmed.startsWith('|') && isMarkdownTableSeparator(lines[index + 1] || ''));
}

function renderMarkdown(content, sourcePath = '') {
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const videoHtml = trimmed.startsWith('<video') ? renderSafeVideo(trimmed, sourcePath) : '';
    if (videoHtml) {
      html.push(videoHtml);
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2], sourcePath)}</h${level}>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith('|') && isMarkdownTableSeparator(lines[index + 1] || '')) {
      const table = renderMarkdownTable(lines, index, sourcePath);
      html.push(table.html);
      index = table.nextIndex;
      continue;
    }

    const image = parseMarkdownImageLine(trimmed);
    if (image) {
      const images = [image];
      index += 1;
      while (index < lines.length) {
        if (!lines[index].trim()) {
          let nextIndex = index + 1;
          while (nextIndex < lines.length && !lines[nextIndex].trim()) {
            nextIndex += 1;
          }
          const nextImageAfterGap = parseMarkdownImageLine(lines[nextIndex]);
          if (!nextImageAfterGap) break;
          images.push(nextImageAfterGap);
          index = nextIndex + 1;
          continue;
        }
        const nextImage = parseMarkdownImageLine(lines[index]);
        if (!nextImage) break;
        images.push(nextImage);
        index += 1;
      }
      const imageGrid = renderMarkdownImageGrid(images, sourcePath);
      if (imageGrid) {
        html.push(imageGrid);
      }
      continue;
    }

    if (isMarkdownListLine(line)) {
      const list = renderMarkdownList(lines, index, sourcePath);
      html.push(list.html);
      index = list.nextIndex;
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length && !isMarkdownBlockStart(lines, index)) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${paragraphLines.map((text) => renderInlineMarkdown(text, sourcePath)).join('<br>')}</p>`);
  }

  return html.join('\n') || '<p></p>';
}

function markdownImageTitleFromSrc(src = '') {
  const safeDecode = (value) => {
    try {
      return decodeURIComponent(value || '');
    } catch (_error) {
      return value || '';
    }
  };
  try {
    const url = new URL(src, window.location.href);
    const downloadPath = url.searchParams.get('path');
    const name = fileBaseName(downloadPath || url.pathname || '');
    return safeDecode(name) || '图片预览';
  } catch (_error) {
    const cleanSrc = String(src || '').split(/[?#]/)[0];
    return safeDecode(fileBaseName(cleanSrc)) || '图片预览';
  }
}

function setMarkdownImageLightboxStatus(message = '', tone = '') {
  if (!homeEls.markdownImageLightboxStatus) return;
  homeEls.markdownImageLightboxStatus.textContent = message;
  homeEls.markdownImageLightboxStatus.className = `markdown-image-lightbox-status ${tone}`.trim();
}

function closeMarkdownImageLightbox({ restoreFocus = true } = {}) {
  const lightbox = homeEls.markdownImageLightbox;
  const image = homeEls.markdownImageLightboxImg;
  if (!lightbox) return;
  lightbox.hidden = true;
  lightbox.setAttribute('aria-hidden', 'true');
  lightbox.classList.remove('is-open', 'is-loading', 'is-error');
  document.body.classList.remove('has-markdown-image-lightbox');
  if (image) {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    image.alt = '';
  }
  setMarkdownImageLightboxStatus('');

  const previousFocus = state.markdownImageLightboxPreviousFocus;
  state.markdownImageLightboxPreviousFocus = null;
  if (restoreFocus && previousFocus && typeof previousFocus.focus === 'function') {
    previousFocus.focus();
  }
}

function openMarkdownImageLightbox(imageElement) {
  const lightbox = homeEls.markdownImageLightbox;
  const image = homeEls.markdownImageLightboxImg;
  if (!lightbox || !imageElement || !image) return;

  const src = imageElement.currentSrc || imageElement.getAttribute('src') || '';
  if (!src) return;
  const alt = imageElement.getAttribute('alt') || '';
  const title = alt.trim() || markdownImageTitleFromSrc(src);
  state.markdownImageLightboxPreviousFocus = document.activeElement;

  if (homeEls.markdownImageLightboxTitle) {
    homeEls.markdownImageLightboxTitle.textContent = title;
  }

  image.onload = () => {
    lightbox.classList.remove('is-loading', 'is-error');
    setMarkdownImageLightboxStatus('');
  };
  image.onerror = () => {
    lightbox.classList.remove('is-loading');
    lightbox.classList.add('is-error');
    setMarkdownImageLightboxStatus('图片加载失败', 'is-error');
  };
  image.alt = title;
  image.src = src;

  lightbox.hidden = false;
  lightbox.setAttribute('aria-hidden', 'false');
  lightbox.classList.add('is-open', 'is-loading');
  lightbox.classList.remove('is-error');
  document.body.classList.add('has-markdown-image-lightbox');
  setMarkdownImageLightboxStatus('图片加载中...');
  window.requestAnimationFrame(() => {
    homeEls.closeMarkdownImageLightboxBtn?.focus();
  });
}

function defaultPreviewState(overrides = {}) {
  return {
    path: '',
    url: '',
    meta: '',
    subMeta: '',
    content: '',
    mode: 'empty',
    truncated: false,
    open: false,
    ...overrides,
  };
}

function setPreviewFullscreen(enabled) {
  const shouldEnable = Boolean(enabled && state.currentPreviewPath);
  state.previewFullscreen = shouldEnable;
  if (homeEls.filePreviewPanel) {
    homeEls.filePreviewPanel.classList.toggle('is-fullscreen', shouldEnable);
  }
  document.body.classList.toggle('has-file-preview-fullscreen', shouldEnable);
  if (homeEls.previewFullscreenBtn) {
    const label = shouldEnable ? '退出全屏预览' : '全屏预览';
    homeEls.previewFullscreenBtn.disabled = !state.currentPreviewPath;
    homeEls.previewFullscreenBtn.classList.toggle('is-active', shouldEnable);
    homeEls.previewFullscreenBtn.setAttribute('aria-label', label);
    homeEls.previewFullscreenBtn.setAttribute('title', label);
    homeEls.previewFullscreenBtn.setAttribute('aria-pressed', shouldEnable ? 'true' : 'false');
    homeEls.previewFullscreenBtn.innerHTML = iconSvg(shouldEnable ? 'collapse' : 'expand');
  }
}

function setElementHidden(element, hidden) {
  if (element) element.hidden = Boolean(hidden);
}

function isCurrentPreviewMarkdown() {
  return state.currentPreviewMode === 'markdown' && Boolean(state.currentPreviewPath);
}

function canEditCurrentMarkdownPreview() {
  return isCurrentPreviewMarkdown() && !state.currentPreviewTruncated;
}

function previewEditorSubtitle() {
  if (!isCurrentPreviewMarkdown()) {
    return { text: state.currentPreviewSubMeta || '', tone: '' };
  }
  if (!state.previewEditorActive) {
    return {
      text: state.currentPreviewTruncated ? 'Markdown 预览 · 内容过长不可编辑' : 'Markdown 预览',
      tone: state.currentPreviewTruncated ? 'is-muted' : '',
    };
  }
  if (state.previewEditorSaving) {
    return { text: '保存中...', tone: 'is-saving' };
  }
  if (state.previewEditorSaveError) {
    return { text: '保存失败，继续编辑后会重试', tone: 'is-error' };
  }
  if (state.previewEditorDirty) {
    return { text: '未保存', tone: 'is-dirty' };
  }
  if (state.previewEditorSavedOnce) {
    return { text: '已自动保存', tone: 'is-saved' };
  }
  return { text: '所见即所得编辑', tone: 'is-editing' };
}

function updatePreviewHeaderState() {
  if (homeEls.filePreviewSubMeta) {
    const subtitle = previewEditorSubtitle();
    homeEls.filePreviewSubMeta.textContent = subtitle.text;
    homeEls.filePreviewSubMeta.classList.remove('is-saving', 'is-error', 'is-dirty', 'is-saved', 'is-editing', 'is-muted');
    if (subtitle.tone) {
      homeEls.filePreviewSubMeta.classList.add(subtitle.tone);
    }
  }

  if (!homeEls.previewEditBtn) return;
  const showEdit = isCurrentPreviewMarkdown();
  const canEdit = canEditCurrentMarkdownPreview();
  const active = Boolean(state.previewEditorActive);
  homeEls.previewEditBtn.hidden = !showEdit;
  homeEls.previewEditBtn.disabled = !canEdit;
  homeEls.previewEditBtn.classList.toggle('is-active', active);
  homeEls.previewEditBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  const label = active
    ? '退出 Markdown 编辑'
    : (state.currentPreviewTruncated ? '内容过长不可编辑' : '编辑 Markdown');
  homeEls.previewEditBtn.title = label;
  homeEls.previewEditBtn.setAttribute('aria-label', label);
}

function destroyPreviewEditorInstance() {
  const editor = state.previewEditorInstance;
  state.previewEditorInstance = null;
  state.previewEditorMount = null;
  if (editor && typeof editor.destroy === 'function') {
    try {
      editor.destroy();
    } catch (_error) {
      // Vditor may already have removed its DOM during a preview rerender.
    }
  }
}

function resetPreviewEditorState() {
  if (state.previewEditorSaveTimer) {
    window.clearTimeout(state.previewEditorSaveTimer);
  }
  destroyPreviewEditorInstance();
  state.previewEditorActive = false;
  state.previewEditorDraft = '';
  state.previewEditorDirty = false;
  state.previewEditorSaving = false;
  state.previewEditorSaveTimer = null;
  state.previewEditorSavePromise = null;
  state.previewEditorSaveError = '';
  state.previewEditorLastSavedContent = '';
  state.previewEditorSavedOnce = false;
}

function syncPreviewEditorDraftFromInstance() {
  const editor = state.previewEditorInstance;
  if (!editor || typeof editor.getValue !== 'function') return;
  state.previewEditorDraft = markdownFromEditorValue(editor.getValue(), state.currentPreviewPath);
  state.previewEditorDirty = state.previewEditorDraft !== state.previewEditorLastSavedContent;
}

function normalizeVditorEditorLayout(editor) {
  const instance = editor?.vditor;
  const elements = [
    instance?.wysiwyg?.element,
    instance?.ir?.element,
    instance?.sv?.element,
  ];
  elements.forEach((element) => {
    if (!element) return;
    element.style.padding = '16px 20px';
    element.style.maxWidth = 'none';
    element.style.width = '100%';
    element.style.boxSizing = 'border-box';
  });
  if (instance?.toolbar?.element) {
    instance.toolbar.element.style.paddingLeft = '8px';
  }
}

function createMarkdownVditorEditor(mount, { focusEditor = false } = {}) {
  if (!mount) return;
  if (typeof window.Vditor !== 'function') {
    state.previewEditorSaveError = 'Vditor 资源加载失败';
    mount.innerHTML = '<div class="markdown-vditor-error">编辑器资源加载失败，请刷新页面后重试。</div>';
    updatePreviewHeaderState();
    return;
  }

  destroyPreviewEditorInstance();
  const editorValue = markdownToEditorValue(state.previewEditorDraft, state.currentPreviewPath);
  let editor = null;
  const options = {
    value: editorValue,
    mode: 'wysiwyg',
    lang: 'zh_CN',
    cdn: VDITOR_CDN,
    width: '100%',
    height: '100%',
    minHeight: 320,
    cache: {
      enable: false,
    },
    toolbar: MARKDOWN_EDITOR_TOOLBAR,
    toolbarConfig: {
      hide: false,
      pin: false,
    },
    preview: {
      delay: 300,
      maxWidth: 100000,
      mode: 'both',
      theme: {
        current: 'light',
        path: `${VDITOR_CDN}/dist/css/content-theme`,
      },
      hljs: {
        style: 'github',
      },
    },
    link: {
      isOpen: false,
    },
    image: {
      isPreview: false,
    },
    input(value) {
      handleMarkdownEditorInput(markdownFromEditorValue(value, state.currentPreviewPath));
    },
    after() {
      if (!editor) return;
      state.previewEditorInstance = editor;
      normalizeVditorEditorLayout(editor);
      window.requestAnimationFrame(() => normalizeVditorEditorLayout(editor));
      if (typeof editor.disabledCache === 'function') {
        editor.disabledCache();
      }
      if (focusEditor && typeof editor.focus === 'function') {
        editor.focus();
      }
    },
  };

  editor = new window.Vditor(mount, options);

  state.previewEditorInstance = editor;
  state.previewEditorMount = mount;
}

function renderMarkdownPreviewContent({ focusEditor = false } = {}) {
  if (!homeEls.filePreview || !isCurrentPreviewMarkdown()) return;
  homeEls.filePreview.className = `file-preview is-markdown${state.previewEditorActive ? ' is-markdown-editing' : ''}`;

  if (state.previewEditorActive) {
    homeEls.filePreview.innerHTML = '';
    const editorMount = document.createElement('div');
    editorMount.className = 'markdown-vditor-editor';
    editorMount.dataset.path = state.currentPreviewPath;
    homeEls.filePreview.appendChild(editorMount);
    window.requestAnimationFrame(() => {
      if (!state.previewEditorActive || editorMount.dataset.path !== state.currentPreviewPath) return;
      createMarkdownVditorEditor(editorMount, { focusEditor });
    });
    return;
  }

  destroyPreviewEditorInstance();
  const truncatedHtml = state.currentPreviewTruncated ? '<p class="file-preview-notice">内容过长，已截断预览</p>' : '';
  homeEls.filePreview.innerHTML = `${renderMarkdown(state.currentPreviewContent, state.currentPreviewPath)}${truncatedHtml}`;
}

function updateCachedFileMetadata(file = {}) {
  const path = normalizeFilePath(file.path || state.currentPreviewPath);
  if (!path) return;
  let changed = false;
  state.fileTreeCache.forEach((files) => {
    (files.entries || []).forEach((entry) => {
      if (normalizeFilePath(entry.path || '') !== path) return;
      if (typeof file.size === 'number') entry.size = file.size;
      if (file.modified) entry.modified = file.modified;
      changed = true;
    });
  });
  if (!changed) return;
  rebuildFileEntryMap();
  if (state.currentFiles) {
    renderFiles(state.currentFiles);
  }
}

function handleMarkdownEditorInput(value = '') {
  state.previewEditorDraft = String(value ?? '');
  state.previewEditorDirty = state.previewEditorDraft !== state.previewEditorLastSavedContent;
  state.previewEditorSaveError = '';
  if (state.previewEditorSaveTimer) {
    window.clearTimeout(state.previewEditorSaveTimer);
    state.previewEditorSaveTimer = null;
  }
  if (state.previewEditorDirty) {
    state.previewEditorSaveTimer = window.setTimeout(() => {
      saveMarkdownPreviewDraft().catch((error) => toast(error.message));
    }, MARKDOWN_AUTOSAVE_DELAY_MS);
  }
  updatePreviewHeaderState();
}

async function saveMarkdownPreviewDraft({ force = false } = {}) {
  if (!state.previewEditorActive || !canEditCurrentMarkdownPreview()) return true;
  syncPreviewEditorDraftFromInstance();
  if (state.previewEditorSaveTimer) {
    window.clearTimeout(state.previewEditorSaveTimer);
    state.previewEditorSaveTimer = null;
  }
  if (!force && !state.previewEditorDirty) return true;
  if (state.previewEditorSaving) {
    return state.previewEditorSavePromise || false;
  }

  const path = normalizeFilePath(state.currentPreviewPath);
  const content = state.previewEditorDraft;
  if (!path) return false;
  if (content === state.previewEditorLastSavedContent) {
    state.previewEditorDirty = false;
    updatePreviewHeaderState();
    return true;
  }

  state.previewEditorSaving = true;
  state.previewEditorSaveError = '';
  updatePreviewHeaderState();

  const savePromise = api('/api/file/save', {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  })
    .then((data) => {
      if (normalizeFilePath(state.currentPreviewPath) !== path || !state.previewEditorActive) {
        return true;
      }
      state.currentPreviewContent = content;
      state.previewEditorLastSavedContent = content;
      state.previewEditorDirty = state.previewEditorDraft !== content;
      state.previewEditorSaveError = '';
      state.previewEditorSavedOnce = true;
      updateCachedFileMetadata(data.file || {});
      loadRecentMarkdown().catch(() => {});
      return !state.previewEditorDirty;
    })
    .catch((error) => {
      if (normalizeFilePath(state.currentPreviewPath) === path && state.previewEditorActive) {
        state.previewEditorSaveError = error.message || '保存失败';
        state.previewEditorDirty = true;
      }
      return false;
    })
    .finally(() => {
      if (normalizeFilePath(state.currentPreviewPath) === path) {
        state.previewEditorSaving = false;
        state.previewEditorSavePromise = null;
        if (state.previewEditorActive && state.previewEditorDirty && !state.previewEditorSaveError && !state.previewEditorSaveTimer) {
          state.previewEditorSaveTimer = window.setTimeout(() => {
            saveMarkdownPreviewDraft().catch((error) => toast(error.message));
          }, MARKDOWN_AUTOSAVE_DELAY_MS);
        }
        updatePreviewHeaderState();
      }
    });

  state.previewEditorSavePromise = savePromise;
  return savePromise;
}

async function toggleMarkdownPreviewEditor() {
  if (!canEditCurrentMarkdownPreview()) {
    if (state.currentPreviewTruncated) {
      toast('内容过长，不能在预览中编辑');
    }
    updatePreviewHeaderState();
    return;
  }

  if (state.previewEditorActive) {
    syncPreviewEditorDraftFromInstance();
    if (state.previewEditorDirty || state.previewEditorSaving) {
      const saved = await saveMarkdownPreviewDraft({ force: true });
      if (!saved || state.previewEditorDirty) {
        toast('保存失败，已保留编辑内容');
        return;
      }
    }
    state.previewEditorActive = false;
    state.currentPreviewContent = state.previewEditorDraft;
    destroyPreviewEditorInstance();
    updatePreviewHeaderState();
    renderMarkdownPreviewContent();
    return;
  }

  closePreviewRewritePopover({ restoreFocus: false });
  state.previewEditorActive = true;
  state.previewEditorDraft = state.currentPreviewContent || '';
  state.previewEditorLastSavedContent = state.currentPreviewContent || '';
  state.previewEditorDirty = false;
  state.previewEditorSaving = false;
  state.previewEditorSaveError = '';
  state.previewEditorSavedOnce = false;
  updatePreviewHeaderState();
  renderMarkdownPreviewContent({ focusEditor: true });
}

function previewRewriteDefaultTopic() {
  return (state.config?.rewrite?.topic || '创业沙龙').trim() || '创业沙龙';
}

function recentCrawledMarkdownEntry(path = '') {
  const normalizedPath = normalizeFilePath(path);
  if (!normalizedPath) return null;
  return (state.recentMarkdown.crawled || [])
    .find((item) => normalizeFilePath(item.path || '') === normalizedPath) || null;
}

function currentPreviewRewriteTarget() {
  const path = normalizeFilePath(state.currentPreviewPath);
  if (!path) return null;

  const entry = state.currentFileEntries.get(path);
  if (entry?.rewriteable) {
    return {
      path,
      name: entry.name || fileBaseName(path),
    };
  }

  const recentEntry = recentCrawledMarkdownEntry(path);
  if (recentEntry?.rewriteable) {
    return {
      path,
      name: recentEntry.name || fileBaseName(path),
    };
  }

  return null;
}

function closePreviewRewritePopover({ restoreFocus = false } = {}) {
  if (!homeEls.previewRewritePopover) return;
  state.previewRewriteOpen = false;
  state.previewRewritePath = '';
  homeEls.previewRewritePopover.hidden = true;
  if (homeEls.previewRewriteBtn) {
    homeEls.previewRewriteBtn.setAttribute('aria-expanded', 'false');
    homeEls.previewRewriteBtn.classList.remove('is-active');
  }
  if (restoreFocus && homeEls.previewRewriteBtn && !homeEls.previewRewriteBtn.disabled) {
    homeEls.previewRewriteBtn.focus();
  }
  updatePreviewRewriteState();
}

function updatePreviewRewriteState() {
  const target = currentPreviewRewriteTarget();
  const busy = state.collectBusy || state.rewriteBusy;
  const disabled = !target || busy;

  if (!target && state.previewRewriteOpen) {
    closePreviewRewritePopover({ restoreFocus: false });
    return;
  }

  if (homeEls.previewRewriteBtn) {
    homeEls.previewRewriteBtn.disabled = disabled;
    homeEls.previewRewriteBtn.classList.toggle('is-active', state.previewRewriteOpen);
    homeEls.previewRewriteBtn.setAttribute('aria-expanded', state.previewRewriteOpen ? 'true' : 'false');
    homeEls.previewRewriteBtn.title = target ? '仿写当前预览' : '当前预览不可仿写';
  }
  if (homeEls.previewRewriteName) {
    homeEls.previewRewriteName.textContent = target?.name || '当前预览';
  }
  if (homeEls.previewRewriteInput) {
    homeEls.previewRewriteInput.disabled = busy;
  }
  if (homeEls.submitPreviewRewriteBtn) {
    homeEls.submitPreviewRewriteBtn.disabled = disabled;
    homeEls.submitPreviewRewriteBtn.textContent = state.rewriteBusy ? '启动中...' : '开始仿写';
  }
  if (homeEls.cancelPreviewRewriteBtn) {
    homeEls.cancelPreviewRewriteBtn.disabled = busy;
  }
}

function openPreviewRewritePopover() {
  const target = currentPreviewRewriteTarget();
  if (!target) {
    toast('当前预览不可仿写');
    updatePreviewRewriteState();
    return;
  }

  state.previewRewriteOpen = true;
  state.previewRewritePath = target.path;
  if (homeEls.previewRewriteName) {
    homeEls.previewRewriteName.textContent = target.name || fileBaseName(target.path);
  }
  if (homeEls.previewRewriteInput) {
    homeEls.previewRewriteInput.value = previewRewriteDefaultTopic();
  }
  if (homeEls.previewRewritePopover) {
    homeEls.previewRewritePopover.hidden = false;
  }
  updatePreviewRewriteState();
  window.requestAnimationFrame(() => {
    homeEls.previewRewriteInput?.focus();
    homeEls.previewRewriteInput?.select();
  });
}

async function submitPreviewRewrite() {
  const target = currentPreviewRewriteTarget();
  if (!target) {
    closePreviewRewritePopover();
    toast('当前预览不可仿写');
    return;
  }

  const topic = (homeEls.previewRewriteInput?.value || '').trim();
  if (!topic) {
    toast('请填写仿写要求');
    homeEls.previewRewriteInput?.focus();
    return;
  }

  if (state.previewEditorActive && (state.previewEditorDirty || state.previewEditorSaving)) {
    const saved = await saveMarkdownPreviewDraft({ force: true });
    if (!saved || state.previewEditorDirty) {
      toast('Markdown 尚未保存成功，暂不开始仿写');
      return;
    }
  }

  await rewriteEntries([target], { topic });
  closePreviewRewritePopover({ restoreFocus: true });
}

function updateFileToolbarState() {
  const entries = state.fileTreeVisibleNodes.map((node) => node.entry).filter(Boolean);
  const selectablePaths = entries.map((entry) => entry.path).filter(Boolean);
  const selectedCount = state.selectedFilePaths.size;
  const rewriteableSelectedCount = selectedRewriteableEntries().length;
  const busy = state.collectBusy || state.rewriteBusy;
  const multiSelectActive = state.multiSelectMode;
  const allVisibleSelected = selectablePaths.length > 0
    && selectablePaths.every((path) => state.selectedFilePaths.has(path));
  const multiSelectControls = [
    homeEls.fileSelectionWrap,
    homeEls.selectAllFilesBtn,
    homeEls.clearFileSelectionBtn,
    homeEls.rewriteSelectedBtn,
    homeEls.deleteSelectedBtn,
  ];

  multiSelectControls.forEach((element) => setElementHidden(element, !multiSelectActive));

  if (homeEls.fileList) {
    homeEls.fileList.classList.toggle('is-multiselect', multiSelectActive);
  }
  if (homeEls.multiSelectModeBtn) {
    homeEls.multiSelectModeBtn.disabled = busy;
    homeEls.multiSelectModeBtn.classList.toggle('is-active', multiSelectActive);
    homeEls.multiSelectModeBtn.setAttribute('aria-pressed', multiSelectActive ? 'true' : 'false');
    homeEls.multiSelectModeBtn.title = multiSelectActive ? '退出多选' : '显示多选';
  }

  if (homeEls.fileSelectionSummary) {
    homeEls.fileSelectionSummary.textContent = selectedCount
      ? `已选 ${selectedCount} 项`
      : '未选择文件';
  }
  if (homeEls.deleteSelectedBtn) {
    homeEls.deleteSelectedBtn.disabled = busy || !multiSelectActive || selectedCount === 0;
  }
  if (homeEls.rewriteSelectedBtn) {
    homeEls.rewriteSelectedBtn.disabled = busy || !multiSelectActive || rewriteableSelectedCount === 0;
  }
  if (homeEls.refreshFilesBtn) {
    homeEls.refreshFilesBtn.disabled = busy;
  }
  if (homeEls.selectAllFilesBtn) {
    homeEls.selectAllFilesBtn.disabled = busy || !multiSelectActive || selectablePaths.length === 0;
    homeEls.selectAllFilesBtn.classList.toggle('is-active', multiSelectActive && allVisibleSelected);
  }
  if (homeEls.clearFileSelectionBtn) {
    homeEls.clearFileSelectionBtn.disabled = busy || !multiSelectActive || selectedCount === 0;
  }
  updatePreviewRewriteState();
  if (homeEls.refreshRecentMdBtn) {
    homeEls.refreshRecentMdBtn.disabled = busy;
  }
}

function renderFileBreadcrumbs(currentPath = '') {
  if (!homeEls.fileBreadcrumbs) return;
  const parts = filePathParts(currentPath);
  const rootButton = `<button class="file-crumb ${parts.length ? '' : 'active'}" data-path="" type="button">全部结果</button>`;
  const crumbs = parts.map((part, index) => `
    <span class="file-crumb-separator" aria-hidden="true">/</span>
    <button class="file-crumb ${index === parts.length - 1 ? 'active' : ''}" data-path="${escapeHtml(pathFromParts(parts, index + 1))}" type="button">
      ${escapeHtml(part)}
    </button>
  `).join('');
  homeEls.fileBreadcrumbs.innerHTML = rootButton + crumbs;

  homeEls.fileBreadcrumbs.querySelectorAll('.file-crumb').forEach((button) => {
    button.addEventListener('click', async () => {
      const path = button.dataset.path || '';
      if (path === state.currentPath && state.fileTreeExpandedPaths.has(normalizeFilePath(path))) return;
      if (!await ensurePreviewEditorSavedBeforePreviewChange()) return;
      setPreviewState(defaultPreviewState());
      loadFiles(path).catch((error) => toast(error.message));
    });
  });
}

function renderFileListMeta(files) {
  if (!homeEls.fileListMeta) return;
  const entries = state.fileTreeVisibleNodes.length
    ? state.fileTreeVisibleNodes.map((node) => node.entry).filter(Boolean)
    : (files?.entries || []);
  const directoryCount = entries.filter((entry) => entry.type === 'directory').length;
  const fileCount = entries.length - directoryCount;
  homeEls.fileListMeta.innerHTML = `
    <span><strong>${directoryCount}</strong> 目录</span>
    <span><strong>${fileCount}</strong> 文件</span>
  `;
}

function renderRecentMarkdownMeta(type, count) {
  const target = type === 'crawled' ? homeEls.recentCrawledMdMeta : homeEls.recentRewriteMdMeta;
  if (target) {
    target.textContent = `${count} 个`;
  }
}

function renderRecentMarkdownList(type, items = []) {
  const container = type === 'crawled' ? homeEls.recentCrawledMdList : homeEls.recentRewriteMdList;
  if (!container) return;
  renderRecentMarkdownMeta(type, items.length);
  if (!items.length) {
    container.innerHTML = '<div class="md-quick-empty">暂无 Markdown 文件</div>';
    return;
  }

  container.innerHTML = items.map((item) => {
    const path = String(item.path || '');
    const name = item.name || fileBaseName(path) || 'Markdown 文件';
    const details = [
      item.context || item.folder || '',
      item.modified ? compactTime(item.modified) : '',
      sizeText(Number(item.size) || 0),
    ].filter(Boolean);
    const rewriteButton = item.rewriteable ? `
      <button class="btn btn-ghost md-quick-action md-quick-rewrite" data-action="rewrite" data-path="${escapeHtml(path)}" data-name="${escapeHtml(name)}" type="button" title="仿写" aria-label="仿写 ${escapeHtml(name)}">
        ${iconSvg('rewrite')}
      </button>
    ` : '';

    return `
      <article class="md-quick-row">
        <button class="md-quick-main" data-action="preview" data-path="${escapeHtml(path)}" type="button">
          <span class="md-quick-icon" aria-hidden="true">${iconSvg('markdown')}</span>
          <span class="md-quick-copy">
            <span class="md-quick-name">${escapeHtml(name)}</span>
            <span class="md-quick-details">${escapeHtml(details.join(' · '))}</span>
          </span>
        </button>
        <div class="md-quick-actions">
          <button class="btn btn-ghost md-quick-action" data-action="locate" data-path="${escapeHtml(path)}" data-folder="${escapeHtml(item.folder || '')}" type="button" title="定位" aria-label="定位 ${escapeHtml(name)}">
            ${iconSvg('open')}
          </button>
          ${rewriteButton}
        </div>
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const action = button.dataset.action || '';
        const path = button.dataset.path || '';
        if (!path) return;
        if (action === 'preview') {
          await previewFile(path);
          return;
        }
        if (action === 'locate') {
          await locateFileInTree(path, button.dataset.folder || pathFromParts(fileDirectoryParts(path)));
          return;
        }
        if (action === 'rewrite') {
          await rewriteEntry(path, button.dataset.name || fileBaseName(path));
        }
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function renderRecentMarkdown(recent = {}) {
  state.recentMarkdown = {
    crawled: Array.isArray(recent.crawled) ? recent.crawled : [],
    rewritten: Array.isArray(recent.rewritten) ? recent.rewritten : [],
  };
  renderRecentMarkdownList('crawled', state.recentMarkdown.crawled);
  renderRecentMarkdownList('rewritten', state.recentMarkdown.rewritten);
  updatePreviewRewriteState();
}

async function loadRecentMarkdown() {
  if (homeEls.mdQuickShell?.hidden) return;
  if (!homeEls.recentCrawledMdList && !homeEls.recentRewriteMdList) return;
  const data = await api('/api/recent-md?limit=8');
  renderRecentMarkdown(data.recent || {});
}

function setFileLayoutListPercent(value) {
  if (!homeEls.fileLayout) return;
  const percent = clampNumber(
    toNumber(value, FILE_LAYOUT_DEFAULT_LIST_PERCENT),
    FILE_LAYOUT_MIN_LIST_PERCENT,
    FILE_LAYOUT_MAX_LIST_PERCENT,
  );
  homeEls.fileLayout.style.setProperty('--file-list-width', `${percent.toFixed(1)}%`);
  if (homeEls.fileLayoutResizer) {
    homeEls.fileLayoutResizer.setAttribute('aria-valuenow', String(Math.round(percent)));
  }
}

function fileLayoutPercentFromClientX(clientX) {
  const rect = homeEls.fileLayout?.getBoundingClientRect();
  if (!rect?.width) return FILE_LAYOUT_DEFAULT_LIST_PERCENT;
  return ((clientX - rect.left) / rect.width) * 100;
}

function bindFileLayoutResize() {
  const layout = homeEls.fileLayout;
  const resizer = homeEls.fileLayoutResizer;
  if (!layout || !resizer) return;
  setFileLayoutListPercent(FILE_LAYOUT_DEFAULT_LIST_PERCENT);

  let activePointerId = null;

  const stopResizing = (event) => {
    if (activePointerId !== event.pointerId) return;
    activePointerId = null;
    layout.classList.remove('is-resizing');
    if (resizer.hasPointerCapture?.(event.pointerId)) {
      resizer.releasePointerCapture(event.pointerId);
    }
  };

  resizer.addEventListener('pointerdown', (event) => {
    activePointerId = event.pointerId;
    layout.classList.add('is-resizing');
    resizer.setPointerCapture?.(event.pointerId);
    setFileLayoutListPercent(fileLayoutPercentFromClientX(event.clientX));
    event.preventDefault();
  });

  resizer.addEventListener('pointermove', (event) => {
    if (activePointerId !== event.pointerId) return;
    setFileLayoutListPercent(fileLayoutPercentFromClientX(event.clientX));
  });

  resizer.addEventListener('pointerup', stopResizing);
  resizer.addEventListener('pointercancel', stopResizing);

  resizer.addEventListener('keydown', (event) => {
    const current = toNumber(resizer.getAttribute('aria-valuenow'), FILE_LAYOUT_DEFAULT_LIST_PERCENT);
    const step = event.shiftKey ? 5 : 2;
    let next = current;
    if (event.key === 'ArrowLeft') next = current - step;
    if (event.key === 'ArrowRight') next = current + step;
    if (event.key === 'Home') next = FILE_LAYOUT_MIN_LIST_PERCENT;
    if (event.key === 'End') next = FILE_LAYOUT_MAX_LIST_PERCENT;
    if (next === current) return;
    event.preventDefault();
    setFileLayoutListPercent(next);
  });
}

function renderFileEmptyState(files = {}, disabledAttr = '') {
  const currentPath = String(files.cwd || '');
  const pathParts = filePathParts(currentPath);
  const currentName = pathParts[pathParts.length - 1] || '采集结果';
  const pathLabel = currentPath || '输出根目录';
  const hasParent = Boolean(currentPath);
  const description = hasParent
    ? '这个目录里还没有文件或子目录，可以返回上一级，或者先打开目录确认当前位置。'
    : '采集完成后，结果、素材和 Markdown 文件会出现在这里。';
  const secondaryAction = hasParent
    ? `<button class="btn btn-ghost btn-icon-text file-empty-action" data-action="back" data-path="${escapeHtml(files.parent || '')}" type="button" ${disabledAttr}>${iconSvg('back')}返回上级</button>`
    : `<button class="btn btn-ghost btn-icon-text file-empty-action" data-action="refresh" type="button" ${disabledAttr}>${iconSvg('refresh')}刷新列表</button>`;

  return `
    <div class="file-empty-state ${hasParent ? 'has-parent' : ''}">
      <div class="file-empty-state-shell">
        <span class="file-empty-state-icon" aria-hidden="true">${iconSvg('folder')}</span>
        <div class="file-empty-state-path">${escapeHtml(pathLabel)}</div>
        <strong class="file-empty-state-title">${escapeHtml(currentName)} 为空</strong>
        <p class="file-empty-state-text">${escapeHtml(description)}</p>
        <div class="file-empty-state-actions">
          <button class="btn btn-ghost btn-icon-text file-empty-action" data-action="open-folder" data-path="${escapeHtml(currentPath)}" type="button" ${disabledAttr}>${iconSvg('open')}打开当前目录</button>
          ${secondaryAction}
        </div>
      </div>
    </div>
  `;
}

function setPreviewState({
  path = '',
  url = '',
  meta = '',
  subMeta = '',
  content = '',
  mode = 'empty',
  truncated = false,
  open = Boolean(path),
} = {}) {
  if (!homeEls.filePreview) return;
  if (state.previewRewriteOpen) {
    closePreviewRewritePopover({ restoreFocus: false });
  }
  resetPreviewEditorState();
  state.currentPreviewPath = path;
  state.currentPreviewContent = content;
  state.currentPreviewMode = mode;
  state.currentPreviewSubMeta = subMeta;
  state.currentPreviewTruncated = Boolean(truncated);

  const shouldShow = Boolean(open && (path || meta || content));
  if (homeEls.fileLayout) {
    homeEls.fileLayout.classList.toggle('has-preview', shouldShow);
  }
  if (homeEls.filePreviewPanel) {
    homeEls.filePreviewPanel.classList.toggle('has-file', shouldShow);
    homeEls.filePreviewPanel.setAttribute('aria-hidden', 'false');
  }

  if (!shouldShow) {
    if (homeEls.filePreviewMeta) homeEls.filePreviewMeta.textContent = '预览';
    state.currentPreviewSubMeta = '未选择文件';
    updatePreviewHeaderState();
    if (homeEls.copyPreviewTextBtn) homeEls.copyPreviewTextBtn.disabled = true;
    if (homeEls.closePreviewBtn) homeEls.closePreviewBtn.disabled = true;
    setPreviewFullscreen(false);
    updatePreviewRewriteState();
    homeEls.filePreview.className = 'file-preview is-empty';
    homeEls.filePreview.innerHTML = `
      <div class="file-preview-empty">
        <span class="file-preview-empty-icon" aria-hidden="true"></span>
        <strong>未选择文件</strong>
      </div>
    `;
    if (homeEls.fileList) {
      homeEls.fileList.querySelectorAll('.file-row').forEach((row) => row.classList.remove('is-active'));
    }
    return;
  }

  if (homeEls.filePreviewMeta) {
    homeEls.filePreviewMeta.textContent = meta;
  }
  updatePreviewHeaderState();
  if (homeEls.copyPreviewTextBtn) {
    homeEls.copyPreviewTextBtn.disabled = !content || !['markdown', 'text'].includes(mode);
  }
  if (homeEls.closePreviewBtn) {
    homeEls.closePreviewBtn.disabled = false;
  }
  setPreviewFullscreen(state.previewFullscreen);
  updatePreviewRewriteState();

  homeEls.filePreview.className = `file-preview is-${mode}`;
  if (mode === 'markdown') {
    renderMarkdownPreviewContent();
  } else if (mode === 'image') {
    homeEls.filePreview.innerHTML = `<img class="file-preview-media" src="${escapeHtml(url)}" alt="${escapeHtml(meta)}" loading="lazy">`;
  } else if (mode === 'video') {
    homeEls.filePreview.innerHTML = `<video class="file-preview-media" src="${escapeHtml(url)}" controls preload="metadata"></video>`;
  } else {
    homeEls.filePreview.textContent = `${content}${truncated ? '\n\n...内容过长，已截断预览' : ''}`;
  }

  if (homeEls.fileList) {
    homeEls.fileList.querySelectorAll('.file-row').forEach((row) => {
      row.classList.toggle('is-active', row.dataset.path === path);
    });
  }
}

async function openFolder(path = '') {
  await api('/api/files/open', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
  toast('已打开文件夹');
}

function normalizeFilesPayload(files = {}, fallbackPath = '') {
  const cwdSource = files.cwd === undefined || files.cwd === null ? fallbackPath : files.cwd;
  const parentSource = files.parent === undefined || files.parent === null
    ? pathFromParts(fileDirectoryParts(cwdSource))
    : files.parent;
  const cwd = normalizeFilePath(cwdSource);
  const parent = normalizeFilePath(parentSource);
  const entries = Array.isArray(files.entries) ? files.entries : [];
  return {
    ...files,
    cwd,
    parent,
    entries: entries.map((entry) => ({
      ...entry,
      name: String(entry.name || fileBaseName(entry.path) || ''),
      path: normalizeFilePath(entry.path || ''),
      type: entry.type === 'directory' ? 'directory' : 'file',
    })).filter((entry) => entry.path),
  };
}

function cacheFileDirectory(files = {}, fallbackPath = '') {
  const normalized = normalizeFilesPayload(files, fallbackPath);
  state.fileTreeCache.set(normalized.cwd, normalized);
  rebuildFileEntryMap();
  return normalized;
}

function rebuildFileEntryMap() {
  const entries = new Map();
  state.fileTreeCache.forEach((files) => {
    (files.entries || []).forEach((entry) => {
      if (entry.path) entries.set(entry.path, entry);
    });
  });
  state.currentFileEntries = entries;
}

function setCurrentFiles(files) {
  const normalized = cacheFileDirectory(files || {}, state.currentPath);
  state.currentFiles = normalized;
  state.currentPath = normalized.cwd;
  return normalized;
}

function clearFileSelection() {
  state.selectedFilePaths = new Set();
  updateFileToolbarState();
}

function setMultiSelectMode(enabled) {
  state.multiSelectMode = Boolean(enabled);
  if (!state.multiSelectMode) {
    state.selectedFilePaths = new Set();
  }
  if (state.currentFiles) {
    renderFiles(state.currentFiles);
  } else {
    updateFileToolbarState();
  }
}

async function collectDescendantFilePaths(path = '', { load = false } = {}) {
  const normalizedPath = normalizeFilePath(path);
  if (!normalizedPath) return [];
  const entry = state.currentFileEntries.get(normalizedPath);
  if (entry?.type !== 'directory') return [];

  let files = state.fileTreeCache.get(normalizedPath);
  if (!files && load) {
    files = await fetchFileDirectory(normalizedPath);
  }
  if (!files) return [];

  const paths = [];
  for (const child of files.entries || []) {
    if (!child.path) continue;
    paths.push(child.path);
    if (child.type === 'directory') {
      paths.push(...await collectDescendantFilePaths(child.path, { load }));
    }
  }
  return paths;
}

async function toggleFileSelection(path, checked) {
  if (!state.multiSelectMode) return;
  const normalizedPath = normalizeFilePath(path);
  if (!normalizedPath) return;
  const affectedPaths = [
    normalizedPath,
    ...await collectDescendantFilePaths(normalizedPath, { load: checked }),
  ];
  const next = new Set(state.selectedFilePaths);
  affectedPaths.forEach((affectedPath) => {
    if (checked) {
      next.add(affectedPath);
    } else {
      next.delete(affectedPath);
    }
  });
  state.selectedFilePaths = next;
  renderFiles(state.currentFiles);
}

function selectAllVisibleFiles() {
  if (!state.multiSelectMode) {
    setMultiSelectMode(true);
  }
  const entries = state.fileTreeVisibleNodes.map((node) => node.entry).filter(Boolean);
  if (!entries.length) return;
  state.selectedFilePaths = new Set(entries.map((entry) => entry.path).filter(Boolean));
  renderFiles(state.currentFiles);
}

function selectedRewriteableEntries() {
  return Array.from(state.selectedFilePaths)
    .map((path) => state.currentFileEntries.get(path))
    .filter((entry) => entry?.path && entry.rewriteable)
    .map((entry) => ({
      path: entry.path,
      name: entry.name || fileBaseName(entry.path),
    }));
}

function isSamePathOrChild(path = '', possibleParent = '') {
  const normalizedPath = normalizeFilePath(path);
  const normalizedParent = normalizeFilePath(possibleParent);
  return normalizedPath === normalizedParent
    || Boolean(normalizedParent && normalizedPath.startsWith(`${normalizedParent}/`));
}

function rebasePathAfterRename(path = '', oldPath = '', newPath = '') {
  const normalizedPath = normalizeFilePath(path);
  const normalizedOld = normalizeFilePath(oldPath);
  const normalizedNew = normalizeFilePath(newPath);
  if (!normalizedPath || !normalizedOld || !normalizedNew) return normalizedPath;
  if (normalizedPath === normalizedOld) return normalizedNew;
  if (normalizedPath.startsWith(`${normalizedOld}/`)) {
    return `${normalizedNew}/${normalizedPath.slice(normalizedOld.length + 1)}`;
  }
  return normalizedPath;
}

function rebasePathSetAfterRename(paths, oldPath = '', newPath = '') {
  return new Set(Array.from(paths || []).map((path) => rebasePathAfterRename(path, oldPath, newPath)));
}

function clearRenamedFileTreeCache(oldPath = '') {
  const normalizedOld = normalizeFilePath(oldPath);
  state.fileTreeLoadPromises.forEach((_promise, path) => {
    if (!normalizedOld || isSamePathOrChild(path, normalizedOld)) {
      state.fileTreeLoadPromises.delete(path);
    }
  });
  state.fileTreeCache.clear();
  state.currentFiles = null;
  state.currentFileEntries.clear();
}

function rebaseFileTreeStateAfterRename(oldPath = '', newPath = '') {
  const normalizedOld = normalizeFilePath(oldPath);
  const normalizedNew = normalizeFilePath(newPath);
  if (!normalizedOld || !normalizedNew) return;

  state.selectedFilePaths = rebasePathSetAfterRename(state.selectedFilePaths, normalizedOld, normalizedNew);
  state.fileTreeExpandedPaths = rebasePathSetAfterRename(state.fileTreeExpandedPaths, normalizedOld, normalizedNew);
  state.fileDetailExpandedPaths = rebasePathSetAfterRename(state.fileDetailExpandedPaths, normalizedOld, normalizedNew);
  state.fileTreeLoadingPaths = rebasePathSetAfterRename(state.fileTreeLoadingPaths, normalizedOld, normalizedNew);
  state.currentPath = rebasePathAfterRename(state.currentPath, normalizedOld, normalizedNew);
  state.fileTreeExpandedPaths.add('');
  clearRenamedFileTreeCache(normalizedOld);
}

function shouldResetPreview(removedPaths) {
  if (!state.currentPreviewPath) return false;
  return removedPaths.some((path) => isSamePathOrChild(state.currentPreviewPath, path));
}

function nearestRemainingAncestor(path = '', removedPaths = []) {
  let parts = filePathParts(path);
  while (parts.length) {
    const candidate = pathFromParts(parts);
    if (!removedPaths.some((removedPath) => isSamePathOrChild(candidate, removedPath))) {
      return candidate;
    }
    parts = parts.slice(0, -1);
  }
  return '';
}

function pruneDeletedFileTreePaths(paths = []) {
  const removedPaths = Array.from(new Set(paths.map((path) => normalizeFilePath(path)).filter(Boolean)));
  if (!removedPaths.length) return;

  state.selectedFilePaths = new Set(Array.from(state.selectedFilePaths).filter((path) => (
    !removedPaths.some((removedPath) => isSamePathOrChild(path, removedPath))
  )));
  state.fileTreeExpandedPaths = new Set(Array.from(state.fileTreeExpandedPaths).filter((path) => (
    !removedPaths.some((removedPath) => isSamePathOrChild(path, removedPath))
  )));
  state.fileDetailExpandedPaths = new Set(Array.from(state.fileDetailExpandedPaths).filter((path) => (
    !removedPaths.some((removedPath) => isSamePathOrChild(path, removedPath))
  )));
  state.fileTreeLoadingPaths = new Set(Array.from(state.fileTreeLoadingPaths).filter((path) => (
    !removedPaths.some((removedPath) => isSamePathOrChild(path, removedPath))
  )));
  state.fileTreeLoadPromises.forEach((_promise, path) => {
    if (removedPaths.some((removedPath) => isSamePathOrChild(path, removedPath))) {
      state.fileTreeLoadPromises.delete(path);
    }
  });

  state.fileTreeCache.forEach((files, path) => {
    if (removedPaths.some((removedPath) => isSamePathOrChild(path, removedPath))) {
      state.fileTreeCache.delete(path);
      return;
    }
    const nextEntries = (files.entries || []).filter((entry) => (
      !removedPaths.some((removedPath) => isSamePathOrChild(entry.path, removedPath))
    ));
    state.fileTreeCache.set(path, { ...files, entries: nextEntries });
  });

  if (removedPaths.some((removedPath) => isSamePathOrChild(state.currentPath, removedPath))) {
    state.currentPath = nearestRemainingAncestor(state.currentPath, removedPaths);
  }
  state.fileTreeExpandedPaths.add('');
  rebuildFileEntryMap();
}

async function deleteEntries(paths, label = '') {
  const targets = Array.from(new Set((paths || []).map((value) => normalizeFilePath(value)).filter(Boolean)));
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

  const deletedPaths = (data.deleted_paths || targets).map((path) => normalizeFilePath(path)).filter(Boolean);
  if (shouldResetPreview(deletedPaths)) {
    setPreviewState(defaultPreviewState());
  }
  pruneDeletedFileTreePaths(deletedPaths);
  await Promise.all([
    loadFiles(state.currentPath, { force: true }),
    loadRecentMarkdown(),
  ]);
  toast(targets.length === 1 ? '已删除' : `已删除 ${data.deleted_count || targets.length} 项`);
}

async function restorePreviewAfterRename(previewPath = '', previewMode = 'empty', previewMeta = '') {
  const normalizedPath = normalizeFilePath(previewPath);
  if (!normalizedPath) return;
  if (previewMode === 'markdown' || previewMode === 'text') {
    await previewFile(normalizedPath);
    return;
  }
  if (previewMode === 'image' || previewMode === 'video') {
    previewMediaFile(normalizedPath, previewMeta || fileBaseName(normalizedPath), previewMode);
  }
}

function cancelInlineRename({ render = true } = {}) {
  state.renamePath = '';
  state.renameSaving = false;
  if (render) renderFiles(state.currentFiles);
}

function validateRenameName(name = '', currentName = '') {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) return { error: '名称不能为空', name: '' };
  if (normalizedName === currentName) return { unchanged: true, name: normalizedName };
  if (normalizedName === '.' || normalizedName === '..') {
    return { error: '名称不合法', name: normalizedName };
  }
  if (normalizedName.includes('/') || normalizedName.includes('\\')) {
    return { error: '名称不能包含路径分隔符', name: normalizedName };
  }
  if (normalizedName.startsWith('.')) {
    return { error: '名称不可用', name: normalizedName };
  }
  return { name: normalizedName };
}

function focusInlineRenameInput(path = '') {
  const normalizedPath = normalizeFilePath(path);
  if (!normalizedPath || !homeEls.fileList) return;
  window.requestAnimationFrame(() => {
    const input = homeEls.fileList.querySelector(`.file-rename-input[data-path="${cssEscape(normalizedPath)}"]`);
    if (!input) return;
    input.focus();
    const value = input.value || '';
    const entry = state.currentFileEntries.get(normalizedPath);
    const dotIndex = entry?.type === 'file' ? value.lastIndexOf('.') : -1;
    input.setSelectionRange(0, dotIndex > 0 ? dotIndex : value.length);
  });
}

function renameEntry(path, name = '') {
  const normalizedPath = normalizeFilePath(path);
  if (!normalizedPath) {
    toast('请选择要重命名的文件或目录');
    return;
  }
  if (state.collectBusy || state.rewriteBusy) {
    toast('当前任务运行中，稍后再重命名');
    return;
  }
  if (state.renameSaving) {
    toast('正在保存重命名');
    return;
  }

  state.renamePath = normalizedPath;
  state.renameSaving = false;
  renderFiles(state.currentFiles);
  focusInlineRenameInput(normalizedPath);
}

async function commitInlineRename(path, name = '', currentName = '') {
  const normalizedPath = normalizeFilePath(path);
  if (!normalizedPath) {
    throw new Error('请选择要重命名的文件或目录');
  }
  const existingName = currentName || fileBaseName(normalizedPath);
  const validation = validateRenameName(name, existingName);
  if (validation.unchanged) {
    cancelInlineRename();
    return;
  }
  if (validation.error) {
    throw new Error(validation.error);
  }
  const normalizedName = validation.name;

  const previewPath = state.currentPreviewPath;
  const previewMode = state.currentPreviewMode;
  const previewAffected = isSamePathOrChild(previewPath, normalizedPath);

  state.renameSaving = true;
  const data = await api('/api/files/rename', {
    method: 'POST',
    body: JSON.stringify({ path: normalizedPath, name: normalizedName }),
  });

  const entry = data.entry || {};
  const oldPath = normalizeFilePath(entry.old_path || normalizedPath);
  const newPath = normalizeFilePath(entry.path || pathFromParts([...fileDirectoryParts(normalizedPath), normalizedName]));
  const focusPath = isSamePathOrChild(state.currentPath, oldPath)
    ? rebasePathAfterRename(state.currentPath, oldPath, newPath)
    : state.currentPath;
  const nextPreviewPath = previewAffected ? rebasePathAfterRename(previewPath, oldPath, newPath) : '';
  const nextPreviewMeta = previewPath === oldPath ? (entry.name || fileBaseName(newPath)) : fileBaseName(nextPreviewPath);

  if (previewAffected) {
    setPreviewState(defaultPreviewState());
  }
  state.renamePath = '';
  state.renameSaving = false;
  rebaseFileTreeStateAfterRename(oldPath, newPath);

  await Promise.all([
    loadFiles(focusPath || pathFromParts(fileDirectoryParts(newPath)), { force: true, resetSelection: false }),
    loadRecentMarkdown(),
  ]);
  if (previewAffected) {
    try {
      await restorePreviewAfterRename(nextPreviewPath, previewMode, nextPreviewMeta);
    } catch (error) {
      toast(`已重命名，预览刷新失败：${error.message}`);
      return;
    }
  }
  scrollFileTreePathIntoView(newPath);
  toast('已重命名');
}

async function rewriteEntry(path, name = '', options = {}) {
  await rewriteEntries([{ path, name: name || fileBaseName(path) }], options);
}

async function rewriteSelectedEntries() {
  const entries = selectedRewriteableEntries();
  if (!entries.length) {
    toast('请选择可仿写的笔记');
    return;
  }
  await rewriteEntries(entries, { confirmBulk: true });
}

async function rewriteEntries(entries, { confirmBulk = false, topic: topicOverride = '' } = {}) {
  const targets = (entries || [])
    .map((entry) => ({
      path: normalizeFilePath(entry.path || ''),
      name: String(entry.name || '').trim(),
    }))
    .filter((entry) => entry.path);
  if (!targets.length || state.rewriteBusy) return;
  if (confirmBulk && targets.length > 1 && !window.confirm(`确定对已选 ${targets.length} 篇笔记执行 AI 仿写吗？`)) {
    return;
  }

  const topic = (topicOverride || state.config?.rewrite?.topic || '创业沙龙').trim() || '创业沙龙';
  state.rewriteBusy = true;
  updateFileToolbarState();
  updatePreviewRewriteState();
  if (state.currentFiles) renderFiles(state.currentFiles);

  try {
    toast(targets.length > 1 ? `正在创建 AI 仿写任务：${targets.length} 篇` : `正在创建 AI 仿写任务：${targets[0].name || fileBaseName(targets[0].path)}`);
    const data = await api('/api/rewrite-job', {
      method: 'POST',
      body: JSON.stringify({ targets, topic }),
    });
    const jobId = data.job?.id || '';
    if (homeEls.jobList) {
      await loadJobs();
    }
    if (jobId && homeEls.jobList) {
      await waitForJobCard(jobId);
      highlightJobCard(jobId);
      scrollToJobCard(jobId);
    }
    toast(jobId ? `AI 仿写任务已启动：${jobId}` : 'AI 仿写任务已启动');
  } finally {
    state.rewriteBusy = false;
    updateFileToolbarState();
    updatePreviewRewriteState();
    if (state.currentFiles) renderFiles(state.currentFiles);
  }
}

function getFocusedFiles() {
  return state.fileTreeCache.get(state.currentPath)
    || state.fileTreeCache.get('')
    || state.currentFiles
    || normalizeFilesPayload({ cwd: state.currentPath, entries: [] }, state.currentPath);
}

function getFileTreeVisibleNodes() {
  const rootFiles = state.fileTreeCache.get('');
  if (!rootFiles) return [];
  const nodes = [];
  const appendEntries = (files, depth) => {
    (files.entries || []).forEach((entry) => {
      const isDirectory = entry.type === 'directory';
      const childFiles = isDirectory ? state.fileTreeCache.get(entry.path) : null;
      const expanded = isDirectory && state.fileTreeExpandedPaths.has(entry.path);
      const node = {
        entry,
        depth,
        expanded,
        loaded: Boolean(childFiles),
        loading: isDirectory && state.fileTreeLoadingPaths.has(entry.path),
        childCount: childFiles?.entries?.length || 0,
      };
      nodes.push(node);
      if (expanded && childFiles) {
        appendEntries(childFiles, depth + 1);
      }
    });
  };
  appendEntries(rootFiles, 0);
  return nodes;
}

function renderFileTreeLoadingState() {
  return `
    <div class="file-empty-state file-tree-loading-state">
      <div class="file-empty-state-shell">
        <span class="file-empty-state-icon" aria-hidden="true">${iconSvg('refresh')}</span>
        <strong class="file-empty-state-title">正在加载文件树</strong>
      </div>
    </div>
  `;
}

function renderFileTreeStatusRow(node) {
  if (node.entry.type !== 'directory' || !node.expanded) return '';
  if (node.loading) {
    return `
      <div class="file-tree-status is-loading" style="--tree-depth: ${node.depth + 1};">
        <span class="file-tree-status-icon" aria-hidden="true">${iconSvg('refresh')}</span>
        <span>正在加载</span>
      </div>
    `;
  }
  if (node.loaded && node.childCount === 0) {
    return `
      <div class="file-tree-status is-empty-child" style="--tree-depth: ${node.depth + 1};">
        <span class="file-tree-status-icon" aria-hidden="true">${iconSvg('folder')}</span>
        <span>空目录</span>
      </div>
    `;
  }
  return '';
}

function directoryNodeMeta(node) {
  if (node.loading) return '加载中';
  if (node.loaded) return `${node.childCount} 项`;
  return '未展开';
}

function toggleFileDetail(path = '') {
  const normalizedPath = normalizeFilePath(path);
  if (!normalizedPath) return;
  const next = new Set(state.fileDetailExpandedPaths);
  if (next.has(normalizedPath)) {
    next.delete(normalizedPath);
  } else {
    next.add(normalizedPath);
  }
  state.fileDetailExpandedPaths = next;
  renderFiles(state.currentFiles);
}

function renderFileActionMenu(entry, previewMode, detailOpen, disabledAttr = '') {
  const actions = [
    {
      action: 'details',
      icon: 'details',
      label: detailOpen ? '隐藏详情' : '显示详情',
      className: detailOpen ? 'is-active' : '',
      attrs: `aria-expanded="${detailOpen ? 'true' : 'false'}"`,
    },
  ];

  if (entry.rewriteable) {
    actions.push({
      action: 'rewrite',
      icon: 'rewrite',
      label: '仿写',
      className: 'file-rewrite-btn',
      attrs: `data-name="${escapeHtml(entry.name)}"`,
    });
  }

  if (entry.type === 'file' && canPreviewEntry(entry)) {
    actions.push({
      action: 'preview',
      icon: fileIconName(entry),
      label: previewMode === 'image' || previewMode === 'video' ? '预览媒体' : '预览文本',
      attrs: `data-name="${escapeHtml(entry.name)}"`,
    });
  }

  actions.push(
    {
      action: 'rename',
      icon: 'rename',
      label: '重命名',
      className: 'file-rename-btn',
      attrs: `data-name="${escapeHtml(entry.name)}"`,
    },
    {
      action: 'open-folder',
      icon: 'open',
      label: '打开所在文件夹',
    },
    {
      action: 'delete',
      icon: 'trash',
      label: '删除',
      className: 'file-delete-btn',
      attrs: `data-name="${escapeHtml(entry.name)}"`,
    },
  );

  return `
    <div class="file-action-menu">
      <button
        class="btn btn-ghost file-action-menu-toggle"
        data-path="${escapeHtml(entry.path)}"
        type="button"
        title="更多操作"
        aria-label="${escapeHtml(entry.name)} 的更多操作"
        aria-haspopup="menu"
        aria-expanded="false"
        ${disabledAttr}
      >${iconSvg('more')}</button>
      <div class="file-action-menu-panel" role="menu">
        ${actions.map((item) => `
          <button
            class="file-action-menu-item file-action-btn ${item.className || ''}"
            data-action="${item.action}"
            data-path="${escapeHtml(entry.path)}"
            type="button"
            role="menuitem"
            ${item.attrs || ''}
            ${disabledAttr}
          >
            <span class="file-action-menu-icon" aria-hidden="true">${iconSvg(item.icon)}</span>
            <span>${item.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderFileTreeRow(node, disabledAttr = '') {
  const entry = node.entry;
  const isDirectory = entry.type === 'directory';
  const previewMode = filePreviewMode(entry);
  const isRenaming = state.renamePath === entry.path;
  const details = [
    fileKindLabel(entry),
    isDirectory ? directoryNodeMeta(node) : sizeText(entry.size),
    entry.modified || '',
  ].filter(Boolean);
  const detailTitle = [entry.name, ...details].filter(Boolean).join(' · ');
  const rowClasses = [
    'file-row',
    'file-tree-row',
    isDirectory ? 'is-directory' : '',
    node.expanded ? 'is-expanded' : '',
    node.loading ? 'is-loading' : '',
    state.multiSelectMode && state.selectedFilePaths.has(entry.path) ? 'is-selected' : '',
    state.currentPreviewPath === entry.path ? 'is-active' : '',
    state.currentPath === entry.path ? 'is-focused' : '',
    state.fileDetailExpandedPaths.has(entry.path) ? 'is-details-open' : '',
    isRenaming ? 'is-renaming' : '',
  ].filter(Boolean).join(' ');
  const toggleDisabledAttr = (disabledAttr || node.loading || isRenaming) ? 'disabled' : '';
  const selectDisabledAttr = (disabledAttr || !state.multiSelectMode || isRenaming) ? 'disabled' : '';
  const actionDisabledAttr = (disabledAttr || isRenaming) ? 'disabled' : '';
  const renameSavingAttr = state.renameSaving ? 'disabled' : '';
  const detailOpen = state.fileDetailExpandedPaths.has(entry.path);
  const toggleControl = isDirectory ? `
    <button
      class="file-tree-toggle"
      data-path="${escapeHtml(entry.path)}"
      type="button"
      title="${node.expanded ? '收起目录' : '展开目录'}"
      aria-label="${node.expanded ? '收起' : '展开'} ${escapeHtml(entry.name)}"
      aria-expanded="${node.expanded ? 'true' : 'false'}"
      ${toggleDisabledAttr}
    >
      ${iconSvg('chevron')}
    </button>
  ` : '<span class="file-tree-toggle-placeholder" aria-hidden="true"></span>';
  const entryControl = isRenaming ? `
    <form
      class="file-rename-form"
      data-path="${escapeHtml(entry.path)}"
      data-name="${escapeHtml(entry.name)}"
    >
      <span class="file-main">
        <input
          class="file-rename-input"
          data-path="${escapeHtml(entry.path)}"
          type="text"
          value="${escapeHtml(entry.name)}"
          aria-label="重命名 ${escapeHtml(entry.name)}"
          autocomplete="off"
          spellcheck="false"
          ${renameSavingAttr}
        >
        <span class="file-details">${details.map((detail) => `<span>${escapeHtml(detail)}</span>`).join('')}</span>
      </span>
    </form>
  ` : `
    <button
      class="file-entry-button"
      data-kind="${entry.type}"
      data-path="${escapeHtml(entry.path)}"
      data-name="${escapeHtml(entry.name)}"
      data-preview-mode="${escapeHtml(previewMode)}"
      title="${escapeHtml(detailTitle)}"
      type="button"
      ${disabledAttr}
    >
      <span class="file-main">
        <span class="file-name">${escapeHtml(entry.name)}</span>
        <span class="file-details">${details.map((detail) => `<span>${escapeHtml(detail)}</span>`).join('')}</span>
      </span>
    </button>
  `;

  return `
    <div class="${rowClasses}" data-path="${escapeHtml(entry.path)}" style="--tree-depth: ${node.depth};">
      <label class="file-select" aria-label="选择 ${escapeHtml(entry.name)}">
        <input class="file-select-input" data-path="${escapeHtml(entry.path)}" type="checkbox" ${state.multiSelectMode && state.selectedFilePaths.has(entry.path) ? 'checked' : ''} ${selectDisabledAttr}>
      </label>
      ${toggleControl}
      ${entryControl}
      ${renderFileActionMenu(entry, previewMode, detailOpen, actionDisabledAttr)}
    </div>
  `;
}

function scrollFileTreePathIntoView(path = '') {
  const normalizedPath = normalizeFilePath(path);
  if (!normalizedPath || !homeEls.fileList) return;
  window.requestAnimationFrame(() => {
    const row = homeEls.fileList.querySelector(`.file-row[data-path="${cssEscape(normalizedPath)}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  });
}

function closeFileActionMenus(exceptMenu = null) {
  if (!homeEls.fileList) return;
  homeEls.fileList.querySelectorAll('.file-action-menu.is-open').forEach((menu) => {
    if (exceptMenu && menu === exceptMenu) return;
    menu.classList.remove('is-open');
    menu.querySelector('.file-action-menu-toggle')?.setAttribute('aria-expanded', 'false');
  });
}

async function fetchFileDirectory(path = '', { force = false } = {}) {
  const normalizedPath = normalizeFilePath(path);
  if (!force && state.fileTreeCache.has(normalizedPath)) {
    return state.fileTreeCache.get(normalizedPath);
  }
  if (!force && state.fileTreeLoadPromises.has(normalizedPath)) {
    return state.fileTreeLoadPromises.get(normalizedPath);
  }

  state.fileTreeLoadingPaths.add(normalizedPath);
  if (state.fileTreeCache.size) renderFiles(state.currentFiles);

  const promise = api(`/api/files?path=${encodeURIComponent(normalizedPath)}`)
    .then((data) => cacheFileDirectory(data.files || {}, normalizedPath))
    .finally(() => {
      state.fileTreeLoadingPaths.delete(normalizedPath);
      state.fileTreeLoadPromises.delete(normalizedPath);
      if (state.fileTreeCache.size) renderFiles(state.currentFiles);
    });
  state.fileTreeLoadPromises.set(normalizedPath, promise);
  return promise;
}

async function expandTreeToPath(path = '', { force = false } = {}) {
  const normalizedPath = normalizeFilePath(path);
  const parts = filePathParts(normalizedPath);
  state.fileTreeExpandedPaths.add('');
  await fetchFileDirectory('', { force: force && parts.length === 0 });
  let currentPath = '';
  for (let index = 0; index < parts.length; index += 1) {
    currentPath = pathFromParts(parts, index + 1);
    state.fileTreeExpandedPaths.add(currentPath);
    await fetchFileDirectory(currentPath, { force });
  }
  return state.fileTreeCache.get(normalizedPath) || state.fileTreeCache.get(currentPath) || state.fileTreeCache.get('');
}

async function refreshExpandedFileTree(focusPath = '') {
  const normalizedFocus = normalizeFilePath(focusPath);
  const paths = new Set(['', normalizedFocus, ...state.fileTreeExpandedPaths]);
  const focusParts = filePathParts(normalizedFocus);
  for (let index = 0; index < focusParts.length; index += 1) {
    paths.add(pathFromParts(focusParts, index + 1));
  }

  const orderedPaths = Array.from(paths)
    .filter((path) => path === '' || path)
    .sort((a, b) => filePathDepth(a) - filePathDepth(b) || a.localeCompare(b));

  for (const path of orderedPaths) {
    try {
      await fetchFileDirectory(path, { force: true });
    } catch (error) {
      state.fileTreeCache.delete(path);
      state.fileTreeExpandedPaths.delete(path);
      if (path === '' || path === normalizedFocus) throw error;
    }
  }
}

async function toggleFileTreeDirectory(path = '') {
  const normalizedPath = normalizeFilePath(path);
  if (!normalizedPath || state.collectBusy || state.rewriteBusy) return;

  state.currentPath = normalizedPath;
  state.currentFiles = state.fileTreeCache.get(normalizedPath) || state.currentFiles;
  if (state.fileTreeExpandedPaths.has(normalizedPath)) {
    state.fileTreeExpandedPaths.delete(normalizedPath);
    renderFiles(state.currentFiles);
    scrollFileTreePathIntoView(normalizedPath);
    return;
  }

  state.fileTreeExpandedPaths.add(normalizedPath);
  renderFiles(state.currentFiles);
  const files = await fetchFileDirectory(normalizedPath);
  state.currentFiles = files;
  renderFiles(files);
  scrollFileTreePathIntoView(normalizedPath);
}

async function locateFileInTree(path = '', folder = '') {
  const filePath = normalizeFilePath(path);
  const folderPath = normalizeFilePath(folder || pathFromParts(fileDirectoryParts(filePath)));
  await loadFiles(folderPath, { resetSelection: false, scroll: false });
  await previewFile(filePath);
  scrollFileTreePathIntoView(filePath);
}

function renderFiles(files = state.currentFiles) {
  if (!homeEls.fileList) return;
  if (files?.entries) {
    const normalized = cacheFileDirectory(files, files.cwd ?? state.currentPath);
    if (normalizeFilePath(state.currentPath) === normalized.cwd || !state.currentPath) {
      state.currentFiles = normalized;
    }
  }

  const focusedFiles = getFocusedFiles();
  state.currentFiles = focusedFiles;
  state.fileTreeVisibleNodes = getFileTreeVisibleNodes();
  renderFileBreadcrumbs(state.currentPath || focusedFiles.cwd || '');
  renderFileListMeta(focusedFiles);
  updateFileToolbarState();

  const disabledAttr = (state.collectBusy || state.rewriteBusy) ? 'disabled' : '';
  const rootLoading = !state.fileTreeCache.has('') && state.fileTreeLoadingPaths.has('');
  const rows = state.fileTreeVisibleNodes.map((node) => (
    `${renderFileTreeRow(node, disabledAttr)}${renderFileTreeStatusRow(node)}`
  )).join('');

  homeEls.fileList.classList.toggle('is-empty', rootLoading || !rows);
  homeEls.fileList.innerHTML = rootLoading
    ? renderFileTreeLoadingState()
    : (rows || renderFileEmptyState(focusedFiles, disabledAttr));

  homeEls.fileList.querySelectorAll('.file-empty-action').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const action = button.dataset.action || '';
        if (action === 'open-folder') {
          await openFolder(button.dataset.path || focusedFiles.cwd || '');
          return;
        }
        if (action === 'back') {
          setPreviewState(defaultPreviewState());
          await loadFiles(button.dataset.path || focusedFiles.parent || '');
          return;
        }
        if (action === 'refresh') {
          await loadFiles(focusedFiles.cwd || state.currentPath, { force: true });
        }
      } catch (error) {
        toast(error.message);
      }
    });
  });

  homeEls.fileList.querySelectorAll('.file-select-input').forEach((input) => {
    input.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    input.addEventListener('change', async () => {
      try {
        input.disabled = true;
        await toggleFileSelection(input.dataset.path || '', input.checked);
      } catch (error) {
        toast(error.message);
        renderFiles(state.currentFiles);
      }
    });
  });

  homeEls.fileList.querySelectorAll('.file-tree-toggle').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        setPreviewState(defaultPreviewState());
        await toggleFileTreeDirectory(button.dataset.path || '');
      } catch (error) {
        toast(error.message);
      }
    });
  });

  homeEls.fileList.querySelectorAll('.file-rename-form').forEach((form) => {
    const input = form.querySelector('.file-rename-input');
    const path = form.dataset.path || '';
    const currentName = form.dataset.name || fileBaseName(path);
    if (!input) return;

    const submitRename = async () => {
      if (state.renameSaving || state.renamePath !== path) return;
      try {
        input.disabled = true;
        await commitInlineRename(path, input.value, currentName);
      } catch (error) {
        const shouldRestoreRename = state.renamePath === path || state.renameSaving;
        state.renameSaving = false;
        toast(error.message);
        if (shouldRestoreRename) {
          state.renamePath = path;
          renderFiles(state.currentFiles);
          focusInlineRenameInput(path);
        } else {
          renderFiles(state.currentFiles);
        }
      }
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitRename();
    });
    input.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelInlineRename();
      }
    });
    input.addEventListener('blur', () => {
      submitRename();
    });
  });

  homeEls.fileList.querySelectorAll('.file-entry-button').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        closeFileActionMenus();
        const path = button.dataset.path || '';
        const name = button.dataset.name || fileBaseName(path);
        const mode = button.dataset.previewMode || 'download';
        if (button.dataset.kind === 'directory') {
          if (!await ensurePreviewEditorSavedBeforePreviewChange()) return;
          setPreviewState(defaultPreviewState());
          await toggleFileTreeDirectory(path);
          return;
        }

        if (mode === 'markdown' || mode === 'text') {
          await previewFile(path);
          return;
        }

        if (mode === 'image' || mode === 'video') {
          if (!await ensurePreviewEditorSavedBeforePreviewChange()) return;
          previewMediaFile(path, name, mode);
          return;
        }

        if (!await ensurePreviewEditorSavedBeforePreviewChange()) return;
        setPreviewState(defaultPreviewState());
        window.open(`/download?path=${encodeURIComponent(path)}`, '_blank', 'noopener');
        toast(`${name} 不支持文本预览，已在新窗口打开`);
      } catch (error) {
        toast(error.message);
      }
    });
  });

  homeEls.fileList.querySelectorAll('.file-action-menu-toggle').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = button.closest('.file-action-menu');
      if (!menu) return;
      const willOpen = !menu.classList.contains('is-open');
      closeFileActionMenus(menu);
      menu.classList.toggle('is-open', willOpen);
      button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
  });

  homeEls.fileList.querySelectorAll('.file-action-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      try {
        event.preventDefault();
        event.stopPropagation();
        closeFileActionMenus();
        const path = button.dataset.path || '';
        if (!path) return;
        if (button.dataset.action === 'rewrite') {
          await rewriteEntry(path, button.dataset.name || fileBaseName(path));
          return;
        }
        if (button.dataset.action === 'details') {
          toggleFileDetail(path);
          return;
        }
        if (button.dataset.action === 'rename') {
          await renameEntry(path, button.dataset.name || fileBaseName(path));
          return;
        }
        if (button.dataset.action === 'open-folder') {
          await openFolder(path);
          return;
        }
        if (button.dataset.action === 'preview') {
          const entry = state.currentFileEntries.get(path) || {};
          const mode = filePreviewMode(entry);
          if (mode === 'markdown' || mode === 'text') {
            await previewFile(path);
          } else if (mode === 'image' || mode === 'video') {
            if (!await ensurePreviewEditorSavedBeforePreviewChange()) return;
            previewMediaFile(path, button.dataset.name || fileBaseName(path), mode);
          }
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

async function loadFiles(path = state.currentPath, { force = false, resetSelection = true, scroll = true } = {}) {
  if (!homeEls.fileList) return null;
  const normalizedPath = normalizeFilePath(path);
  if (resetSelection) {
    clearFileSelection();
  }

  if (force) {
    await refreshExpandedFileTree(normalizedPath);
  } else {
    await expandTreeToPath(normalizedPath);
  }

  const files = state.fileTreeCache.get(normalizedPath) || state.fileTreeCache.get('') || null;
  state.currentPath = files?.cwd || normalizedPath;
  state.currentFiles = files;
  state.fileTreeExpandedPaths.add(state.currentPath);
  renderFiles(files);
  if (scroll) scrollFileTreePathIntoView(state.currentPath);
  return files;
}

async function ensurePreviewEditorSavedBeforePreviewChange() {
  if (!state.previewEditorActive || (!state.previewEditorDirty && !state.previewEditorSaving)) {
    return true;
  }
  const saved = await saveMarkdownPreviewDraft({ force: true });
  if (!saved || state.previewEditorDirty) {
    toast('保存失败，已保留编辑内容');
    return false;
  }
  return true;
}

function previewMediaFile(path, name = '', mode = 'image') {
  const url = `/download?path=${encodeURIComponent(path)}`;
  setPreviewState({
    path,
    url,
    meta: name || fileBaseName(path) || '文件预览',
    subMeta: mode === 'video' ? '视频预览' : '图片预览',
    content: '',
    mode,
    open: true,
  });
}

async function previewFile(path) {
  if (!await ensurePreviewEditorSavedBeforePreviewChange()) return;
  const data = await api(`/api/file?path=${encodeURIComponent(path)}`);
  const previewPath = data.file.path || path;
  const entryName = state.currentFileEntries.get(path)?.name || fileBaseName(previewPath);
  const isMarkdown = isMarkdownPath(previewPath);
  setPreviewState({
    path: previewPath,
    url: `/download?path=${encodeURIComponent(previewPath)}`,
    meta: entryName || '文件预览',
    subMeta: isMarkdown ? 'Markdown 预览' : '文本预览',
    content: data.file.content || '',
    mode: isMarkdown ? 'markdown' : 'text',
    truncated: Boolean(data.file.truncated),
    open: true,
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
  if (homeEls.openOutputDirBtn) {
    homeEls.openOutputDirBtn.addEventListener('click', () => {
      openFolder('').catch((error) => toast(error.message));
    });
  }
}

function bindHomeEvents() {
  bindFileLayoutResize();
  document.addEventListener('click', (event) => {
    if (!homeEls.fileList || event.target.closest('.file-action-menu')) return;
    closeFileActionMenus();
  });
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
      state.jobPage = 1;
      renderJobs(state.currentJobs);
    });
  }
  if (homeEls.jobTypeFilters) {
    homeEls.jobTypeFilters.addEventListener('click', (event) => {
      const button = event.target.closest('[data-job-type-filter]');
      if (!button) return;
      state.jobTypeFilter = button.dataset.jobTypeFilter || 'all';
      state.jobPage = 1;
      renderJobs(state.currentJobs);
    });
  }
  if (homeEls.jobPagination) {
    homeEls.jobPagination.addEventListener('click', (event) => {
      const button = event.target.closest('[data-job-page]');
      if (!button || button.disabled) return;
      const pageCount = jobPageCount(filterJobs(state.currentJobs).length);
      const targetPage = button.dataset.jobPage || '1';
      if (targetPage === 'prev') {
        state.jobPage -= 1;
      } else if (targetPage === 'next') {
        state.jobPage += 1;
      } else {
        state.jobPage = Number(targetPage) || 1;
      }
      state.jobPage = Math.min(Math.max(1, state.jobPage), pageCount);
      renderJobs(state.currentJobs);
    });
    homeEls.jobPagination.addEventListener('change', (event) => {
      const select = event.target.closest('[data-job-page-size]');
      if (!select) return;
      const previousSize = state.jobPageSize;
      const nextSize = normalizeJobPageSize(select.value);
      if (nextSize === previousSize) return;
      state.jobPageSize = nextSize;
      state.jobPage = 1;
      renderJobs(state.currentJobs);
      saveJobPageSize(nextSize, previousSize);
    });
  }
  if (homeEls.jobList) {
    homeEls.jobList.addEventListener('change', (event) => {
      const input = event.target.closest('.job-select-input');
      if (!input) return;
      toggleJobSelection(input.dataset.jobId || '', input.checked);
    });
    homeEls.jobList.addEventListener('click', (event) => {
      if (event.target.closest('.job-select')) {
        event.stopPropagation();
        return;
      }
      const button = event.target.closest('.job-copy-id');
      if (!button) return;
      copyText(button.dataset.jobId || '')
        .then(() => toast('任务 ID 已复制'))
        .catch((error) => toast(error.message || '复制失败'));
    });
  }
  if (homeEls.jobMultiSelectModeBtn) {
    homeEls.jobMultiSelectModeBtn.addEventListener('click', () => {
      setJobMultiSelectMode(!state.jobMultiSelectMode);
    });
  }
  if (homeEls.selectAllJobsBtn) {
    homeEls.selectAllJobsBtn.addEventListener('click', selectAllVisibleJobs);
  }
  if (homeEls.clearJobSelectionBtn) {
    homeEls.clearJobSelectionBtn.addEventListener('click', () => {
      clearJobSelection({ render: true });
    });
  }
  if (homeEls.deleteSelectedJobsBtn) {
    homeEls.deleteSelectedJobsBtn.addEventListener('click', () => {
      deleteSelectedJobs().catch((error) => toast(error.message));
    });
  }
  if (homeEls.deleteSelectedBtn) {
    homeEls.deleteSelectedBtn.addEventListener('click', () => {
      deleteEntries(Array.from(state.selectedFilePaths)).catch((error) => toast(error.message));
    });
  }
  if (homeEls.rewriteSelectedBtn) {
    homeEls.rewriteSelectedBtn.addEventListener('click', () => {
      rewriteSelectedEntries().catch((error) => toast(error.message));
    });
  }
  if (homeEls.multiSelectModeBtn) {
    homeEls.multiSelectModeBtn.addEventListener('click', () => {
      setMultiSelectMode(!state.multiSelectMode);
    });
  }
  if (homeEls.selectAllFilesBtn) {
    homeEls.selectAllFilesBtn.addEventListener('click', selectAllVisibleFiles);
  }
  if (homeEls.clearFileSelectionBtn) {
    homeEls.clearFileSelectionBtn.addEventListener('click', () => {
      clearFileSelection();
      renderFiles(state.currentFiles);
    });
  }
  if (homeEls.refreshFilesBtn) {
    homeEls.refreshFilesBtn.addEventListener('click', () => {
      Promise.all([loadFiles(state.currentPath, { force: true }), loadRecentMarkdown()])
        .then(() => toast('文件列表已刷新'))
        .catch((error) => toast(error.message));
    });
  }
  if (homeEls.refreshRecentMdBtn) {
    homeEls.refreshRecentMdBtn.addEventListener('click', () => {
      loadRecentMarkdown()
        .then(() => toast('Markdown 列表已刷新'))
        .catch((error) => toast(error.message));
    });
  }
  if (homeEls.previewRewriteBtn) {
    homeEls.previewRewriteBtn.addEventListener('click', () => {
      if (state.previewRewriteOpen) {
        closePreviewRewritePopover({ restoreFocus: true });
        return;
      }
      openPreviewRewritePopover();
    });
  }
  if (homeEls.cancelPreviewRewriteBtn) {
    homeEls.cancelPreviewRewriteBtn.addEventListener('click', () => {
      closePreviewRewritePopover({ restoreFocus: true });
    });
  }
  if (homeEls.submitPreviewRewriteBtn) {
    homeEls.submitPreviewRewriteBtn.addEventListener('click', () => {
      submitPreviewRewrite().catch((error) => toast(error.message));
    });
  }
  if (homeEls.previewEditBtn) {
    homeEls.previewEditBtn.addEventListener('click', () => {
      toggleMarkdownPreviewEditor().catch((error) => toast(error.message));
    });
  }
  if (homeEls.filePreview) {
    homeEls.filePreview.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const image = event.target.closest('.markdown-preview-image');
      if (!image || !homeEls.filePreview.contains(image)) return;
      openMarkdownImageLightbox(image);
    });
    homeEls.filePreview.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (!(event.target instanceof Element)) return;
      const image = event.target.closest('.markdown-preview-image');
      if (!image || !homeEls.filePreview.contains(image)) return;
      event.preventDefault();
      openMarkdownImageLightbox(image);
    });
  }
  if (homeEls.markdownImageLightbox) {
    homeEls.markdownImageLightbox.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('[data-lightbox-close]')) {
        closeMarkdownImageLightbox();
      }
    });
  }
  if (homeEls.closeMarkdownImageLightboxBtn) {
    homeEls.closeMarkdownImageLightboxBtn.addEventListener('click', () => {
      closeMarkdownImageLightbox();
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (homeEls.markdownImageLightbox && !homeEls.markdownImageLightbox.hidden) {
        closeMarkdownImageLightbox();
        return;
      }
      if (state.renamePath) {
        cancelInlineRename();
        return;
      }
      if (state.previewRewriteOpen) {
        closePreviewRewritePopover({ restoreFocus: true });
        return;
      }
      if (state.previewFullscreen) {
        setPreviewFullscreen(false);
      }
    }
  });
  if (homeEls.copyPreviewTextBtn) {
    homeEls.copyPreviewTextBtn.addEventListener('click', () => {
      const text = state.previewEditorActive
        ? state.previewEditorDraft
        : (homeEls.filePreview?.innerText || state.currentPreviewContent);
      copyText(text)
        .then(() => toast('预览文本已复制'))
        .catch((error) => toast(error.message || '复制失败'));
    });
  }
  if (homeEls.previewFullscreenBtn) {
    homeEls.previewFullscreenBtn.addEventListener('click', () => {
      if (!state.currentPreviewPath) return;
      closePreviewRewritePopover({ restoreFocus: false });
      setPreviewFullscreen(!state.previewFullscreen);
      if (state.previewFullscreen) {
        homeEls.filePreview?.focus({ preventScroll: true });
      }
    });
  }
  if (homeEls.closePreviewBtn) {
    homeEls.closePreviewBtn.addEventListener('click', async () => {
      if (!await ensurePreviewEditorSavedBeforePreviewChange()) return;
      closePreviewRewritePopover({ restoreFocus: false });
      setPreviewState(defaultPreviewState());
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
  if (settingsEls.rewriteApiKeyToggleBtn) {
    settingsEls.rewriteApiKeyToggleBtn.addEventListener('click', () => {
      setRewriteApiKeyVisible(settingsEls.rewriteApiKeyInput?.type !== 'text');
    });
  }
  if (settingsEls.rewriteApiKeyInput) {
    settingsEls.rewriteApiKeyInput.addEventListener('input', () => {
      setRewriteApiKeyVisible(settingsEls.rewriteApiKeyInput.type === 'text');
    });
  }
  if (settingsEls.rewriteTopicSettingsInput) {
    settingsEls.rewriteTopicSettingsInput.addEventListener('input', updateRewriteRequirementSummary);
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
  await loadJobs();
  state.jobPoller = window.setInterval(() => {
    loadJobs().catch(() => {});
  }, 5000);
}

async function bootRewrite() {
  bindHomeEvents();
  await loadHomeConfig();
  setPreviewState(defaultPreviewState());
  await Promise.all([
    loadFiles(''),
    loadRecentMarkdown(),
  ]);
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
  bindSidebarEvents();
  bindThemeEvents();
  if (page === 'settings') {
    await bootSettings();
    return;
  }
  if (page === 'rewrite') {
    await bootRewrite();
    return;
  }
  await bootHome();
}

window.addEventListener('beforeunload', cleanup);

boot().catch((error) => toast(error.message));
