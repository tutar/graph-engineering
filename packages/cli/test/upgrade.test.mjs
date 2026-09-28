import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const cli = resolve('packages/cli/bin/graph-engineering.mjs');
const manifestPath = '.github/graph-engineering/installation.json';
const workflow = '.github/workflows/task.yml';
const oldCommit = '1'.repeat(40);
const newCommit = '2'.repeat(40);

async function put(root, path, content) {
  await mkdir(resolve(root, path, '..'), { recursive: true });
  await writeFile(join(root, path), content);
}
async function fixture(t, oldFiles = { [workflow]: 'runner: old\n\nprompt: original\n' }, newFiles = { [workflow]: 'runner: old\n\nprompt: upstream\n' }) {
  const root = await mkdtemp(join(tmpdir(), 'workflow-upgrade-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = join(root, 'project');
  await mkdir(projectRoot);
  execFileSync('git', ['init', '-q'], { cwd: projectRoot });
  const packs = [];
  for (const [index, files] of [oldFiles, newFiles].entries()) {
    const stage = join(root, `stage-${index}`);
    const pkg = join(stage, 'package');
    await put(pkg, 'package.json', JSON.stringify({ name: '@tutar/graph-engineering', version: `0.3.${index + 1}` }));
    await put(pkg, 'release-metadata.json', JSON.stringify({ productVersion: `0.3.${index + 1}`, sourceCommit: index ? newCommit : oldCommit }));
    for (const [path, content] of Object.entries(files)) await put(pkg, `templates/workflow/${path}`, content);
    const archive = join(root, `${index}.tgz`);
    execFileSync('tar', ['-czf', archive, '-C', stage, 'package']);
    packs.push(archive);
  }
  for (const [path, content] of Object.entries(oldFiles)) await put(projectRoot, path, content);
  await put(projectRoot, manifestPath, JSON.stringify({ schemaVersion: 3, product: '@tutar/graph-engineering', productVersion: '0.3.1', sourceCommit: oldCommit, delivery: 'workflow', files: Object.keys(oldFiles).sort(), tasks: ['coding', 'development'] }));
  const options = { projectRoot, to: '0.3.2', fromPackage: packs[0], toPackage: packs[1] };
  const run = (...args) => spawnSync(process.execPath, [cli, 'upgrade', '--project', projectRoot, '--from-package', packs[0], '--to-package', packs[1], ...args], { encoding: 'utf8' });
  return { root, projectRoot, packs, options, run };
}

test('CLI previews content diff without writing, defaults to CLI version, and applies only explicitly', async (t) => {
  const { projectRoot, run } = await fixture(t);
  const before = await readFile(join(projectRoot, manifestPath));
  const preview = run();
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /0\.3\.1 -> 0\.3\.2/);
  assert.match(preview.stdout, /@@/);
  assert.equal(await readFile(join(projectRoot, workflow), 'utf8'), 'runner: old\n\nprompt: original\n');
  assert.deepEqual(await readFile(join(projectRoot, manifestPath)), before);
  const applied = run('--to', '0.3.2', '--apply');
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(await readFile(join(projectRoot, workflow), 'utf8'), 'runner: old\n\nprompt: upstream\n');
  assert.equal(JSON.parse(await readFile(join(projectRoot, manifestPath))).sourceCommit, newCommit);
});

export { fixture, put, manifestPath, workflow, newCommit };

test('upgrade preserves runner, trigger, prompt edits and project deletions while merging upstream changes', async (t) => {
  const original = 'runner: old\n\ntrigger: issues\n\nprompt: original\n\nversion: old\n';
  const upstream = original.replace('version: old', 'version: new');
  const { projectRoot, run } = await fixture(t, { [workflow]: original, '.github/unchanged': 'unchanged\n', '.github/removed': 'remove\n' }, { [workflow]: upstream, '.github/unchanged': 'unchanged\n', '.github/added': 'added\n' });
  const customized = original.replace('runner: old', 'runner: project').replace('trigger: issues', 'trigger: dispatch').replace('prompt: original', 'prompt: project');
  await put(projectRoot, workflow, customized);
  await rm(join(projectRoot, '.github/unchanged'));
  await put(projectRoot, '.github/project-note', 'unrelated');
  const result = run('--apply');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(projectRoot, workflow), 'utf8'), customized.replace('version: old', 'version: new'));
  await assert.rejects(readFile(join(projectRoot, '.github/unchanged')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(projectRoot, '.github/removed')), { code: 'ENOENT' });
  assert.equal(await readFile(join(projectRoot, '.github/added'), 'utf8'), 'added\n');
  assert.equal(await readFile(join(projectRoot, '.github/project-note'), 'utf8'), 'unrelated');
});

