const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { setTimeout: sleep } = require('timers/promises');

const APP_NAME = 'Spider_XHS';
const LOGIN_URL = 'https://www.xiaohongshu.com/explore';
const LOGIN_PARTITION = 'persist:spider-xhs-login';
const LOGIN_POLL_INTERVAL_MS = 2500;
const BACKEND_READY_TIMEOUT_MS = 15000;
const BACKEND_LOG_LIMIT = 200;

app.setName(APP_NAME);

const state = {
  backendProcess: null,
  backendPort: 0,
  backendBaseUrl: '',
  backendLogs: [],
  mainWindow: null,
  loginWindow: null,
  loginPoller: null,
  loginState: {
    status: 'idle',
    message: '登录窗口尚未打开',
    user: {},
  },
  quitting: false,
};


function projectRoot() {
  return path.resolve(__dirname, '..');
}


function resourceRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'resources_bundle')
    : projectRoot();
}


function dataRoot() {
  return path.join(app.getPath('userData'), 'data');
}


function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}


function rememberBackendLog(kind, chunk) {
  const lines = String(chunk || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (!lines.length) {
    return;
  }

  const stamped = lines.map((line) => `[${kind}] ${line}`);
  state.backendLogs.push(...stamped);
  if (state.backendLogs.length > BACKEND_LOG_LIMIT) {
    state.backendLogs.splice(0, state.backendLogs.length - BACKEND_LOG_LIMIT);
  }
}


function recentBackendLogs() {
  return state.backendLogs.slice(-30).join('\n');
}


function resolveDevNodeBinary() {
  const explicit = String(process.env.SPIDER_XHS_NODE_BIN || '').trim();
  if (explicit) {
    return explicit;
  }

  const lookup = spawnSync('which', ['node'], { encoding: 'utf-8' });
  if (lookup.status === 0) {
    const resolved = String(lookup.stdout || '').trim();
    if (resolved) {
      return resolved;
    }
  }

  return 'node';
}


function resolveNodeRuntimePaths() {
  if (app.isPackaged) {
    return {
      nodeBin: path.join(process.resourcesPath, 'node-runtime', process.arch, 'bin', 'node'),
      nodePath: path.join(process.resourcesPath, 'js-runtime', 'node_modules'),
    };
  }

  return {
    nodeBin: resolveDevNodeBinary(),
    nodePath: path.join(projectRoot(), 'node_modules'),
  };
}


function resolveBackendCommand(port) {
  if (app.isPackaged) {
    const backendDir = path.join(process.resourcesPath, 'backend', process.arch, 'spider-xhs-backend');
    const executable = path.join(
      backendDir,
      process.platform === 'win32' ? 'spider-xhs-backend.exe' : 'spider-xhs-backend',
    );
    return {
      command: executable,
      args: [String(port)],
      cwd: resourceRoot(),
    };
  }

  return {
    command: String(process.env.SPIDER_XHS_DEV_PYTHON || 'python3').trim(),
    args: [path.join(projectRoot(), 'web_app.py'), String(port)],
    cwd: projectRoot(),
  };
}


function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}


async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `请求失败：${response.status}`);
  }
  return data;
}


async function waitForBackendReady(port) {
  const deadline = Date.now() + BACKEND_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (state.backendProcess && state.backendProcess.exitCode !== null) {
      throw new Error(`后端服务启动失败，进程已退出。\n${recentBackendLogs()}`);
    }

    try {
      const data = await fetchJson(`http://127.0.0.1:${port}/api/health`);
      if (data.success) {
        return data;
      }
    } catch (_error) {
      // Ignore transient startup failures and keep polling until timeout.
    }

    await sleep(250);
  }

  throw new Error(`等待后端服务超时。\n${recentBackendLogs()}`);
}


async function stopBackend() {
  if (!state.backendProcess) {
    return;
  }

  const backendProcess = state.backendProcess;
  state.backendProcess = null;

  if (backendProcess.exitCode !== null) {
    return;
  }

  backendProcess.kill('SIGTERM');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (backendProcess.exitCode !== null) {
      return;
    }
    await sleep(150);
  }

  backendProcess.kill('SIGKILL');
}


async function startBackend() {
  ensureDir(dataRoot());
  state.backendLogs = [];

  const port = await findFreePort();
  const { nodeBin, nodePath } = resolveNodeRuntimePaths();
  const { command, args, cwd } = resolveBackendCommand(port);

  const env = {
    ...process.env,
    SPIDER_XHS_DESKTOP: '1',
    SPIDER_XHS_PORT: String(port),
    SPIDER_XHS_DATA_ROOT: dataRoot(),
    SPIDER_XHS_RESOURCE_ROOT: resourceRoot(),
    SPIDER_XHS_NODE_BIN: nodeBin,
    SPIDER_XHS_NODE_PATH: nodePath,
  };

  const backendProcess = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (chunk) => rememberBackendLog('stdout', chunk));
  backendProcess.stderr.on('data', (chunk) => rememberBackendLog('stderr', chunk));
  backendProcess.on('exit', (code, signal) => {
    rememberBackendLog('exit', `code=${String(code)} signal=${String(signal)}`);
  });

  state.backendProcess = backendProcess;
  state.backendPort = port;
  state.backendBaseUrl = `http://127.0.0.1:${port}`;

  await waitForBackendReady(port);
}


function preloadPath() {
  return path.join(__dirname, 'preload.js');
}


function loadingPagePath() {
  return path.join(__dirname, 'loading.html');
}


