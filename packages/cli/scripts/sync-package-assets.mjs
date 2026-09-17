import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repository = resolve(packageRoot, "../..");
const baseline = "927bd96156f750546019581b653b7601db9c71c8";
const tasks = ["development", "pr-review"];

await rm(join(packageRoot, "templates"), { recursive: true, force: true });
await rm(join(packageRoot, "migrations"), { recursive: true, force: true });

for (const task of tasks) {
  await cp(join(repository, "workflow-tasks", task, "files"), join(packageRoot, "templates", task), { recursive: true });
  const prefix = `workflow-tasks/${task}/files/`;
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", baseline, prefix], { cwd: repository, encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  for (const file of files) {
    const relative = file.slice(prefix.length);
    const target = join(packageRoot, "migrations", "loop-engineering-927bd961", task, relative);
    await mkdir(dirname(target), { recursive: true });
    const content = execFileSync("git", ["show", `${baseline}:${file}`], { cwd: repository });
    await writeFile(target, content);
  }
}

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
await writeFile(join(packageRoot, "release-metadata.json"), `${JSON.stringify({ productVersion: "0.3.0", sourceCommit }, null, 2)}\n`);