for (const [name, baseline, current, target] of [
  ['overlapping text edits', 'same\n', 'project\n', 'upstream\n'],
  ['upstream deletes project edit', 'same\n', 'project\n', null],
  ['project deletes upstream edit', 'same\n', null, 'upstream\n'],
  ['upstream addition collides with project file', null, 'project\n', 'upstream\n'],
  ['binary edits', Buffer.from([0, 1]), Buffer.from([0, 2]), Buffer.from([0, 3])],
  ['non-UTF8 edits', Buffer.from([255, 1]), Buffer.from([255, 2]), Buffer.from([255, 3])],
]) {
  test(`conflict: ${name} stops the entire apply without writing conflict markers`, async (t) => {
    const oldFiles = { '.github/other': 'old' };
    const newFiles = { '.github/other': 'new' };
    if (baseline !== null) oldFiles[workflow] = baseline;
    if (target !== null) newFiles[workflow] = target;
    const { projectRoot, run } = await fixture(t, oldFiles, newFiles);
    if (current === null) await rm(join(projectRoot, workflow));
    else await put(projectRoot, workflow, current);
    const manifest = await readFile(join(projectRoot, manifestPath));
    const result = run('--apply');
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /CONFLICT/);
    assert.match(result.stdout, /@@|Binary files/);
    assert.equal(await readFile(join(projectRoot, '.github/other'), 'utf8'), 'old');
    assert.deepEqual(await readFile(join(projectRoot, manifestPath)), manifest);
    if (current === null) await assert.rejects(readFile(join(projectRoot, workflow)), { code: 'ENOENT' });
    else assert.deepEqual(await readFile(join(projectRoot, workflow)), Buffer.from(current));
  });
}

test('apply rejects project edits made after preview, including kept files and installation record', async (t) => {
  const { planUpgrade, applyUpgrade } = await import('../lib/upgrade.mjs');
  const { projectRoot, options } = await fixture(t, { [workflow]: 'old', '.github/keep': 'same' }, { [workflow]: 'new', '.github/keep': 'same' });
  for (const path of [workflow, '.github/keep', manifestPath]) {
    const original = await readFile(join(projectRoot, path));
    const plan = await planUpgrade(options);
    await put(projectRoot, path, 'changed after preview');
    await assert.rejects(applyUpgrade(plan), /changed.*plan|plan.*changed/);
    assert.equal(await readFile(join(projectRoot, path), 'utf8'), 'changed after preview');
    if (path !== workflow) assert.equal(await readFile(join(projectRoot, workflow), 'utf8'), 'old');
    await put(projectRoot, path, original);
  }
});

for (const stage of ['add', 'modify', 'delete', 'manifest']) {
  test(`catchable ${stage} write failure restores original contents, existence, permissions and record`, async (t) => {
    const { planUpgrade, applyUpgrade } = await import('../lib/upgrade.mjs');
    const { chmod, stat, readdir } = await import('node:fs/promises');
    const { projectRoot, options } = await fixture(t,
      { '.github/b-modified': 'old', '.github/c-deleted': 'delete' },
      { '.github/a-added/new': 'add', '.github/b-modified': 'new' });
    await chmod(join(projectRoot, '.github/b-modified'), 0o755);
    const originalRecord = await readFile(join(projectRoot, manifestPath));
    const plan = await planUpgrade(options);
    const faultPath = { add: '.github/a-added/new', modify: '.github/b-modified', delete: '.github/c-deleted', manifest: manifestPath }[stage];
    await assert.rejects(applyUpgrade(plan, {
      async writeFile(path, content) {
        await writeFile(path, content); // Fail after a partial/complete system write.
        if (path === join(projectRoot, faultPath)) throw new Error('injected write failure');
      },
      async rm(path) {
        await rm(path);
        if (path === join(projectRoot, faultPath)) throw new Error('injected delete failure');
      },
    }), /original files and installation record restored/);
    assert.equal(await readFile(join(projectRoot, '.github/b-modified'), 'utf8'), 'old');
    assert.equal(await readFile(join(projectRoot, '.github/c-deleted'), 'utf8'), 'delete');
    await assert.rejects(readFile(join(projectRoot, '.github/a-added/new')), { code: 'ENOENT' });
    assert.equal((await stat(join(projectRoot, '.github/b-modified'))).mode & 0o777, 0o755);
    assert.deepEqual(await readFile(join(projectRoot, manifestPath)), originalRecord);
    assert.deepEqual((await readdir(join(projectRoot, '.github'))).sort(), ['b-modified', 'c-deleted', 'graph-engineering']);
  });
}

