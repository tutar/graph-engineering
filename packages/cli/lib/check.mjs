import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { TASKS } from "./constants.mjs";
import { exists, sha256, within } from "./files.mjs";
import { readManifest } from "./manifest.mjs";
import { workflowTemplateRoot, workflowFiles } from "./package-assets.mjs";

function result(status, check, detail, blocking = false) { return { status, check, detail, blocking }; }
function command(name, args = [], cwd) { return spawnSync(name, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }

export async function checkWorkflow({ projectRoot = process.cwd() } = {}) {
  const task = "development";
  projectRoot = resolve(projectRoot);
  const results = [];
  const git = command("git", ["rev-parse", "--show-toplevel"], projectRoot);
  if (git.status !== 0) results.push(result("ACTION REQUIRED", "git-repository", "Run the command from a Git repository root.", true));
  else if (resolve(git.stdout.trim()) !== projectRoot) results.push(result("ACTION REQUIRED", "git-repository", "Run the command from the Git repository root.", true));
  else results.push(result("PASS", "git-repository", projectRoot));

  const templateRoot = await workflowTemplateRoot();
  const files = await workflowFiles(templateRoot);
  const present = [];
  const changed = [];
  for (const file of files) {
    const target = within(projectRoot, file);
    if (await exists(target)) {
      present.push(file);
      if (await sha256(target) !== await sha256(join(templateRoot, file))) changed.push(file);
    }
  }
  if (present.length === 0) results.push(result("ACTION REQUIRED", "workflow-files", `${task} is not installed.`));
  else if (present.length !== files.length) results.push(result("ACTION REQUIRED", "workflow-files", `Partial installation: ${present.length}/${files.length} files exist.`, true));
  else if (changed.length > 0) results.push(result("UNVERIFIED", "workflow-files", `${changed.length} project-owned file(s) differ from the packaged template.`));
  else results.push(result("PASS", "workflow-files", `${files.length} files match the packaged template.`));

  try {
    const manifest = await readManifest(projectRoot);
    const record = manifest?.installations?.[task];
    const consistent = manifest?.schemaVersion === 2
      && manifest.product === "@tutar/graph-engineering"
      && manifest.delivery === "workflow"
      && JSON.stringify(manifest.files) === JSON.stringify(files)
      && JSON.stringify(Object.keys(manifest.installations)) === JSON.stringify(Object.keys(TASKS))
      && record?.task === task
      && record.profile === TASKS[task].profile
      && Boolean(record.sourceCommit && record.cliVersion);
    if (!consistent) results.push(result("ACTION REQUIRED", "installation-manifest", "Whole-workflow installation source or file list is missing or inconsistent."));
    else results.push(result("PASS", "installation-manifest", `${manifest.installations[task].cliVersion} ${manifest.installations[task].sourceCommit}`));
  } catch (error) {
    results.push(result("ACTION REQUIRED", "installation-manifest", error.message, true));
  }

  for (const executable of ["gh", "codex"]) {
    const probe = command(executable, ["--version"], projectRoot);
    results.push(probe.status === 0
      ? result("PASS", `${executable}-executable`, probe.stdout.split("\n")[0].trim())
      : result("UNVERIFIED", `${executable}-executable`, `${executable} is not available locally; confirm it on the selected runner.`));
  }

  const gh = command("gh", ["repo", "view", "--json", "nameWithOwner"], projectRoot);
  if (gh.status !== 0) {
    results.push(result("UNVERIFIED", "github-repository", "GitHub repository access is unavailable from this environment."));
  } else {
    const nameWithOwner = JSON.parse(gh.stdout).nameWithOwner;
    results.push(result("PASS", "github-repository", nameWithOwner));
    if (TASKS[task].requiredLabels.length > 0) {
      const labels = command("gh", ["label", "list", "--limit", "200", "--json", "name"], projectRoot);
      if (labels.status !== 0) results.push(result("UNVERIFIED", "github-labels", "Unable to read repository labels."));
      else {
        const names = new Set(JSON.parse(labels.stdout).map(({ name }) => name));
        const missing = TASKS[task].requiredLabels.filter((name) => !names.has(name));
        results.push(missing.length === 0
          ? result("PASS", "github-labels", "Required labels exist.")
          : result("ACTION REQUIRED", "github-labels", `Create: ${missing.join(", ")}`));
      }
    }
    const runners = command("gh", ["api", `repos/${nameWithOwner}/actions/runners`, "--paginate", "--slurp"], projectRoot);
    if (runners.status !== 0) {
      results.push(result("UNVERIFIED", "runner-labels", "Unable to inspect repository runners; confirm [self-hosted, Linux, X64, codex] in GitHub Settings."));
    } else {
      const expected = ["self-hosted", "Linux", "X64", "codex"];
      const compatible = JSON.parse(runners.stdout).flatMap(({ runners }) => runners ?? []).some(({ labels }) => {
        const names = new Set(labels.map(({ name }) => name));
        return expected.every((label) => names.has(label));
      });
      results.push(compatible
        ? result("PASS", "runner-labels", "A runner exposes [self-hosted, Linux, X64, codex].")
        : result("ACTION REQUIRED", "runner-labels", "Register a dedicated runner with [self-hosted, Linux, X64, codex]."));
    }
    results.push(result("UNVERIFIED", "codex-runner-login", "Confirm that the Actions service user is logged in to Codex on the selected runner."));
    if (task === "development") {
      const permissions = command("gh", ["api", `repos/${nameWithOwner}/actions/permissions/workflow`], projectRoot);
      if (permissions.status !== 0) results.push(result("UNVERIFIED", "actions-write-policy", "Unable to inspect the repository Actions workflow permission policy."));
      else {
        const policy = JSON.parse(permissions.stdout);
        results.push(policy.default_workflow_permissions === "write"
          ? result("PASS", "actions-write-policy", "Default workflow permissions allow write access; review the Workflow's explicit permissions before commit.")
          : result("ACTION REQUIRED", "actions-write-policy", "Allow the Development workflow's required write permissions in GitHub Settings."));
      }
    }
  }
  return { task, ready: results.every(({ status }) => status === "PASS"), blocking: results.some(({ blocking }) => blocking), results };
}

export function printCheck(report, { json = false, stream = process.stdout } = {}) {
  if (json) stream.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    for (const item of report.results) stream.write(`${item.status.padEnd(15)} ${item.check}: ${item.detail}\n`);
    stream.write(`${report.ready ? "READY" : "ACTION REQUIRED"}: ${report.task}\n`);
  }
}
