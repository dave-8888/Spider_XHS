import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const targetArch = String(process.env.SPIDER_XHS_DESKTOP_ARCH || 'universal').trim();

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

run('npx', ['electron-builder', '--dir', `--${targetArch}`], {
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
});
