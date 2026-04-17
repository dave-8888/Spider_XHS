import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(projectRoot, 'build', 'node-runtime');
const requestedArchs = process.argv.slice(2);
const archs = requestedArchs.length ? requestedArchs : ['arm64', 'x64'];
const version = String(process.env.SPIDER_XHS_NODE_RUNTIME_VERSION || process.version).trim();

fs.mkdirSync(buildRoot, { recursive: true });

for (const arch of archs) {
  const targetRoot = path.join(buildRoot, arch);
  const nodeBinary = path.join(targetRoot, 'bin', 'node');
  if (fs.existsSync(nodeBinary)) {
    continue;
  }

  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });

  const archiveName = `node-${version}-darwin-${arch}.tar.gz`;
  const archivePath = path.join(buildRoot, archiveName);
  const downloadUrl = `https://nodejs.org/dist/${version}/${archiveName}`;

  const download = spawnSync('curl', ['-L', downloadUrl, '-o', archivePath], {
    stdio: 'inherit',
  });
  if (download.status !== 0) {
    process.exit(download.status || 1);
  }

  const extract = spawnSync('tar', ['-xzf', archivePath, '--strip-components=1', '-C', targetRoot], {
    stdio: 'inherit',
  });
  if (extract.status !== 0) {
    process.exit(extract.status || 1);
  }
}
