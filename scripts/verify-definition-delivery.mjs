#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
  requireString(definition.path, `${label}.path`);
  requireString(definition.installRoot, `${label}.installRoot`);
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
  if (manifest.schemaVersion !== 1) fail("unsupported delivery manifest schemaVersion");
  for (const field of ["currentDefinitions", "publishedDefinitions", "evidenceBindings", "auditSources"]) {
    if (!Array.isArray(manifest[field])) fail(`${field} must be an array`);
  }

  const published = new Map();
  for (const [index, definition] of manifest.publishedDefinitions.entries()) {
    validateDefinitionShape(definition, `publishedDefinitions[${index}]`);
    const key = definitionKey(definition);
    if (published.has(key)) fail(`duplicate published Definition: ${key}`);
    published.set(key, definition);
    verifyPublishedDefinition(options.repository, definition);
  }

  const currentNames = new Set();
  const currentDefinitions = [];
  for (const [index, key] of manifest.currentDefinitions.entries()) {
    requireString(key, `currentDefinitions[${index}]`);
    const definition = published.get(key);
    if (!definition) fail(`current Definition ${key} lacks a published mapping`);
    if (currentNames.has(definition.name)) fail(`multiple current Definitions named ${definition.name}`);
    currentNames.add(definition.name);
    await access(resolve(options.repository, definition.path, definition.installRoot));
    requireString(definition.testRoot, `publishedDefinitions entry ${key}.testRoot`);
    await access(resolve(options.repository, definition.path, definition.testRoot));
    git(options.repository, ["cat-file", "-e", `${definition.repositoryRelease.gitRef}:${definition.path}/${definition.testRoot}`]);
    currentDefinitions.push(definition);
  }

  for (const [index, binding] of manifest.evidenceBindings.entries()) {
    const label = `evidenceBindings[${index}]`;
    for (const field of ["manifest", "definition", "repositoryRelease", "actionRevision", "status", "decisionMarker"]) {
      requireString(binding[field], `${label}.${field}`);
    }
    if (!Array.isArray(binding.frozenInputs) || binding.frozenInputs.length === 0) {
      fail(`${label}.frozenInputs must be a non-empty array`);
    }
    const evidence = await readFile(resolve(options.repository, binding.manifest), "utf8");
    for (const value of [
      binding.definition,
      binding.repositoryRelease,
      binding.profile,
      binding.actionRevision,
      binding.decisionMarker,
      ...binding.frozenInputs,
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

  const currentOutput = currentDefinitions.map((definition) => ({
    name: definition.name,
    definitionVersion: definition.definitionVersion,
    sourceCommit: definition.sourceCommit,
    repositoryRelease: definition.repositoryRelease.version,
    gitRef: definition.repositoryRelease.gitRef,
    path: definition.path,
    installRoot: definition.installRoot,
    testRoot: definition.testRoot,
  }));
  return {
    currentDefinitions: currentOutput,
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
