import { lstat, readFile, mkdir, writeFile, rm, rmdir, chmod } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { within } from './files.mjs';

async function statOptional(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function snapshotFile(projectRoot, path) {
  const full = within(projectRoot, path);
  // Existing parents must be real directories, so a project symlink cannot make
  // preview or apply read/write outside the project-owned installation.
  let parent = projectRoot;
  for (const segment of relative(projectRoot, dirname(full)).split(sep).filter(Boolean)) {
    parent = resolve(parent, segment);
    const stat = await statOptional(parent);
    if (stat && !stat.isDirectory()) throw new Error(`unsafe project path: ${path}`);
  }
  const stat = await statOptional(full);
  if (!stat) return { content: null, mode: null };
  if (!stat.isFile()) throw new Error(`unsafe project file: ${path}`);
  return { content: await readFile(full), mode: stat.mode & 0o777 };
}

export function sameContent(a, b) { return a === null ? b === null : b !== null && a.equals(b); }

export async function verifySnapshots(plan) {
  for (const [path, snapshot] of plan.snapshots) {
    const current = await snapshotFile(plan.projectRoot, path);
    if (!sameContent(current.content, snapshot.content) || current.mode !== snapshot.mode) throw new Error(`project changed since plan generation: ${path}; generate a new plan`);
  }
}

// The injectable write/remove boundary lets integration tests exercise partial
// filesystem failures. Rollback uses the real filesystem, not the failing writer.
export async function writeUpgrade(plan, { writeFile: write = writeFile, rm: remove = rm } = {}) {
  const attempted = [];
  const createdDirectories = new Set();
  async function ensureParent(full) {
    let parent = dirname(full);
    while (parent !== plan.projectRoot && !(await statOptional(parent))) {
      createdDirectories.add(parent);
      parent = dirname(parent);
    }
    await mkdir(dirname(full), { recursive: true });
  }
  async function replace(path, content) {
    const full = within(plan.projectRoot, path);
    attempted.push(path);
    if (content === null) await remove(full);
    else {
      await ensureParent(full);
      await write(full, content);
    }
  }
  try {
    for (const change of plan.changes) if (change.action !== 'keep') await replace(change.path, change.after);
    // Provenance is written only after the entire template change set succeeds.
    await replace(plan.manifestPath, Buffer.from(`${JSON.stringify(plan.nextManifest, null, 2)}\n`));
  } catch (error) {
    const failures = [];
    for (const path of attempted.reverse()) {
      try {
        const snapshot = plan.snapshots.get(path);
        const full = within(plan.projectRoot, path);
        if (snapshot.content === null) await rm(full, { force: true });
        else {
          await mkdir(dirname(full), { recursive: true });
          await writeFile(full, snapshot.content);
          await chmod(full, snapshot.mode);
        }
      } catch (rollbackError) { failures.push(`${path}: ${rollbackError.message}`); }
    }
    for (const directory of [...createdDirectories].sort((a, b) => b.length - a.length)) {
      try { await rmdir(directory); }
      catch (cleanupError) { if (!['ENOTEMPTY', 'ENOENT'].includes(cleanupError.code)) failures.push(`${directory}: ${cleanupError.message}`); }
    }
    if (failures.length) throw new Error(`upgrade failed: ${error.message}; rollback incomplete: ${failures.join('; ')}`, { cause: error });
    throw new Error(`upgrade failed; original files and installation record restored: ${error.message}`, { cause: error });
  }
}
