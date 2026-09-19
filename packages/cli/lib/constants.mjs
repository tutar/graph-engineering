export const PRODUCT_VERSION = "0.3.1";
export const TASKS = Object.freeze({
  coding: {
    workflow: "github-coding-task.yml",
    requiredLabels: ["ready-for-agent", "coding-ticket", "in-progress"],
  },
  development: {
    workflow: "github-development-ticket.yml",
    requiredLabels: ["ready-for-agent", "development-ticket", "in-progress"],
  },
});

export const MANIFEST_PATH = ".github/graph-engineering/installation.json";
export const LEGACY_NAMESPACE = "loop-engineering";
