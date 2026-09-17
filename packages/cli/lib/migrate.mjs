import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { MANIFEST_PATH, TASKS } from "./constants.mjs";
import { assertGitRoot, copyFiles, exists, listFiles, sha256, within } from "./files.mjs";
import { nextManifest, replaceManifest } from "./manifest.mjs";
import { installationRecord, legacyTemplateRoot, releaseMetadata, workflowTemplateRoot, workflowFiles } from "./package-assets.mjs";

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
  if (await exists(within(projectRoot, ".github/workflows/github-pr-review.yml"))) throw new Error("PR Review is retired; existing Consumer files remain project-owned. Remove or migrate them manually before Development migration.");
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
    const currentRoot = await workflowTemplateRoot();
    plans.push({ task, oldRoot: baselineRoot, oldFiles: validated.files, currentRoot, newFiles: await workflowFiles(currentRoot) });
  }
  const replacedPaths = new Set(plans.flatMap(({ oldFiles }) => oldFiles));
  const conflicts = [];
  for (const { newFiles } of plans) {
    for (const file of newFiles) {
      if (!replacedPaths.has(file) && await exists(within(projectRoot, file))) conflicts.push(file);
    }
  }
  if (conflicts.length > 0) throw new Error(`migration conflicts:\n${[...new Set(conflicts)].map((item) => `- ${item}`).join("\n")}`);
  const differences = [];
  for (const plan of plans) {
    for (const oldFile of plan.oldFiles) {
      const newFile = oldFile.replace("/loop-engineering/", "/graph-engineering/");
      if (!plan.newFiles.includes(newFile)) continue;
      const diff = spawnSync("git", ["diff", "--no-index", "--", join(plan.oldRoot, oldFile), join(plan.currentRoot, newFile)], { encoding: "utf8" });
      if (diff.error || ![0, 1].includes(diff.status)) throw new Error(`cannot preview migration differences: ${diff.error?.message ?? diff.stderr}`);
      if (diff.stdout) differences.push(diff.stdout.trimEnd());
    }
  }
  const summary = plans.flatMap(({ task, oldFiles, newFiles }) => [
    `${task}: remove ${oldFiles.length} recognized Loop Engineering files`,
    ...oldFiles.map((file) => `- ${file}`),
    `${task}: install ${newFiles.length} Graph Engineering files`,
    ...newFiles.map((file) => `+ ${file}`),
  ]);
  summary.push(...differences);
  if (!apply) {
    if (!interactive) return { applied: false, requiresApply: true, tasks, summary };
    const prompt = createInterface({ input, output });
    const answer = await prompt.question(`${summary.join("\n")}\nApply migration? [y/N] `);
    prompt.close();
    if (!/^y(es)?$/i.test(answer.trim())) return { applied: false, requiresApply: false, tasks, summary };
  }
  const metadata = await releaseMetadata();
  let manifest;
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
      manifest = nextManifest(installationRecord(plan.task, metadata), plan.newFiles);
    }
    await replaceManifest(projectRoot, manifest);
    // Only recognized baseline files are removed; unrelated project files remain owned by the Consumer.
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
