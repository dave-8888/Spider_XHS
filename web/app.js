const page = document.body.dataset.page || 'home';

const sharedEls = {
  toast: document.querySelector('#toast'),
};

const homeEls = {
  keywordsInput: document.querySelector('#keywordsInput'),
  outputDirInput: document.querySelector('#outputDirInput'),
  countInput: document.querySelector('#countInput'),
  likeTopInput: document.querySelector('#likeTopInput'),
  publishDaysInput: document.querySelector('#publishDaysInput'),
  latitudeInput: document.querySelector('#latitudeInput'),
  longitudeInput: document.querySelector('#longitudeInput'),
  extraFiltersInput: document.querySelector('#extraFiltersInput'),
  collectBtn: document.querySelector('#collectBtn'),
  jobList: document.querySelector('#jobList'),
  openCurrentFolderBtn: document.querySelector('#openCurrentFolderBtn'),
  openFileFolderBtn: document.querySelector('#openFileFolderBtn'),
  refreshFilesBtn: document.querySelector('#refreshFilesBtn'),
  fileList: document.querySelector('#fileList'),
  filePreview: document.querySelector('#filePreview'),
  filePreviewMeta: document.querySelector('#filePreviewMeta'),
  breadcrumb: document.querySelector('#breadcrumb'),
  dataRootText: document.querySelector('#dataRootText'),
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
};

const state = {
  config: null,
  choices: {},
  currentOutputRoot: 'datas/markdown_datas',
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
  settingsWeekdays: [1, 2, 3, 4, 5, 6, 7],
  jobLogScrollState: new Map(),
};

