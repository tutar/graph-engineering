export const PRODUCT_VERSION = "0.3.0";
export const TASKS = Object.freeze({
  development: {
    workflow: "github-development-ticket.yml",
    profile: "github-development-ticket/current",
    requiredLabels: ["ready-for-agent", "development-ticket", "in-progress"],
  },
  "pr-review": {
    workflow: "github-pr-review.yml",
    profile: "github-pr-review/codex/current",
    requiredLabels: [],
  },
});

export const MANIFEST_PATH = ".github/graph-engineering/installation.json";
export const LEGACY_NAMESPACE = "loop-engineering";
export const CURRENT_NAMESPACE = "graph-engineering";
