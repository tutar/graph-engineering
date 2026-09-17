import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { CURRENT_NAMESPACE, PRODUCT_VERSION, TASKS } from "./constants.mjs";
import { exists, packageRoot, readJson } from "./files.mjs";

export async function taskTemplateRoot(task) {
  const bundled = join(packageRoot, "templates", task);
  if (await exists(bundled)) return bundled;
  const source = resolve(packageRoot, "../..", "workflow-tasks", task, "files");
  if (await exists(source)) return source;
  throw new Error(`missing packaged template for ${task}`);
}

export async function legacyTemplateRoot(task) {
  const root = join(packageRoot, "migrations", "loop-engineering-927bd961", task);
  if (!(await exists(root))) throw new Error("migration assets are missing; run this command from a published package or npm pack output");
  return root;
}

export async function releaseMetadata() {
  const path = join(packageRoot, "release-metadata.json");
  if (await exists(path)) return readJson(path);
  let sourceCommit = "working-tree";
  try {
    sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve(packageRoot, "../.."), encoding: "utf8" }).trim();
  } catch {}
  return { productVersion: PRODUCT_VERSION, sourceCommit };
}

export function installationRecord(task, metadata) {
  return {
    cliVersion: PRODUCT_VERSION,
    sourceCommit: metadata.sourceCommit,
    task,
    definition: TASKS[task].profile.split("/codex/")[0],
    profile: TASKS[task].profile,
    namespace: CURRENT_NAMESPACE,
  };
}
