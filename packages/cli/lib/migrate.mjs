import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { MANIFEST_PATH, TASKS } from "./constants.mjs";
import { assertGitRoot, copyFiles, exists, listFiles, sha256, within } from "./files.mjs";
import { nextManifest, readManifest, replaceManifest } from "./manifest.mjs";
import { installationRecord, legacyTemplateRoot, releaseMetadata, taskTemplateRoot } from "./package-assets.mjs";

async function detect(projectRoot) {
  const found = [];
  for (const [task, definition] of Object.entries(TASKS)) {
    if (await exists(within(projectRoot, `.github/workflows/${definition.workflow}`))) found.push(task);
  }
  return found;
}

async function validateBaseline(projectRoot, task, baselineRoot) {
  const files = await listFiles(baselineRoot);
  const mismatches = [];
  for (const file of files) {
    const target = within(projectRoot, file);
    if (!(await exists(target)) || await sha256(target) !== await sha256(join(baselineRoot, file))) mismatches.push(file);
  }
  return { files, mismatches };
}

export async function migrate({ projectRoot = process.cwd(), apply = false, interactive = Boolean(process.stdin.isTTY) } = {}) {
  projectRoot = resolve(projectRoot);
  assertGitRoot(projectRoot);
  const tasks = await detect(projectRoot);
  if (tasks.length === 0) throw new Error("no supported Loop Engineering installation was detected");
  if (await exists(within(projectRoot, MANIFEST_PATH))) throw new Error("a Graph Engineering installation manifest already exists");
  const plans = [];
  for (const task of tasks) {
    const baselineRoot = await legacyTemplateRoot(task);
    const validated = await validateBaseline(projectRoot, task, baselineRoot);
    if (validated.mismatches.length > 0) {
      throw new Error(`cannot safely migrate modified or unknown ${task} files:\n${validated.mismatches.map((item) => `- ${item}`).join("\n")}`);
    }
    const currentRoot = await taskTemplateRoot(task);
    plans.push({ task, oldRoot: baselineRoot, oldFiles: validated.files, currentRoot, newFiles: await listFiles(currentRoot) });
  }
  const replacedPaths = new Set(plans.flatMap(({ oldFiles }) => oldFiles));
  const conflicts = [];
  for (const { newFiles } of plans) {
    for (const file of newFiles) {
      if (!replacedPaths.has(file) && await exists(within(projectRoot, file))) conflicts.push(file);
    }
  }
  if (conflicts.length > 0) throw new Error(`migration conflicts:\n${[...new Set(conflicts)].map((item) => `- ${item}`).join("\n")}`);
  const summary = plans.flatMap(({ task, oldFiles, newFiles }) => [
    `${task}: remove ${oldFiles.length} recognized Loop Engineering files`,
    ...oldFiles.map((file) => `- ${file}`),
    `${task}: install ${newFiles.length} Graph Engineering files`,
    ...newFiles.map((file) => `+ ${file}`),
  ]);
  if (!apply) {
    if (!interactive) return { applied: false, requiresApply: true, tasks, summary };
    const prompt = createInterface({ input, output });
    const answer = await prompt.question(`${summary.join("\n")}\nApply migration? [y/N] `);
    prompt.close();
    if (!/^y(es)?$/i.test(answer.trim())) return { applied: false, requiresApply: false, tasks, summary };
  }
  const metadata = await releaseMetadata();
  let manifest = await readManifest(projectRoot);
  const backup = await mkdtemp(join(tmpdir(), "graph-engineering-migrate-"));
  for (const plan of plans) {
    for (const file of plan.oldFiles) {
      const target = within(backup, file);
      await mkdir(resolve(target, ".."), { recursive: true });
      await cp(within(projectRoot, file), target);
    }
  }
  const installed = [];
  try {
    for (const plan of plans) {
      for (const file of plan.oldFiles) await rm(within(projectRoot, file), { force: true });
      await copyFiles({ sourceRoot: plan.currentRoot, projectRoot, files: plan.newFiles });
      installed.push(...plan.newFiles);
      manifest = nextManifest(manifest, installationRecord(plan.task, metadata));
    }
    await replaceManifest(projectRoot, manifest);
    await rm(within(projectRoot, ".github/loop-engineering"), { recursive: true, force: true });
    await mkdir(within(projectRoot, ".github/graph-engineering"), { recursive: true });
  } catch (error) {
    for (const file of installed.reverse()) await rm(within(projectRoot, file), { force: true });
    for (const plan of plans) {
      for (const file of plan.oldFiles) {
        const target = within(projectRoot, file);
        await mkdir(resolve(target, ".."), { recursive: true });
        await cp(within(backup, file), target);
      }
    }
    throw error;
  } finally {
    await rm(backup, { recursive: true, force: true });
  }
  return { applied: true, requiresApply: false, tasks, summary };
}