function attachWindowPolicies(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (state.backendBaseUrl && url.startsWith(state.backendBaseUrl)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1180,
          height: 860,
          autoHideMenuBar: true,
          webPreferences: {
            preload: preloadPath(),
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      };
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!state.backendBaseUrl || url.startsWith(state.backendBaseUrl)) {
      return;
    }
    event.preventDefault();
    shell.openExternal(url);
  });
}


function createMainWindow() {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    return state.mainWindow;
  }

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1160,
    minHeight: 760,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    title: APP_NAME,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachWindowPolicies(mainWindow);
  mainWindow.loadFile(loadingPagePath());
  mainWindow.on('closed', () => {
    state.mainWindow = null;
  });

  state.mainWindow = mainWindow;
  return mainWindow;
}


async function renderFatalError(error) {
  const details = [
    'Spider_XHS 桌面版启动失败。',
    '',
    String(error && error.message ? error.message : error || '未知错误'),
  ].join('\n');

  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    const html = `
      <!doctype html>
      <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <title>Spider_XHS 启动失败</title>
        <style>
          body { margin: 0; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; background: #0f172a; color: #e2e8f0; }
          main { max-width: 920px; margin: 0 auto; }
          h1 { margin: 0 0 16px; font-size: 32px; }
          p { line-height: 1.7; color: #cbd5e1; }
          pre { margin-top: 20px; padding: 18px; overflow: auto; border-radius: 16px; background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(255, 255, 255, 0.12); white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <main>
          <h1>启动失败</h1>
          <p>桌面程序没有成功拉起本地服务，请查看下面的错误摘要。</p>
          <pre>${String(details).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]))}</pre>
        </main>
      </body>
      </html>
    `;
    await state.mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  }

  await dialog.showMessageBox({
    type: 'error',
    title: 'Spider_XHS 启动失败',
    message: '桌面版未能成功启动本地服务',
    detail: details,
  });
}


function setLoginState(patch) {
  state.loginState = {
    ...state.loginState,
    ...patch,
  };
  return state.loginState;
}


function stopLoginPolling() {
  if (state.loginPoller) {
    clearInterval(state.loginPoller);
    state.loginPoller = null;
  }
}


function buildCookieHeader(cookies) {
  return cookies
    .filter((cookie) => String(cookie.domain || '').includes('xiaohongshu.com'))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}


async function validateLoginCookie(cookieHeader) {
  const data = await fetchJson(`${state.backendBaseUrl}/api/login/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cookies: cookieHeader,
      save: true,
    }),
  });
  return data;
}


async function pollDesktopLoginOnce() {
  if (!state.loginWindow || state.loginWindow.isDestroyed()) {
    return state.loginState;
  }

  const loginSession = session.fromPartition(LOGIN_PARTITION);
  const cookies = await loginSession.cookies.get({});
  const cookieHeader = buildCookieHeader(cookies);

  if (!cookieHeader.includes('web_session=')) {
    return setLoginState({
      status: 'waiting',
      message: '等待登录完成，暂未检测到 web_session Cookie',
      user: {},
    });
  }

  try {
    const data = await validateLoginCookie(cookieHeader);
    const nextState = setLoginState({
      status: 'saved',
      message: data.message || '登录有效，Cookie 已保存',
      user: data.user || {},
    });
    stopLoginPolling();
    if (state.loginWindow && !state.loginWindow.isDestroyed()) {
      state.loginWindow.close();
    }
    return nextState;
  } catch (error) {
    return setLoginState({
      status: 'waiting',
      message: error.message || '等待登录完成...',
      user: {},
    });
  }
}


function startLoginPolling() {
  stopLoginPolling();
  state.loginPoller = setInterval(() => {
    pollDesktopLoginOnce().catch((error) => {
      setLoginState({
        status: 'waiting',
        message: error.message || '登录状态同步失败',
        user: {},
      });
    });
  }, LOGIN_POLL_INTERVAL_MS);
}


async function startDesktopLogin() {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) {
    createMainWindow();
  }

  if (state.loginWindow && !state.loginWindow.isDestroyed()) {
    state.loginWindow.focus();
    return state.loginState;
  }

  const loginWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    parent: state.mainWindow || undefined,
    modal: true,
    autoHideMenuBar: true,
    title: '登录小红书',
    webPreferences: {
      partition: LOGIN_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  state.loginWindow = loginWindow;
  setLoginState({
    status: 'waiting',
    message: '登录窗口已打开，请在窗口中完成小红书登录',
    user: {},
  });

  loginWindow.on('closed', () => {
    state.loginWindow = null;
    if (state.loginState.status !== 'saved') {
      setLoginState({
        status: 'closed',
        message: '登录窗口已关闭，请重新打开后继续登录',
        user: {},
      });
      stopLoginPolling();
    }
  });

  attachWindowPolicies(loginWindow);
  await loginWindow.loadURL(LOGIN_URL);
  startLoginPolling();
  await pollDesktopLoginOnce().catch(() => {});

  return state.loginState;
}


async function loadMainInterface() {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) {
    createMainWindow();
  }
  await state.mainWindow.loadURL(state.backendBaseUrl);
}


async function bootDesktopApp() {
  createMainWindow();
  try {
    await startBackend();
    await loadMainInterface();
  } catch (error) {
    await renderFatalError(error);
  }
}


ipcMain.handle('spider-desktop:start-login', async () => startDesktopLogin());
ipcMain.handle('spider-desktop:get-login-status', async () => state.loginState);


app.whenReady().then(bootDesktopApp);


app.on('before-quit', async () => {
  state.quitting = true;
  stopLoginPolling();
  await stopBackend();
});


app.on('window-all-closed', () => {
  if (!state.quitting) {
    app.quit();
  }
});


app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    bootDesktopApp().catch((error) => {
      renderFatalError(error).catch(() => {});
    });
  }
});

