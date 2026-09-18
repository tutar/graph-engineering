#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { basename, isAbsolute, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  const options = { repository: process.cwd(), manifest: null };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--repository" || option === "--manifest") {
      const value = argv[index + 1];
      if (!value) fail(`${option} requires a value`);
      options[option.slice(2)] = value;
      index += 1;
    } else {
      fail(`unknown option: ${option}`);
    }
  }
  options.repository = resolve(options.repository);
  options.manifest = resolve(options.manifest ?? resolve(options.repository, "delivery/definitions.json"));
  return options;
}

function git(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
  if (result.status !== 0) fail(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
}

function requireRepositoryPath(value, label) {
  requireString(value, label);
  const normalized = normalize(value);
  if (isAbsolute(value) || normalized === "." || normalized === ".." || normalized.startsWith(`..${sep}`)) {
    fail(`${label} must stay within the repository`);
  }
}

function definitionKey(definition) {
  return `${definition.name}/${definition.definitionVersion}`;
}

function validateDefinitionShape(definition, label) {
  requireString(definition.name, `${label}.name`);
  requireString(definition.definitionVersion, `${label}.definitionVersion`);
  if (!/^[0-9a-f]{40}$/.test(definition.sourceCommit ?? "")) {
    fail(`${label}.sourceCommit must be a full commit SHA`);
  }
  requireString(definition.repositoryRelease?.version, `${label}.repositoryRelease.version`);
  requireString(definition.repositoryRelease?.gitRef, `${label}.repositoryRelease.gitRef`);
  if (!["github-release", "legacy-tag"].includes(definition.repositoryRelease?.kind)) {
    fail(`${label}.repositoryRelease.kind is unsupported`);
  }
  requireRepositoryPath(definition.path, `${label}.path`);
  requireRepositoryPath(definition.installRoot, `${label}.installRoot`);
}

function validateCurrentTaskShape(task, label) {
  requireString(task.name, `${label}.name`);
  for (const field of ["path", "installRoot", "testRoot"]) requireRepositoryPath(task[field], `${label}.${field}`);
  requireString(task.workflow, `${label}.workflow`);
  if (basename(task.workflow) !== task.workflow) fail(`${label}.workflow must be a filename`);
  requireString(task.definitionVersion, `${label}.definitionVersion`);
  const profile = task.compatibilityProfile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) fail(`${label}.compatibilityProfile must be an object`);
  for (const field of ["id", "action", "actionRevision", "codexCli", "runner", "authentication", "permissionProfile", "taskStateRoot", "inputs", "outputs", "tokenBudget", "tokenBudgetCapability"]) {
    requireString(profile[field], `${label}.compatibilityProfile.${field}`);
  }
  if (!/^[0-9a-f]{40}$/.test(profile.actionRevision)) fail(`${label}.compatibilityProfile.actionRevision must be a full commit SHA`);
}

function verifyTokenBudgetBinding(workflow, profile, workflowPath) {
  if (profile.tokenBudget === "not-requested") {
    if (!workflow.includes("TOKEN_BUDGET_STATE: not-requested")) {
      fail(`${workflowPath} does not declare the unsupported token budget state`);
    }
    if (workflow.includes("token-budget:")) fail(`${workflowPath} unexpectedly requests a token budget`);
  } else {
    const fixedBudget = workflow.includes(`TOKEN_BUDGET_REQUESTED: "${profile.tokenBudget}"`);
    const dispatchBudget = workflow.includes(`default: "${profile.tokenBudget}"`)
      && workflow.includes(
        `TOKEN_BUDGET_REQUESTED: \${{ github.event_name == 'workflow_dispatch' && inputs.token_budget || '${profile.tokenBudget}' }}`,
      );
    if (!fixedBudget && !dispatchBudget) {
      fail(`${workflowPath} does not configure token budget ${profile.tokenBudget}`);
    }
    if (!workflow.includes("token-budget: ${{ env.TOKEN_BUDGET_REQUESTED }}")) {
      fail(`${workflowPath} does not bind the configured token budget to the Action input`);
    }
  }

  if (profile.tokenBudgetCapability === "not-requested") {
    if (workflow.includes("token-budget-capability:")) {
      fail(`${workflowPath} unexpectedly requests a token budget capability`);
    }
  } else if (!workflow.includes(`token-budget-capability: ${profile.tokenBudgetCapability}`)) {
    fail(`${workflowPath} does not bind token budget capability ${profile.tokenBudgetCapability}`);
  }
}