function toast(message) {
  if (!sharedEls.toast) return;
  sharedEls.toast.textContent = message;
  sharedEls.toast.classList.add('show');
  window.clearTimeout(sharedEls.toast.timer);
  sharedEls.toast.timer = window.setTimeout(() => sharedEls.toast.classList.remove('show'), 3200);
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

async function getConfigRaw() {
  const data = await api('/api/config');
  state.config = data.config;
  state.choices = data.config?.choices || {};
  return data.config;
}

function updateOutputRoot(config) {
  state.currentOutputRoot = config.paths?.output_root || config.paths?.markdown_root || 'datas/markdown_datas';
  if (homeEls.dataRootText) {
    homeEls.dataRootText.textContent = state.currentOutputRoot;
  }
}

function renderChoiceButtons(container, choiceMap, value, onSelect, { multi = false } = {}) {
  if (!container) return;
  const entries = Object.entries(choiceMap || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  container.innerHTML = entries.map(([key, label]) => {
    const numericKey = Number(key);
    const active = multi ? value.includes(numericKey) : Number(value) === numericKey;
    return `<button class="choice ${active ? 'active' : ''}" data-value="${numericKey}" type="button">${escapeHtml(label)}</button>`;
  }).join('');

  container.querySelectorAll('.choice').forEach((button) => {
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
  });
  renderChoiceButtons(homeEls.contentTypeChoices, state.choices.content_type, state.homeFilters.content_type, (selected) => {
    state.homeFilters.content_type = selected;
    renderHomeChoices();
  });
  renderChoiceButtons(homeEls.publishTimeChoices, state.choices.publish_time, state.homeFilters.publish_time, (selected) => {
    state.homeFilters.publish_time = selected;
    renderHomeChoices();
  });
  renderChoiceButtons(homeEls.noteRangeChoices, state.choices.note_range, state.homeFilters.note_range, (selected) => {
    state.homeFilters.note_range = selected;
    renderHomeChoices();
  });
  renderChoiceButtons(homeEls.posDistanceChoices, state.choices.pos_distance, state.homeFilters.pos_distance, (selected) => {
    state.homeFilters.pos_distance = selected;
    renderHomeChoices();
  });
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
  if (!homeEls.keywordsInput) return;
  const filters = config.filters || {};
  const collect = config.collect || {};

  state.homeFilters.sort_type = Number(filters.sort_type ?? 2);
  state.homeFilters.content_type = Number(filters.content_type ?? 2);
  state.homeFilters.publish_time = Number(filters.publish_time ?? 2);
  state.homeFilters.note_range = Number(filters.note_range ?? 0);
  state.homeFilters.pos_distance = Number(filters.pos_distance ?? 0);

  homeEls.keywordsInput.value = (config.keywords || ['男士穿搭']).join('\n');
  homeEls.outputDirInput.value = config.storage?.output_dir ?? '';
  homeEls.countInput.value = collect.count ?? 10;
  homeEls.likeTopInput.value = collect.like_top_n ?? 10;
  homeEls.publishDaysInput.value = filters.publish_days ?? 7;
  homeEls.latitudeInput.value = filters.geo?.latitude ?? '';
  homeEls.longitudeInput.value = filters.geo?.longitude ?? '';
  homeEls.extraFiltersInput.value = JSON.stringify(filters.extra || {}, null, 2);

  updateOutputRoot(config);
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

function readKeywords() {
  return (homeEls.keywordsInput?.value || '')
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readRunTimes() {
  return (settingsEls.runTimesInput?.value || '')
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readExtraFilters() {
  const extraText = homeEls.extraFiltersInput?.value.trim() || '';
  if (!extraText) return {};
  return JSON.parse(extraText);
}

function readHomeDraft() {
  return {
    keywords: readKeywords(),
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
      geo: {
        latitude: homeEls.latitudeInput?.value.trim() || '',
        longitude: homeEls.longitudeInput?.value.trim() || '',
      },
      extra: readExtraFilters(),
    },
    storage: {
      output_dir: homeEls.outputDirInput?.value.trim() || '',
    },
  };
}

function readSettingsDraft() {
  const runTimes = readRunTimes();
  return {
    collect: {
      request_multiplier: toNumber(settingsEls.requestMultiplierInput?.value, 3),
      search_delay_min_sec: toNumber(settingsEls.searchDelayMinInput?.value, 2),
      search_delay_max_sec: toNumber(settingsEls.searchDelayMaxInput?.value, 4),
      detail_delay_min_sec: toNumber(settingsEls.detailDelayMinInput?.value, 1),
      detail_delay_max_sec: toNumber(settingsEls.detailDelayMaxInput?.value, 3),
    },
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

async function startCollect() {
  if (!homeEls.collectBtn) return;
  const previousRoot = state.currentOutputRoot;
  homeEls.collectBtn.disabled = true;

  try {
    const savedConfig = await getConfigRaw();
    const mergedConfig = deepMerge(savedConfig, readHomeDraft());
    const data = await api('/api/collect', {
      method: 'POST',
      body: JSON.stringify({ config: mergedConfig }),
    });

    await loadHomeConfig();
    if (previousRoot !== state.currentOutputRoot) {
      state.currentPath = '';
      setPreviewState({
        meta: `当前目录：${dataPathText('')}`,
        content: `已切换到 ${dataPathText('')}\n\n继续选择文件可在这里预览内容。`,
      });
      await loadFiles('');
    }
    toast(`采集任务已启动：${data.job.id}`);
    await loadJobs();
  } finally {
    homeEls.collectBtn.disabled = false;
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

function stopLoginPolling() {
  if (state.loginPoller) {
    window.clearInterval(state.loginPoller);
    state.loginPoller = null;
  }
}

function applyBrowserLoginState(login) {
  const nickname = login.user?.nickname ? `，账号：${login.user.nickname}` : '';
  const message = `${login.message || '等待浏览器登录中...'}${nickname}`;
  const tone = login.status === 'saved'
    ? 'good'
    : (login.status === 'closed' ? 'bad' : 'muted');
  setLoginStatus(message, tone);
}

async function pollBrowserLogin() {
  const data = await api('/api/login/browser/status', {
    method: 'POST',
    body: JSON.stringify({}),
  });
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
    const data = await api('/api/login/browser/start', {
      method: 'POST',
      body: JSON.stringify({}),
    });
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
    const data = await api('/api/login/browser/status', {
      method: 'POST',
      body: JSON.stringify({}),
    });
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

  Array.from(state.jobLogScrollState.keys()).forEach((jobId) => {
    if (!visibleJobIds.has(jobId)) {
      state.jobLogScrollState.delete(jobId);
    }
  });
}

function renderJobs(jobs) {
  if (!homeEls.jobList) return;
  if (!jobs || jobs.length === 0) {
    state.jobLogScrollState.clear();
    homeEls.jobList.classList.add('muted');
    homeEls.jobList.textContent = '暂无任务';
    return;
  }

  saveJobLogScrollState();
  homeEls.jobList.classList.remove('muted');
  homeEls.jobList.innerHTML = jobs.slice(0, 8).map((job) => {
    const result = job.result || {};
    const logs = (job.logs || []).map((item) => `[${item.time}] ${item.message}`).join('\n');
    const countText = job.status === 'success'
      ? `保存 ${result.saved_count || 0} 篇，失败 ${result.failed_count || 0} 条`
      : (job.error || '运行中');
    return `
      <div class="job-card">
        <div class="job-head">
          <strong>${escapeHtml(job.id)}</strong>
          <span class="badge ${escapeHtml(job.status)}">${escapeHtml(job.status)}</span>
        </div>
        <div class="muted">${escapeHtml(job.source)} · ${escapeHtml(job.started_at || job.created_at)} · ${escapeHtml(countText)}</div>
        ${logs ? `<pre class="job-log" data-job-id="${escapeHtml(job.id)}">${escapeHtml(logs)}</pre>` : ''}
      </div>
    `;
  }).join('');
  bindJobLogAutoScroll();
}

async function loadJobs() {
  if (!homeEls.jobList) return;
  const data = await api('/api/jobs');
  renderJobs(data.jobs);
}

function sizeText(size) {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function dataPathText(path = '') {
  return path ? `${state.currentOutputRoot} / ${path}` : state.currentOutputRoot;
}

function setPreviewState({
  path = '',
  meta = '选择 Markdown / JSON / TXT 文件可预览。',
  content = '选择 Markdown / JSON / TXT 文件可预览。',
} = {}) {
  if (!homeEls.filePreviewMeta || !homeEls.filePreview) return;
  state.currentPreviewPath = path;
  homeEls.filePreviewMeta.textContent = meta;
  homeEls.filePreview.textContent = content;
  if (homeEls.openFileFolderBtn) {
    homeEls.openFileFolderBtn.disabled = !path;
  }
}

async function openFolder(path = '') {
  const data = await api('/api/files/open', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
  toast(`已打开文件夹：${dataPathText(data.folder?.path || '')}`);
}

function renderBreadcrumb(files) {
  if (!homeEls.breadcrumb) return;
  homeEls.breadcrumb.textContent = dataPathText(files.cwd || '');
}

function renderFiles(files) {
  if (!homeEls.fileList) return;
  renderBreadcrumb(files);

  const parentButton = files.cwd
    ? `<button class="file-item" data-kind="directory" data-path="${escapeHtml(files.parent || '')}" type="button"><span>../ 返回上级</span><span class="file-meta">目录</span></button>`
    : '';
  const rows = files.entries.map((entry) => `
    <button class="file-item" data-kind="${entry.type}" data-path="${escapeHtml(entry.path)}" data-previewable="${entry.previewable}" type="button">
      <span>${entry.type === 'directory' ? '[目录]' : '[文件]'} ${escapeHtml(entry.name)}</span>
      <span class="file-meta">${entry.type === 'directory' ? '目录' : sizeText(entry.size)} · ${escapeHtml(entry.modified)}</span>
    </button>
  `).join('');
  const html = parentButton + rows;
  homeEls.fileList.innerHTML = html || '<div class="empty-state">目录为空</div>';

  homeEls.fileList.querySelectorAll('.file-item').forEach((button) => {
    button.addEventListener('click', async () => {
      const path = button.dataset.path || '';
      if (button.dataset.kind === 'directory') {
        state.currentPath = path;
        setPreviewState({
          meta: `当前目录：${dataPathText(path)}`,
          content: `已进入 ${dataPathText(path)}\n\n继续选择文件可在这里预览内容。`,
        });
        await loadFiles(path);
        return;
      }

      if (button.dataset.previewable === 'true') {
        await previewFile(path);
        return;
      }

      setPreviewState({
        path,
        meta: `文件：${dataPathText(path)}`,
        content: `该文件不支持文本预览，可用浏览器打开：\n/download?path=${encodeURIComponent(path)}`,
      });
      window.open(`/download?path=${encodeURIComponent(path)}`, '_blank', 'noopener');
    });
  });
}

async function loadFiles(path = state.currentPath) {
  if (!homeEls.fileList) return;
  const data = await api(`/api/files?path=${encodeURIComponent(path || '')}`);
  state.currentPath = data.files.cwd || '';
  renderFiles(data.files);
}

async function previewFile(path) {
  const data = await api(`/api/file?path=${encodeURIComponent(path)}`);
  const downloadUrl = `/download?path=${encodeURIComponent(path)}`;
  setPreviewState({
    path,
    meta: `文件：${dataPathText(data.file.path)}`,
    content: `文件：${dataPathText(data.file.path)}\n打开：${downloadUrl}\n\n${data.file.content}${data.file.truncated ? '\n\n...内容过长，已截断预览' : ''}`,
  });
}

function bindHomeEvents() {
  if (homeEls.collectBtn) {
    homeEls.collectBtn.addEventListener('click', () => {
      startCollect().catch((error) => toast(error.message));
    });
  }
  if (homeEls.openCurrentFolderBtn) {
    homeEls.openCurrentFolderBtn.addEventListener('click', () => {
      openFolder(state.currentPath).catch((error) => toast(error.message));
    });
  }
  if (homeEls.openFileFolderBtn) {
    homeEls.openFileFolderBtn.addEventListener('click', () => {
      if (!state.currentPreviewPath) return;
      openFolder(state.currentPreviewPath).catch((error) => toast(error.message));
    });
  }
  if (homeEls.refreshFilesBtn) {
    homeEls.refreshFilesBtn.addEventListener('click', () => {
      loadFiles().catch((error) => toast(error.message));
    });
  }
}

function bindSettingsEvents() {
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
  if (settingsEls.cycleInput) {
    settingsEls.cycleInput.addEventListener('change', updateScheduleView);
  }
}

async function bootHome() {
  bindHomeEvents();
  await loadHomeConfig();
  setPreviewState({
    meta: `当前目录：${dataPathText('')}`,
    content: `当前预览目录：${dataPathText('')}\n\n选择 Markdown / JSON / TXT 文件可在这里预览内容。`,
  });
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
  if (page === 'settings') {
    await bootSettings();
    return;
  }
  await bootHome();
}

window.addEventListener('beforeunload', cleanup);

boot().catch((error) => toast(error.message));
