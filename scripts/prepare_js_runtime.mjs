import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(projectRoot, 'build', 'js-runtime');
const packageJsonPath = path.join(projectRoot, 'package.json');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const runtimePackageJson = {
  name: 'spider-xhs-js-runtime',
  private: true,
  dependencies: packageJson.dependencies || {},
};

fs.mkdirSync(buildRoot, { recursive: true });
fs.writeFileSync(
  path.join(buildRoot, 'package.json'),
  `${JSON.stringify(runtimePackageJson, null, 2)}\n`,
  'utf8',
);

const install = spawnSync('npm', ['install', '--omit=dev', '--no-package-lock'], {
  cwd: buildRoot,
  stdio: 'inherit',
});

if (install.status !== 0) {
  process.exit(install.status || 1);
}
