// Release rehearsal: real published assets plus the candidate packed CLI.
// Usage: node scripts/verify-published-upgrade.mjs <assets-directory> <candidate.tgz> [--online]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { listFiles } from '../lib/files.mjs';

const [assetsArg, candidateArg, onlineArg] = process.argv.slice(2);
if (!assetsArg || !candidateArg || (onlineArg && onlineArg !== '--online')) throw new Error('usage: verify-published-upgrade.mjs <assets-directory> <candidate.tgz> [--online]');
const assets = resolve(assetsArg);
const candidate = resolve(candidateArg);
const root = await mkdtemp(join(tmpdir(), 'published-workflow-upgrade-'));
console.log(`Evidence workspace: ${root}`);
async function extract(archive, name) {
  const directory = join(root, name);
  await mkdir(directory);
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  return join(directory, 'package');
}
async function snapshot(project) {
  const contents = [];
  for (const file of await listFiles(join(project, '.github'))) contents.push([file, (await readFile(join(project, '.github', file))).toString('base64')]);
  return contents;
}
const offlineBin = join(root, 'offline-bin');
await mkdir(offlineBin);
await writeFile(join(offlineBin, 'npm'), '#!/bin/sh\necho "offline upgrade must not invoke npm" >&2\nexit 91\n');
await chmod(join(offlineBin, 'npm'), 0o755);
function run(cli, project, args, offline = false) {
  const result = spawnSync(process.execPath, [join(cli, 'bin/graph-engineering.mjs'), ...args, '--project', project], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: offline ? { ...process.env, PATH: `${offlineBin}:${process.env.PATH}`, HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', ALL_PROXY: 'http://127.0.0.1:1' } : process.env });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
const oldArchive = join(assets, 'tutar-graph-engineering-0.3.1.tgz');
const targetArchive = join(assets, 'tutar-graph-engineering-0.3.2.tgz');
const old = await extract(oldArchive, 'old');
const target = await extract(targetArchive, 'target');
const cli = await extract(candidate, 'candidate');
for (const [archive, pkg] of [[oldArchive, old], [targetArchive, target], [candidate, cli]]) {
  const identity = JSON.parse(await readFile(join(pkg, 'package.json')));
  const metadata = JSON.parse(await readFile(join(pkg, 'release-metadata.json')));
  console.log(JSON.stringify({ archive, name: identity.name, version: identity.version, sourceCommit: metadata.sourceCommit, integrity: `sha512-${createHash('sha512').update(await readFile(archive)).digest('base64')}` }));
}
const modes = onlineArg ? ['offline', 'online'] : ['offline'];
for (const mode of modes) {
  const project = join(root, mode);
  await mkdir(project);
  execFileSync('git', ['init', '-q'], { cwd: project });
  run(old, project, ['init']);
  for (const task of ['coding-task', 'development-ticket']) {
    const file = join(project, `.github/workflows/github-${task}.yml`);
    let text = await readFile(file, 'utf8');
    assert.match(text, /runs-on: \[self-hosted, Linux, X64\]/);
    text = text.replace('runs-on: [self-hosted, Linux, X64]', 'runs-on: [self-hosted, Linux, X64, project]');
    text = text.replace('types: [labeled]', 'types: [labeled, reopened]');
    text = text.replace('prompt: >-', 'prompt: >-\n            Preserve project-specific business requirements.');
    await writeFile(file, text);
  }
  await writeFile(join(project, '.github/project-note'), 'unrelated project content\n');
  const args = ['upgrade', '--to', '0.3.2'];
  if (mode === 'offline') args.push('--from-package', oldArchive, '--to-package', targetArchive);
  const before = await snapshot(project);
  const preview = run(cli, project, args, mode === 'offline');
  assert.match(preview, /@@/);
  assert.deepEqual(await snapshot(project), before);
  await writeFile(join(root, `${mode}-preview.txt`), preview);
  const applied = run(cli, project, [...args, '--apply'], mode === 'offline');
  await writeFile(join(root, `${mode}-apply.txt`), applied);
  const targetFiles = await listFiles(join(target, 'templates/workflow/.github'));
  const oldFiles = await listFiles(join(old, 'templates/workflow/.github'));
  assert.deepEqual(await listFiles(join(project, '.github')), [...targetFiles, 'graph-engineering/installation.json', 'project-note'].sort());
  for (const file of targetFiles) {
    const installed = await readFile(join(project, '.github', file));
    if (file.startsWith('workflows/')) {
      const text = installed.toString();
      assert.match(text, /runs-on: \[self-hosted, Linux, X64, project\]/);
      assert.match(text, /types: \[labeled, reopened\]/);
      if (file.includes('development-ticket')) assert.match(text, /Preserve project-specific business requirements/);
    } else assert.deepEqual(installed, await readFile(join(target, 'templates/workflow/.github', file)), file);
  }
  const record = JSON.parse(await readFile(join(project, '.github/graph-engineering/installation.json')));
  const targetMetadata = JSON.parse(await readFile(join(target, 'release-metadata.json')));
  assert.equal(record.productVersion, '0.3.2');
  assert.equal(record.sourceCommit, targetMetadata.sourceCommit);
  assert.deepEqual(record.files, targetFiles.map(file => `.github/${file}`));
  assert.ok(targetFiles.includes('actions/development-codex/dist/main.js'));
  assert.ok(targetFiles.includes('actions/codex-goal/lib/explicit-skills.mjs'));
  const installedSnapshot = await snapshot(project);
  const report = JSON.parse(run(target, project, ['check', '--json']));
  assert.equal(report.results.find(r => r.check === 'workflow-files').status, 'UNVERIFIED');
  assert.equal(report.results.find(r => r.check === 'installation-manifest').status, 'PASS');
  assert.deepEqual(await snapshot(project), installedSnapshot);
  await writeFile(join(root, `${mode}-check.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mode, result: 'PASS', project, installedFiles: targetFiles.length, added: targetFiles.filter(file => !oldFiles.includes(file)), record: { version: record.productVersion, sourceCommit: record.sourceCommit }, retained: ['runner', 'triggers', 'prompt', 'unrelated file'], check: 'UNVERIFIED project edits; PASS installation manifest' }));
}
console.log('PASS: candidate packed CLI upgraded published 0.3.1 -> specified published 0.3.2. Static filesystem acceptance only; runner authentication/task execution not tested.');
