#!/usr/bin/env node

import { resolve } from "node:path";
import { checkTask, printCheck } from "../lib/check.mjs";
import { initTask } from "../lib/init.mjs";
import { migrate } from "../lib/migrate.mjs";

function usage() {
  return `Usage:
  graph-engineering init <pr-review|development> [--dry-run] [--project <path>]
  graph-engineering check <pr-review|development> [--json] [--project <path>]
  graph-engineering migrate [--apply] [--project <path>]`;
}

function parse(argv) {
  const [command, maybeTask, ...rest] = argv;
  const options = { command, task: command === "migrate" ? null : maybeTask, projectRoot: process.cwd(), dryRun: false, json: false, apply: false };
  const args = command === "migrate" ? [maybeTask, ...rest].filter(Boolean) : rest;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--project") {
      if (!args[index + 1]) throw new Error("--project requires a path");
      options.projectRoot = resolve(args[++index]);
    } else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--apply") options.apply = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.command === "init") {
    const plan = await initTask(options.task, options);
    if (plan.dryRun) {
      process.stdout.write(`DRY RUN: install ${plan.task}\n${plan.files.map((file) => `+ ${file}`).join("\n")}\n`);
    } else {
      process.stdout.write(`Installed ${plan.task} (${plan.files.length} files).\n`);
      const report = await checkTask(options.task, options);
      printCheck(report, options);
      if (report.blocking) process.exitCode = 1;
    }
  } else if (options.command === "check") {
    const report = await checkTask(options.task, options);
    printCheck(report, options);
    if (report.blocking) process.exitCode = 1;
  } else if (options.command === "migrate") {
    const result = await migrate(options);
    for (const line of result.summary) process.stdout.write(`${line}\n`);
    if (result.requiresApply) process.stdout.write("ACTION REQUIRED: rerun with --apply in a non-interactive environment.\n");
    else process.stdout.write(result.applied ? "Migration applied.\n" : "Migration cancelled.\n");
  } else {
    throw new Error(usage());
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  if (!String(error.message).startsWith("Usage:")) process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
}
