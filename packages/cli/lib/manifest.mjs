import { dirname, join } from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { MANIFEST_PATH, PRODUCT_VERSION } from "./constants.mjs";
import { exists, within } from "./files.mjs";

export async function readManifest(projectRoot) {
  const path = within(projectRoot, MANIFEST_PATH);
  if (!(await exists(path))) return null;
  const value = JSON.parse(await readFile(path, "utf8"));
  if (![1, 2].includes(value?.schemaVersion) || !value.installations || typeof value.installations !== "object" || Array.isArray(value.installations)) {
    throw new Error(`${MANIFEST_PATH} is not a recognized Graph Engineering installation manifest`);
  }
  return value;
}

export function nextManifest(records, files) {
  return {
    schemaVersion: 2,
    product: "@tutar/graph-engineering",
    productVersion: PRODUCT_VERSION,
    delivery: "workflow",
    files,
    installations: Object.fromEntries(records.map((record) => [record.task, record])),
  };
}

export async function replaceManifest(projectRoot, value) {
  const path = within(projectRoot, MANIFEST_PATH);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  try { await rename(temporary, path); } catch (error) { await rm(temporary, { force: true }); throw error; }
}
