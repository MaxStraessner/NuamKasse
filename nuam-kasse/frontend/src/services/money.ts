export function formatThaiBaht(amount: string, currency = "THB"): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return "ungültiger Betrag";
  }

  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericAmount);
}

export function decimalStringToMinorUnits(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }
  const [majorPart, minorPart = ""] = normalized.split(".");
  const major = Number(majorPart);
  if (!Number.isSafeInteger(major)) {
    return null;
  }
  const paddedMinor = `${minorPart}00`.slice(0, 2);
  const minor = Number(paddedMinor);
  if (!Number.isSafeInteger(minor)) {
    return null;
  }
  return major * 100 + minor;
}

export function minorUnitsToDecimalString(value: number): string {
  const safeValue = Math.max(0, Math.trunc(value));
  const major = Math.floor(safeValue / 100);
  const minor = String(safeValue % 100).padStart(2, "0");
  return `${major}.${minor}`;
}

export function normalizeMoneyInput(value: string): string {
  const minorUnits = decimalStringToMinorUnits(value);
  if (minorUnits === null) {
    return value.trim().replace(",", ".");
  }
  return minorUnitsToDecimalString(minorUnits);
}

export function normalizeAmountInput(value: string): string {
  return normalizeMoneyInput(value);
}
