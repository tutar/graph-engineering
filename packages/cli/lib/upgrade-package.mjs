import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { workflowFiles } from './package-assets.mjs';

const product = '@tutar/graph-engineering';

export function versionParts(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('upgrade requires an exact released version (major.minor.patch)');
  }
  return version.split('.').map(BigInt);
}

export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

// Package scripts are never executed. Offline archives are supplied by the operator;
// their SHA-512 is reported so the operator can compare it with published integrity.
export async function loadUpgradePackage({ version, archive, workspace }) {
  versionParts(version);
  await mkdir(workspace, { recursive: true });
  if (!archive) {
    let result;
    try {
      result = JSON.parse(execFileSync('npm', ['pack', `${product}@${version}`, '--ignore-scripts', '--json', '--pack-destination', workspace, '--cache', join(workspace, 'npm-cache')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))[0];
    } catch (error) {
      throw new Error(`cannot obtain published ${product}@${version}; use --from-package/--to-package for offline archives: ${error.message}`);
    }
    if (result?.name !== product || result.version !== version || !/^[\w.-]+\.tgz$/.test(result.filename)) throw new Error('npm returned an unexpected package identity');
    archive = join(workspace, result.filename);
    const actual = `sha512-${createHash('sha512').update(await readFile(archive)).digest('base64')}`;
    if (result.integrity !== actual) throw new Error('npm archive integrity mismatch');
  }
  archive = resolve(archive);
  const integrity = `sha512-${createHash('sha512').update(await readFile(archive)).digest('base64')}`;
  // Inspect before extraction: links, devices, traversal and duplicate members cannot
  // redirect template reads outside the temporary package directory.
  const names = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim().split('\n');
  const types = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim().split('\n');
  if (new Set(names).size !== names.length || names.some(path => !/^package\//.test(path) || /[\\\r\x00-\x1f]/.test(path) || path.split('/').some(part => part === '..' || part === '.')) || types.some(line => !/^[-d]/.test(line))) {
    throw new Error('unsafe package archive paths or entry types');
  }
  const extracted = join(workspace, 'extracted');
  await mkdir(extracted);
  execFileSync('tar', ['-xzf', archive, '--no-same-owner', '-C', extracted]);
  const root = join(extracted, 'package');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const metadata = JSON.parse(await readFile(join(root, 'release-metadata.json'), 'utf8'));
  if (pkg.name !== product || pkg.version !== version || metadata.productVersion !== version || !/^[a-f0-9]{40}$/.test(metadata.sourceCommit)) {
    throw new Error(`package identity, version or source commit cannot be verified for ${version}`);
  }
  const template = join(root, 'templates/workflow');
  const files = await workflowFiles(template);
  if (!files.length || files.includes('.github/graph-engineering/installation.json')) throw new Error('invalid package template file list');
  const contents = new Map();
  for (const file of files) contents.set(file, await readFile(join(template, file)));
  return { version, sourceCommit: metadata.sourceCommit, files, contents, integrity };
}
