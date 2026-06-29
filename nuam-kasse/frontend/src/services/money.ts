export function formatThaiBaht(amount: string, currency = "THB"): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return "ungueltiger Betrag";
  }

  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericAmount);
}

export function normalizeAmountInput(value: string): string {
  return value.trim().replace(",", ".");
}
