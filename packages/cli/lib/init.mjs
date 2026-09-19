import { resolve } from "node:path";
import { assertGitRoot, copyFiles, exists, within } from "./files.mjs";
import { nextManifest, readManifest, replaceManifest } from "./manifest.mjs";
import { releaseMetadata, workflowTemplateRoot, workflowFiles } from "./package-assets.mjs";
import { TASKS } from "./constants.mjs";

export async function initWorkflow({ projectRoot = process.cwd(), dryRun = false } = {}) {
  const task = "workflow";
  projectRoot = resolve(projectRoot);
  assertGitRoot(projectRoot);
  const sourceRoot = await workflowTemplateRoot();
  const files = await workflowFiles(sourceRoot);
  const conflicts = [];
  for (const file of files) if (await exists(within(projectRoot, file))) conflicts.push(file);
  const existingManifest = await readManifest(projectRoot);
  if (existingManifest) conflicts.push(".github/graph-engineering/installation.json (installation already recorded)");
  if (conflicts.length > 0) throw new Error(`installation conflicts:\n${conflicts.map((item) => `- ${item}`).join("\n")}`);
  const metadata = await releaseMetadata();
  const manifest = nextManifest(metadata, files, Object.keys(TASKS));
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
