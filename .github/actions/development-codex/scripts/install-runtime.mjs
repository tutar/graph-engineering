import { execFileSync } from "node:child_process";
import { access, appendFile, chmod, mkdtemp } from "node:fs/promises";
import { delimiter, join } from "node:path";

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?$/;

function stableVersion(value) {
  const match = versionPattern.exec(value ?? "");
  if (!match) return null;
  const parts = match.slice(1, 4).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function compatible(actual, minimum) {
  const version = stableVersion(actual);
  if (!version) return false;
  for (let index = 0; index < 3; index += 1) {
    if (version[index] !== minimum[index]) return version[index] > minimum[index];
  }
  return true;
}

function installedCli(minimum, path) {
  for (const directory of path.split(delimiter).filter(Boolean)) {
    const binary = join(directory, "codex");
    try {
      const output = execFileSync(binary, ["--version"], { encoding: "utf8", timeout: 5_000 }).trim();
      const version = /^codex-cli (.+)$/.exec(output)?.[1];
      if (compatible(version, minimum)) return { directory, binary, version };
    } catch {
      // Missing, unresponsive, and malformed executables cannot be reused.
    }
  }
  return null;
}

function npmInstall(directory, packages) {
  execFileSync("npm", ["install", "--global=false", "--prefix", directory, "--no-audit", "--no-fund", ...packages], {
    stdio: "inherit",
  });
}

async function main() {
  const { RUNNER_TEMP, GITHUB_PATH, GITHUB_OUTPUT, CODEX_VERSION = "", PROXY_REQUIRED = "false" } = process.env;
  if (!RUNNER_TEMP || !GITHUB_PATH || !GITHUB_OUTPUT) throw new Error("RUNNER_TEMP, GITHUB_PATH, and GITHUB_OUTPUT are required");
  if (!new Set(["true", "false"]).has(PROXY_REQUIRED)) throw new Error("PROXY_REQUIRED must be true or false");
  const minimum = CODEX_VERSION ? stableVersion(CODEX_VERSION) : null;
  if (CODEX_VERSION && !minimum) throw new Error("codex-version must be a stable semantic version");

  const existing = minimum ? installedCli(minimum, process.env.PATH ?? "") : null;
  const proxyRequired = PROXY_REQUIRED === "true";
  let directory = existing?.directory;
  let runtimeDirectory = "";
  if (!existing || proxyRequired) {
    process.umask(0o022);
    const parent = process.env.SAFETY_STRATEGY === "unprivileged-user" ? "/tmp" : RUNNER_TEMP;
    runtimeDirectory = await mkdtemp(join(parent, "codex-action-runtime."));
    await chmod(runtimeDirectory, 0o755);
    const version = existing?.version ?? (CODEX_VERSION || "latest");
    const packages = existing ? [] : [`@openai/codex@${version}`];
    if (proxyRequired) packages.push(`@openai/codex-responses-api-proxy@${version}`);
    npmInstall(runtimeDirectory, packages);
    const installedBin = join(runtimeDirectory, "node_modules", ".bin");
    if (!existing) {
      const binary = join(installedBin, "codex");
      await access(binary);
      const actual = execFileSync(binary, ["--version"], { encoding: "utf8", timeout: 5_000 }).trim();
      if (minimum && !compatible(/^codex-cli (.+)$/.exec(actual)?.[1], minimum)) {
        throw new Error(`installed Codex CLI does not meet minimum ${CODEX_VERSION}`);
      }
      directory = installedBin;
    }
    if (proxyRequired) await access(join(installedBin, "codex-responses-api-proxy"));
    if (proxyRequired) await appendFile(GITHUB_PATH, `${installedBin}\n`);
  }
  await appendFile(GITHUB_PATH, `${directory}\n`);
  await appendFile(GITHUB_OUTPUT, `runtime-directory=${runtimeDirectory}\n`);
  process.stdout.write(`Codex CLI ${existing?.version ?? (CODEX_VERSION || "latest")}: ${existing ? "reused" : "installed"}\n`);
}

await main();
