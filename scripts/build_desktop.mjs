import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const targetArch = String(process.env.SPIDER_XHS_DESKTOP_ARCH || 'arm64').trim();
const desktopTarget = String(process.env.SPIDER_XHS_DESKTOP_TARGET || 'dmg').trim();
const supportedArchs = new Set(['arm64', 'x64', 'universal']);
const supportedTargets = new Set(['dmg', 'dir']);

if (!supportedArchs.has(targetArch)) {
  console.error(`Unsupported SPIDER_XHS_DESKTOP_ARCH: ${targetArch}`);
  process.exit(1);
}

if (!supportedTargets.has(desktopTarget)) {
  console.error(`Unsupported SPIDER_XHS_DESKTOP_TARGET: ${desktopTarget}`);
  process.exit(1);
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run('node', ['scripts/prepare_js_runtime.mjs']);
if (targetArch === 'universal') {
  run('node', ['scripts/prepare_node_runtime.mjs', 'arm64', 'x64']);
  run('python3', ['scripts/build_backend.py', 'arm64']);
  run('python3', ['scripts/build_backend.py', 'x64']);
} else {
  run('node', ['scripts/prepare_node_runtime.mjs', targetArch]);
  run('python3', ['scripts/build_backend.py', targetArch]);
}

const builderArgs = desktopTarget === 'dir'
  ? ['electron-builder', '--dir', `--${targetArch}`]
  : ['electron-builder', '--mac', desktopTarget, `--${targetArch}`];

run('npx', builderArgs, {
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
});
