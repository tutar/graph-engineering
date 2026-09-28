import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { MANIFEST_PATH, PRODUCT_VERSION } from './constants.mjs';
import { assertGitRoot } from './files.mjs';
import { snapshotFile, sameContent as equal, verifySnapshots, writeUpgrade } from './upgrade-files.mjs';
import { compareVersions, loadUpgradePackage } from './upgrade-package.mjs';

export async function planUpgrade({ projectRoot = process.cwd(), to = PRODUCT_VERSION, fromPackage, toPackage } = {}) {
  projectRoot = resolve(projectRoot);
  assertGitRoot(projectRoot);
  const manifestSnapshot = await snapshotFile(projectRoot, MANIFEST_PATH);
  const manifestContent = manifestSnapshot.content;
  if (manifestContent === null) throw new Error('missing installation record; cannot guess upgrade baseline');
  const manifest = JSON.parse(manifestContent);
  if (manifest.schemaVersion !== 3 || manifest.product !== '@tutar/graph-engineering' || manifest.delivery !== 'workflow' || compareVersions(manifest.productVersion, '0.3.1') < 0) {
    throw new Error('upgrade requires a current schema installation from 0.3.1 or newer; cannot guess installation source');
  }
  if (compareVersions(to, manifest.productVersion) < 0) throw new Error('downgrades are not supported');
  const workspace = await mkdtemp(join(tmpdir(), 'graph-engineering-upgrade-'));
  try {
    const baseline = await loadUpgradePackage({ version: manifest.productVersion, archive: fromPackage, workspace: join(workspace, 'baseline') });
    if (manifest.sourceCommit !== baseline.sourceCommit || JSON.stringify(manifest.files) !== JSON.stringify(baseline.files) || JSON.stringify(manifest.tasks) !== JSON.stringify(['coding', 'development'])) throw new Error('installation source commit or file list cannot be verified against the baseline package');
    const target = await loadUpgradePackage({ version: to, archive: toPackage, workspace: join(workspace, 'target') });
    if (to === baseline.version && (target.sourceCommit !== baseline.sourceCommit || JSON.stringify(target.files) !== JSON.stringify(baseline.files) || target.files.some(path => !equal(target.contents.get(path), baseline.contents.get(path))))) throw new Error('same-version package sources disagree; cannot verify target');
    const nextManifest = { schemaVersion: 3, product: '@tutar/graph-engineering', productVersion: to, sourceCommit: target.sourceCommit, delivery: 'workflow', files: target.files, tasks: ['coding', 'development'] };
    const changes = [];
    const snapshots = new Map([[MANIFEST_PATH, manifestSnapshot]]);
    for (const path of [...new Set([...baseline.files, ...target.files])].sort()) {
      const snapshot = await snapshotFile(projectRoot, path);
      snapshots.set(path, snapshot);
      const before = snapshot.content;
      const merged = await mergeContents(workspace, baseline.contents.get(path) ?? null, before, target.contents.get(path) ?? null);
      const { after, conflict } = merged;
      changes.push({ path, before, after, conflict, action: equal(before, after) ? 'keep' : after === null ? 'delete' : before === null ? 'add' : 'modify' });
    }
    const summary = [`Upgrade ${manifest.productVersion} -> ${to}`, `Baseline ${baseline.sourceCommit} ${baseline.integrity}`, `Target ${target.sourceCommit} ${target.integrity}`];
    for (const change of changes) {
      summary.push(`${change.conflict ? 'CONFLICT' : change.action}: ${change.path}`);
      if (change.action !== 'keep') summary.push(await contentDiff(workspace, change.path, change.before, change.after));
    }
    if (to !== manifest.productVersion) {
      summary.push(`modify: ${MANIFEST_PATH}`);
      summary.push(await contentDiff(workspace, MANIFEST_PATH, manifestContent, Buffer.from(`${JSON.stringify(nextManifest, null, 2)}\n`)));
    }
    return { projectRoot, manifestPath: MANIFEST_PATH, snapshots, nextManifest, changes, summary, conflicts: changes.filter(change => change.conflict).map(change => change.path), noUpgrade: to === manifest.productVersion };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function contentDiff(workspace, path, before, after) {
  const a = join(workspace, 'before');
  const b = join(workspace, 'after');
  await writeFile(a, before ?? Buffer.alloc(0));
  await writeFile(b, after ?? Buffer.alloc(0));
  try { return execFileSync('git', ['diff', '--no-index', '--no-ext-diff', '--no-prefix', '--', a, b], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); }
  catch (error) { if (error.status === 1) return error.stdout.replaceAll(a, `a/${path}`).replaceAll(b, `b/${path}`).trimEnd(); throw error; }
}

export async function applyUpgrade(plan, fileSystem) {
  if (plan.conflicts.length) throw new Error('upgrade conflicts; resolve and generate a new plan');
  await verifySnapshots(plan);
  if (!plan.noUpgrade) await writeUpgrade(plan, fileSystem);
}

export async function upgrade(options) {
  const plan = await planUpgrade(options);
  if (plan.conflicts.length) plan.summary.push('Conflicts found; nothing applied. Resolve project files and rerun.');
  else if (plan.noUpgrade) plan.summary.push('No upgrade needed.');
  else if (options.apply) { await applyUpgrade(plan); plan.summary.push('Upgrade applied.'); }
  else plan.summary.push('Preview only; rerun with --apply.');
  return plan;
}

function reliableText(content) {
  return content !== null && !content.includes(0) && Buffer.from(content.toString('utf8')).equals(content);
}
async function mergeContents(workspace, baseline, current, target) {
  if (equal(current, target) || equal(baseline, target)) return { after: current };
  if (equal(current, baseline)) return { after: target };
  if (![baseline, current, target].every(reliableText)) return { after: target, conflict: true };
  const paths = ['merge-current', 'merge-baseline', 'merge-target'].map(name => join(workspace, name));
  for (const [index, content] of [current, baseline, target].entries()) await writeFile(paths[index], content);
  const result = spawnSync('git', ['merge-file', '-p', '--', ...paths], { maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status === 0) return { after: result.stdout };
  if (result.status > 0 && result.status < 128) return { after: target, conflict: true };
  throw new Error(`cannot merge template text: ${result.stderr}`);
}
