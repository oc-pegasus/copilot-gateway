interface CooldownEntry {
  until: number;
}

const cooldowns = new Map<number, CooldownEntry>();

const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

export const markCooldown = (
  accountId: number,
  durationMs = DEFAULT_COOLDOWN_MS,
): void => {
  cooldowns.set(accountId, { until: Date.now() + durationMs });
};

export const isCoolingDown = (accountId: number): boolean => {
  const entry = cooldowns.get(accountId);
  if (!entry) return false;
  if (Date.now() >= entry.until) {
    cooldowns.delete(accountId);
    return false;
  }
  return true;
};

export const clearCooldown = (accountId: number): void => {
  cooldowns.delete(accountId);
};
