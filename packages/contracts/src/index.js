export const financialAccountTypes = new Set(["cash", "card", "bank"]);

export function isCurrency(value) {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

export function isPositiveMinorAmount(value) {
  return Number.isSafeInteger(value) && value > 0;
}
