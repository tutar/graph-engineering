import { appendFile } from "node:fs/promises";
import { installedCompatibleVersion } from "../actions/codex-goal/lib/prepare-cli.mjs";

const minimum = "0.153.4";
const selected = await installedCompatibleVersion({ version: minimum }) ?? minimum;
if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
await appendFile(process.env.GITHUB_OUTPUT, `codex-version=${selected}\n`);
process.stdout.write(`Selected Codex CLI ${selected} (minimum ${minimum})\n`);
