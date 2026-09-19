const TERMINAL_GOAL_STATUSES = new Set([
  "complete",
  "blocked",
  "budgetLimited",
  "usageLimited",
]);

export function isTerminalGoalStatus(status) {
  return TERMINAL_GOAL_STATUSES.has(status);
}
