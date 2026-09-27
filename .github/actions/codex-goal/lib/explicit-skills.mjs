import { isAbsolute, basename } from "node:path";

const SKILL_MENTION = /(?<![\w$\\])\$([a-z][a-z0-9-]*)(?![\w-])/g;

export function explicitSkillNames(objective) {
  return [...new Set([...objective.matchAll(SKILL_MENTION)].map((match) => match[1]))];
}

export async function resolveExplicitSkills(client, objective, workingDirectory) {
  const names = explicitSkillNames(objective);
  if (names.length === 0) return objective;

  const catalog = await client.request("skills/list", {
    cwds: [workingDirectory],
    forceReload: true,
  });
  if (!Array.isArray(catalog.data)
    || catalog.data.length !== 1
    || catalog.data[0]?.cwd !== workingDirectory
    || !Array.isArray(catalog.data[0].skills)
    || (catalog.errors?.length ?? 0) !== 0) {
    throw new Error("Codex Skill catalog did not match the Work directory");
  }

  const selections = names.map((name) => {
    const matches = catalog.data[0].skills.filter((skill) => skill?.name === name);
    if (matches.length !== 1) throw new Error(`Explicit Skill $${name} is missing or ambiguous`);
    const [skill] = matches;
    if (skill.enabled !== true) throw new Error(`Explicit Skill $${name} is disabled`);
    if (typeof skill.path !== "string" || !isAbsolute(skill.path) || basename(skill.path) !== "SKILL.md") {
      throw new Error(`Explicit Skill $${name} has no canonical SKILL.md path`);
    }
    return { name, path: skill.path };
  });

  const instructions = selections.map(({ name, path }) =>
    `Before any task operation, read the complete catalog-resolved Skill file for $${name} at ${JSON.stringify(path)} and follow it.`);
  return `${instructions.join("\n")}\n\n${objective}`;
}
