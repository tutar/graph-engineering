import { execFile } from "node:child_process";
import { access, mkdir, rm, symlink } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function cliVersion(path) {
  try {
    const { stdout } = await execFileAsync(path, ["--version"], { encoding: "utf8" });
    return stdout.trim().match(/^codex-cli\s+(.+)$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function semanticVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value ?? "");
  if (!match) return null;
  const parts = match.slice(1, 4).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  return { parts, prerelease: match[4] ?? null };
}

function atLeast(actual, minimum) {
  const candidate = semanticVersion(actual);
  if (!candidate) return false;
  for (let index = 0; index < 3; index += 1) {
    if (candidate.parts[index] !== minimum.parts[index]) {
      return candidate.parts[index] > minimum.parts[index];
    }
  }
  if (minimum.prerelease === null) return candidate.prerelease === null;
  if (candidate.prerelease === null) return true;
  return candidate.prerelease >= minimum.prerelease;
}

export async function installedCompatibleVersion({ version, path = process.env.PATH ?? "" }) {
  const minimum = semanticVersion(version);
  if (!minimum || minimum.prerelease !== null) throw new Error("codex-version must be a stable minimum semantic version");
  for (const candidate of pathCandidates(path)) {
    const actual = await cliVersion(candidate);
    if (atLeast(actual, minimum)) return actual;
  }
  return null;
}

function pathCandidates(value) {
  return value
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, process.platform === "win32" ? "codex.exe" : "codex"));
}

export async function installCodexCli({ installRoot, binDirectory, version, npmCommand = "npm" }) {
  await mkdir(installRoot, { recursive: true });
  await execFileAsync(npmCommand, [
    "install",
    "--no-audit",
    "--no-fund",
    "--prefix",
    installRoot,
    `@openai/codex@${version}`,
  ], { encoding: "utf8" });
  await mkdir(binDirectory, { recursive: true });
  const installed = join(installRoot, "node_modules", ".bin", process.platform === "win32" ? "codex.cmd" : "codex");
  const target = join(binDirectory, process.platform === "win32" ? "codex.cmd" : "codex");
  if (process.platform === "win32") {
    await import("node:fs/promises").then(({ copyFile }) => copyFile(installed, target));
  } else {
    await symlink("../node_modules/.bin/codex", target);
  }
}

export async function prepareCodexCli({
  version,
  runnerToolCache,
  path = process.env.PATH ?? "",
  install = installCodexCli,
}) {
  const minimum = semanticVersion(version);
  if (!minimum || minimum.prerelease !== null) throw new Error("codex-version must be a stable minimum semantic version");
  if (!runnerToolCache) throw new Error("RUNNER_TOOL_CACHE is required");

  for (const candidate of pathCandidates(path)) {
    if (atLeast(await cliVersion(candidate), minimum)) return candidate;
  }

  const installRoot = join(runnerToolCache, "codex", version, process.arch);
  const binDirectory = join(installRoot, "bin");
  const cached = join(binDirectory, process.platform === "win32" ? "codex.cmd" : "codex");
  if (atLeast(await cliVersion(cached), minimum)) return cached;

  await rm(binDirectory, { recursive: true, force: true });
  await install({ installRoot, binDirectory, version });
  await access(cached);
  if (!atLeast(await cliVersion(cached), minimum)) {
    throw new Error(`installed Codex CLI is not at least required version ${version}`);
  }
  return cached;
}