test('same version and already-target contents need no rewriting; baseline remains the original template', async (t) => {
  const { planUpgrade, applyUpgrade } = await import('../lib/upgrade.mjs');
  const { projectRoot, options, packs, run } = await fixture(t);
  const before = await readFile(join(projectRoot, manifestPath));
  const same = run('--to', '0.3.1', '--to-package', packs[0], '--apply');
  assert.equal(same.status, 0, same.stderr);
  assert.match(same.stdout, /No upgrade needed/);
  assert.deepEqual(await readFile(join(projectRoot, manifestPath)), before);
  await put(projectRoot, workflow, 'runner: old\n\nprompt: upstream\n');
  const plan = await planUpgrade(options);
  assert.equal(plan.changes.find(c => c.path === workflow).action, 'keep');
  await applyUpgrade(plan);
  const next = JSON.parse(await readFile(join(projectRoot, manifestPath)));
  assert.equal(next.sourceCommit, newCommit);
  assert.deepEqual(next.files, [workflow]);
});

for (const [name, transform, error] of [
  ['old schema', m => ({ ...m, schemaVersion: 2 }), /current schema/],
  ['pre-0.3.1', m => ({ ...m, productVersion: '0.3.0' }), /0\.3\.1/],
  ['unknown product', m => ({ ...m, product: 'other' }), /current schema/],
  ['wrong commit', m => ({ ...m, sourceCommit: 'f'.repeat(40) }), /source commit or file list/],
  ['missing file list', m => ({ ...m, files: [] }), /source commit or file list/],
  ['missing version', m => ({ ...m, productVersion: undefined }), /exact released version/],
]) {
  test(`unverifiable installation (${name}) stops before applying`, async (t) => {
    const { projectRoot, run } = await fixture(t);
    const record = transform(JSON.parse(await readFile(join(projectRoot, manifestPath))));
    await put(projectRoot, manifestPath, JSON.stringify(record));
    const before = await readFile(join(projectRoot, manifestPath));
    const result = run('--apply');
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
    assert.deepEqual(await readFile(join(projectRoot, manifestPath)), before);
    assert.equal(await readFile(join(projectRoot, workflow), 'utf8'), 'runner: old\n\nprompt: original\n');
  });
}

test('missing installation, downgrade, rolling targets and mismatched offline target all stop', async (t) => {
  const { projectRoot, run, packs } = await fixture(t);
  for (const [args, error] of [
    [['--to', '0.3.0'], /downgrades/],
    [['--to', 'latest'], /exact released version/],
    [['--to', '^0.3.2'], /exact released version/],
    [['--to-package', packs[0]], /identity, version or source commit/],
  ]) {
    const result = run('--apply', ...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
  }
  await rm(join(projectRoot, manifestPath));
  const result = run('--apply');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing installation record/);
});

test('project symlinks and unsafe package archives are refused without writing outside the project', async (t) => {
  const { symlink } = await import('node:fs/promises');
  const { root, projectRoot, packs, run } = await fixture(t);
  const outside = join(root, 'outside');
  await writeFile(outside, 'outside');
  await rm(join(projectRoot, workflow));
  await symlink(outside, join(projectRoot, workflow));
  const result = run('--apply');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsafe project file/);
  assert.equal(await readFile(outside, 'utf8'), 'outside');
  const pkg = join(root, 'stage-1/package');
  await symlink(outside, join(pkg, 'unsafe-link'));
  execFileSync('tar', ['-czf', packs[1], '-C', join(root, 'stage-1'), 'package']);
  const bad = run('--apply');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unsafe package archive/);
});

