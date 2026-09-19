export const DEFAULT_TOTAL_TOKEN_BUDGET = 400_000;
export const HANDOFF_TOKEN_BUDGET = 100_000;

export function splitTokenBudget(value = String(DEFAULT_TOTAL_TOKEN_BUDGET)) {
  if (value === "unlimited") {
    return {
      state: "unlimited",
      total: null,
      work: null,
      handoff: HANDOFF_TOKEN_BUDGET,
    };
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("token-budget must be an integer greater than 100000 or 'unlimited'");
  }
  const total = Number(value);
  if (!Number.isSafeInteger(total) || total <= HANDOFF_TOKEN_BUDGET) {
    throw new Error("token-budget must be an integer greater than 100000 or 'unlimited'");
  }
  return {
    state: "finite",
    total,
    work: total - HANDOFF_TOKEN_BUDGET,
    handoff: HANDOFF_TOKEN_BUDGET,
  };
}