async function requireMissing(path, label) {
  try {
    await access(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  fail(`${label} must not exist in the current source tree`);
}

function verifyPublishedDefinition(repository, definition) {
  const { gitRef } = definition.repositoryRelease;
  git(repository, ["show-ref", "--verify", `refs/tags/${gitRef}`]);
  const resolved = git(repository, ["rev-parse", `${gitRef}^{commit}`]);
  if (resolved !== definition.sourceCommit) {
    fail(`${definitionKey(definition)} maps ${gitRef} to ${resolved}, not ${definition.sourceCommit}`);
  }
  const installPath = `${definition.path}/${definition.installRoot}`;
  git(repository, ["cat-file", "-e", `${gitRef}:${installPath}`]);
}

export async function verifyDelivery(options) {
  options = {
    repository: resolve(options.repository),
    manifest: resolve(options.manifest ?? resolve(options.repository, "delivery/definitions.json")),
  };
  const manifest = JSON.parse(await readFile(options.manifest, "utf8"));
  if (manifest.schemaVersion !== 2) fail("unsupported delivery manifest schemaVersion");
  for (const field of ["currentTasks", "retiredSourceRoots", "latestPublishedDefinitions", "publishedDefinitions", "evidenceBindings", "auditSources"]) {
    if (!Array.isArray(manifest[field])) fail(`${field} must be an array`);
  }

  const currentNames = new Set();
  const currentPaths = new Set();
  for (const [index, task] of manifest.currentTasks.entries()) {
    const label = `currentTasks[${index}]`;
    validateCurrentTaskShape(task, label);
    if (currentNames.has(task.name)) fail(`duplicate current Workflow Task name: ${task.name}`);
    if (currentPaths.size > 0 && !currentPaths.has(task.path)) fail("current Workflow Tasks must share one delivery source");
    currentNames.add(task.name);
    currentPaths.add(task.path);
    await access(resolve(options.repository, task.path, task.installRoot, "workflows", task.workflow));
    await access(resolve(options.repository, task.path, task.testRoot));
    const workflow = await readFile(resolve(options.repository, task.path, task.installRoot, "workflows", task.workflow), "utf8");
    const profile = task.compatibilityProfile;
    const workflowPath = `${task.path}/${task.installRoot}/workflows/${task.workflow}`;
    for (const value of [profile.action, profile.actionRevision, profile.codexCli, profile.runner, profile.permissionProfile, profile.taskStateRoot]) {
      if (!workflow.includes(value)) fail(`${task.path}/${task.installRoot}/workflows/${task.workflow} does not bind ${value}`);
    }
    verifyTokenBudgetBinding(workflow, profile, workflowPath);
  }

  for (const [index, path] of manifest.retiredSourceRoots.entries()) {
    requireRepositoryPath(path, `retiredSourceRoots[${index}]`);
    await requireMissing(resolve(options.repository, path), `retiredSourceRoots[${index}]`);
  }

  const published = new Map();
  for (const [index, definition] of manifest.publishedDefinitions.entries()) {
    validateDefinitionShape(definition, `publishedDefinitions[${index}]`);
    const key = definitionKey(definition);
    if (published.has(key)) fail(`duplicate published Definition: ${key}`);
    published.set(key, definition);
    verifyPublishedDefinition(options.repository, definition);
  }

  for (const [index, binding] of manifest.evidenceBindings.entries()) {
    const label = `evidenceBindings[${index}]`;
    for (const field of ["manifest", "definition", "repositoryRelease", "actionRevision", "status", "decisionMarker"]) {
      requireString(binding[field], `${label}.${field}`);
    }
    if (!binding.frozenInputs || typeof binding.frozenInputs !== "object" || Array.isArray(binding.frozenInputs)) {
      fail(`${label}.frozenInputs must be a named object`);
    }
    const frozenInputs = Object.entries(binding.frozenInputs);
    if (frozenInputs.length === 0) fail(`${label}.frozenInputs must not be empty`);
    for (const [field, value] of frozenInputs) requireString(value, `${label}.frozenInputs.${field}`);
    const expectedDecisionMarker = {
      FAIL: "Gate Decision: FAIL",
      IN_PROGRESS: "Status: in progress",
    }[binding.status];
    if (!expectedDecisionMarker || binding.decisionMarker !== expectedDecisionMarker) {
      fail(`${label}.status does not match its decisionMarker`);
    }
    const evidence = await readFile(resolve(options.repository, binding.manifest), "utf8");
    for (const value of [
      binding.definition,
      binding.repositoryRelease,
      binding.profile,
      binding.actionRevision,
      binding.decisionMarker,
      ...frozenInputs.map(([, value]) => value),
    ].filter(Boolean)) {
      if (!evidence.includes(value)) fail(`${binding.manifest} does not freeze ${value}`);
    }
    const mapped = published.get(binding.definition);
    if (!mapped) fail(`${binding.manifest} binds unknown Definition ${binding.definition}`);
    if (mapped.repositoryRelease.version !== binding.repositoryRelease) {
      fail(`${binding.manifest} crosses the ${binding.definition} release boundary`);
    }
  }

  for (const [index, source] of manifest.auditSources.entries()) {
    requireString(source.url, `auditSources[${index}].url`);
    if (!/^[0-9a-f]{40}$/.test(source.headCommit ?? "")) fail(`auditSources[${index}].headCommit must be a full SHA`);
    await access(resolve(options.repository, source.preservedEvidence));
    await access(resolve(options.repository, source.unfrozenPreparation));
  }

  const latestPublishedDefinitions = [];
  const latestNames = new Set();
  for (const [index, key] of manifest.latestPublishedDefinitions.entries()) {
    requireString(key, `latestPublishedDefinitions[${index}]`);
    const definition = published.get(key);
    if (!definition) fail(`latestPublishedDefinitions[${index}] references unknown Definition ${key}`);
    if (latestNames.has(definition.name)) fail(`multiple latest published Definitions named ${definition.name}`);
    latestNames.add(definition.name);
    latestPublishedDefinitions.push(definition);
  }
  return {
    currentTasks: manifest.currentTasks,
    latestPublishedDefinitions: latestPublishedDefinitions.map((definition) => ({
      name: definition.name,
      definitionVersion: definition.definitionVersion,
      repositoryRelease: definition.repositoryRelease.version,
      gitRef: definition.repositoryRelease.gitRef,
      path: definition.path,
      installRoot: definition.installRoot,
    })),
    publishedDefinitions: manifest.publishedDefinitions.length,
    evidenceBindings: manifest.evidenceBindings.length,
    auditSources: manifest.auditSources.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = parseArguments(process.argv.slice(2));
  verifyDelivery(options)
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