test('consecutive upgrades use the recorded original template, preserving earlier customizations', async (t) => {
  const { planUpgrade, applyUpgrade } = await import('../lib/upgrade.mjs');
  const base = 'runner: old\n\nprompt: old\n\nversion: one\n';
  const v2 = base.replace('version: one', 'version: two');
  const { root, projectRoot, packs, options } = await fixture(t, { [workflow]: base }, { [workflow]: v2 });
  await put(projectRoot, workflow, base.replace('runner: old', 'runner: project'));
  await applyUpgrade(await planUpgrade(options));
  const stage = join(root, 'stage-2');
  const pkg = join(stage, 'package');
  await put(pkg, 'package.json', JSON.stringify({ name: '@tutar/graph-engineering', version: '0.3.3' }));
  await put(pkg, 'release-metadata.json', JSON.stringify({ productVersion: '0.3.3', sourceCommit: '3'.repeat(40) }));
  await put(pkg, `templates/workflow/${workflow}`, v2.replace('prompt: old', 'prompt: new'));
  const third = join(root, 'third.tgz');
  execFileSync('tar', ['-czf', third, '-C', stage, 'package']);
  const nextOptions = { projectRoot, to: '0.3.3', fromPackage: packs[1], toPackage: third };
  await applyUpgrade(await planUpgrade(nextOptions));
  assert.equal(await readFile(join(projectRoot, workflow), 'utf8'), 'runner: project\n\nprompt: new\n\nversion: two\n');
  // A later upstream edit to the customized runner must conflict against the
  // original v0.3.3 baseline rather than overwrite a falsely recorded baseline.
  await put(pkg, 'package.json', JSON.stringify({ name: '@tutar/graph-engineering', version: '0.3.4' }));
  await put(pkg, 'release-metadata.json', JSON.stringify({ productVersion: '0.3.4', sourceCommit: '4'.repeat(40) }));
  await put(pkg, `templates/workflow/${workflow}`, 'runner: upstream\n\nprompt: new\n\nversion: two\n');
  const fourth = join(root, 'fourth.tgz');
  execFileSync('tar', ['-czf', fourth, '-C', stage, 'package']);
  const conflict = await planUpgrade({ projectRoot, to: '0.3.4', fromPackage: third, toPackage: fourth });
  assert.deepEqual(conflict.conflicts, [workflow]);
});

test('resolved conflicts require a fresh plan and already-target files are not rewritten', async (t) => {
  const { planUpgrade, applyUpgrade } = await import('../lib/upgrade.mjs');
  const { projectRoot, options } = await fixture(t, { [workflow]: 'old\n' }, { [workflow]: 'target\n' });
  await put(projectRoot, workflow, 'project\n');
  const conflicting = await planUpgrade(options);
  await assert.rejects(applyUpgrade(conflicting), /upgrade conflicts/);
  await put(projectRoot, workflow, 'target\n');
  const resolved = await planUpgrade(options);
  assert.deepEqual(resolved.conflicts, []);
  await applyUpgrade(resolved, {
    async writeFile(path, content) {
      assert.equal(path, join(projectRoot, manifestPath), 'already-target workflow must not be rewritten');
      await writeFile(path, content);
    },
  });
  assert.equal(JSON.parse(await readFile(join(projectRoot, manifestPath))).productVersion, '0.3.2');
});

for (const [name, file, transform] of [
  ['package identity', 'package.json', value => ({ ...value, name: '@other/product' })],
  ['metadata version', 'release-metadata.json', value => ({ ...value, productVersion: '0.3.9' })],
  ['source commit', 'release-metadata.json', value => ({ ...value, sourceCommit: 'unknown' })],
]) {
  test(`offline target with unverifiable ${name} stops the upgrade`, async (t) => {
    const { root, projectRoot, packs, run } = await fixture(t);
    const filePath = join(root, 'stage-1/package', file);
    await writeFile(filePath, JSON.stringify(transform(JSON.parse(await readFile(filePath)))));
    execFileSync('tar', ['-czf', packs[1], '-C', join(root, 'stage-1'), 'package']);
    const result = run('--apply');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /identity, version or source commit/);
    assert.equal(await readFile(join(projectRoot, workflow), 'utf8'), 'runner: old\n\nprompt: original\n');
  });
}

test('a newly created path or permission change after planning stops the complete apply', async (t) => {
  const { chmod } = await import('node:fs/promises');
  const { planUpgrade, applyUpgrade } = await import('../lib/upgrade.mjs');
  const { projectRoot, options } = await fixture(t, { [workflow]: 'old' }, { [workflow]: 'new', '.github/new': 'upstream' });
  let plan = await planUpgrade(options);
  await put(projectRoot, '.github/new', 'new project content');
  await assert.rejects(applyUpgrade(plan), /project changed since plan/);
  assert.equal(await readFile(join(projectRoot, workflow), 'utf8'), 'old');
  await rm(join(projectRoot, '.github/new'));
  plan = await planUpgrade(options);
  await chmod(join(projectRoot, workflow), 0o755);
  await assert.rejects(applyUpgrade(plan), /project changed since plan/);
  assert.equal(await readFile(join(projectRoot, workflow), 'utf8'), 'old');
});
