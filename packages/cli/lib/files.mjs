import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, constants, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

export async function listFiles(root) {
  const output = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symbolic links are not allowed in package assets: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) output.push(relative(root, path));
      else throw new Error(`unsupported package asset: ${path}`);
    }
  }
  await visit(root);
  return output.sort();
}

export function within(root, relativePath) {
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error(`path escapes project root: ${relativePath}`);
  return target;
}

export async function sha256(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

export async function copyFiles({ sourceRoot, projectRoot, files }) {
  const createdFiles = [];
  const createdDirectories = new Set();
  try {
    for (const relativePath of files) {
      const target = within(projectRoot, relativePath);
      let directory = dirname(target);
      const missing = [];
      while (directory.startsWith(projectRoot) && !(await exists(directory))) {
        missing.push(directory);
        directory = dirname(directory);
      }
      await mkdir(dirname(target), { recursive: true });
      for (const item of missing) createdDirectories.add(item);
      await copyFile(join(sourceRoot, relativePath), target, constants.COPYFILE_EXCL);
      createdFiles.push(target);
    }
  } catch (error) {
    for (const path of createdFiles.reverse()) await rm(path, { force: true });
    for (const path of [...createdDirectories].sort((a, b) => b.length - a.length)) {
      try { await rm(path); } catch {}
    }
    throw error;
  }
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

export async function isDirectory(path) {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

export function assertGitRoot(projectRoot) {
  const result = spawnSync("git", ["-C", projectRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (result.status !== 0 || resolve(result.stdout.trim()) !== resolve(projectRoot)) {
    throw new Error("run the command from a Git repository root or pass --project <root>");
  }
}
