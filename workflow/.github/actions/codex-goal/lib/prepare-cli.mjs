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

function pathCandidates(value) {
  return value
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, process.platform === "win32" ? "codex.exe" : "codex"));
}

async function defaultInstall({ installRoot, binDirectory, version }) {
  await mkdir(installRoot, { recursive: true });
  await execFileAsync("npm", [
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
  install = defaultInstall,
}) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("codex-version must be a fixed semantic version");
  }
  if (!runnerToolCache) throw new Error("RUNNER_TOOL_CACHE is required");

  for (const candidate of pathCandidates(path)) {
    if (await cliVersion(candidate) === version) return candidate;
  }

  const installRoot = join(runnerToolCache, "codex", version, process.arch);
  const binDirectory = join(installRoot, "bin");
  const cached = join(binDirectory, process.platform === "win32" ? "codex.cmd" : "codex");
  if (await cliVersion(cached) === version) return cached;

  await rm(binDirectory, { recursive: true, force: true });
  await install({ installRoot, binDirectory, version });
  await access(cached);
  if (await cliVersion(cached) !== version) {
    throw new Error(`installed Codex CLI does not match requested version ${version}`);
  }
  return cached;
}
