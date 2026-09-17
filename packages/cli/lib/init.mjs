import { resolve } from "node:path";
import { TASKS } from "./constants.mjs";
import { assertGitRoot, copyFiles, exists, listFiles, within } from "./files.mjs";
import { nextManifest, readManifest, replaceManifest } from "./manifest.mjs";
import { installationRecord, releaseMetadata, taskTemplateRoot } from "./package-assets.mjs";

export async function initTask(task, { projectRoot = process.cwd(), dryRun = false } = {}) {
  if (!TASKS[task]) throw new Error(`unknown task: ${task}`);
  projectRoot = resolve(projectRoot);
  assertGitRoot(projectRoot);
  const sourceRoot = await taskTemplateRoot(task);
  const files = await listFiles(sourceRoot);
  const conflicts = [];
  for (const file of files) if (await exists(within(projectRoot, file))) conflicts.push(file);
  const existingManifest = await readManifest(projectRoot);
  if (existingManifest?.installations?.[task]) conflicts.push(".github/graph-engineering/installation.json (task already recorded)");
  if (conflicts.length > 0) throw new Error(`installation conflicts:\n${conflicts.map((item) => `- ${item}`).join("\n")}`);
  const metadata = await releaseMetadata();
  const manifest = nextManifest(existingManifest, installationRecord(task, metadata));
  if (!dryRun) {
    await copyFiles({ sourceRoot, projectRoot, files });
    try { await replaceManifest(projectRoot, manifest); }
    catch (error) {
      for (const file of files.reverse()) await import("node:fs/promises").then(({ rm }) => rm(within(projectRoot, file), { force: true }));
      throw error;
    }
  }
  return { task, dryRun, files, manifest };
}
