export const PRODUCT_VERSION = "0.3.1";
export const TASKS = Object.freeze({
  development: {
    workflow: "github-development-ticket.yml",
    profile: "github-development-ticket/codex/v0.2.0",
    requiredLabels: ["ready-for-agent", "development-ticket", "in-progress"],
  },
});

export const MANIFEST_PATH = ".github/graph-engineering/installation.json";
export const LEGACY_NAMESPACE = "loop-engineering";
export const CURRENT_NAMESPACE = "graph-engineering";
