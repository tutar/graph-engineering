export const STOP_HOOK_WAIT_TIMEOUT_MS = 60_000;

export function shouldAwaitStopHooks({
  turnThreadId,
  goalThreadId,
  completedHookCount,
  configuredHookCount,
}) {
  return turnThreadId === goalThreadId && completedHookCount < configuredHookCount;
}

export function expireStopHookTimeouts(awaitingStopHooks, now = Date.now()) {
  const expired = [];
  for (const [turnId, deadline] of awaitingStopHooks) {
    if (deadline > now) continue;
    awaitingStopHooks.delete(turnId);
    expired.push(turnId);
  }
  return expired;
}
