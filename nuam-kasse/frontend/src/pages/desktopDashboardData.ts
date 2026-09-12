import { decimalStringToMinorUnits } from "../services/money";
import type { CategorySummary, OverviewExpense } from "../types/overview";

export type TimelineBucket = {
  key: string;
  label: string;
  incomeMinor: number;
  expenseMinor: number;
};

export type CategoryDistributionItem = {
  key: string;
  label: string;
  amountMinor: number;
  bookingCount: number;
};

const DAY_IN_MILLISECONDS = 86_400_000;

function parseDate(value: string): Date | null {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatBucketLabel(value: Date, isWeekly: boolean): string {
  const formatted = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(value);
  return isWeekly ? `ab ${formatted}` : formatted;
}

export function buildTimelineBuckets(
  expenses: OverviewExpense[],
  startDate: string,
  endDate: string | null,
  now = new Date(),
): TimelineBucket[] {
  const start = parseDate(startDate);
  const requestedEnd = endDate ? parseDate(endDate) : now;
  if (!start || !requestedEnd) {
    return [];
  }
  const end = requestedEnd < start ? start : requestedEnd;
  const visibleExpenses = expenses.filter((expense) => !expense.is_voided && parseDate(expense.created_at));
  if (visibleExpenses.length === 0) {
    return [];
  }

  const dayCount = Math.floor((end.getTime() - start.getTime()) / DAY_IN_MILLISECONDS) + 1;
  const bucketSize = dayCount > 45 ? 7 : 1;
  const bucketCount = Math.max(1, Math.ceil(dayCount / bucketSize));
  const buckets = Array.from({ length: bucketCount }, (_, index): TimelineBucket => {
    const bucketStart = new Date(start.getTime() + index * bucketSize * DAY_IN_MILLISECONDS);
    return {
      key: dateKey(bucketStart),
      label: formatBucketLabel(bucketStart, bucketSize === 7),
      incomeMinor: 0,
      expenseMinor: 0,
    };
  });

  visibleExpenses.forEach((expense) => {
    const createdAt = parseDate(expense.created_at);
    const amountMinor = decimalStringToMinorUnits(expense.amount) ?? 0;
    if (!createdAt || createdAt < start || createdAt > end || amountMinor <= 0) {
      return;
    }
    const dayOffset = Math.floor((createdAt.getTime() - start.getTime()) / DAY_IN_MILLISECONDS);
    const bucket = buckets[Math.min(Math.floor(dayOffset / bucketSize), buckets.length - 1)];
    if (expense.transaction_type === "income") {
      bucket.incomeMinor += amountMinor;
    } else {
      bucket.expenseMinor += amountMinor;
    }
  });

  return buckets;
}

export function buildCategoryDistribution(
  categories: CategorySummary[],
  visibleItemCount = 5,
): CategoryDistributionItem[] {
  const expenseCategories = categories
    .filter((category) => category.category_type === "expense")
    .map((category) => ({
      key: String(category.category_id),
      label: category.category_name,
      amountMinor: decimalStringToMinorUnits(category.total_amount) ?? 0,
      bookingCount: category.expense_count,
    }))
    .filter((category) => category.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor || a.label.localeCompare(b.label, "de-DE"));

  if (expenseCategories.length <= visibleItemCount) {
    return expenseCategories;
  }

  const visible = expenseCategories.slice(0, visibleItemCount);
  const remainder = expenseCategories.slice(visibleItemCount).reduce(
    (summary, category) => ({
      ...summary,
      amountMinor: summary.amountMinor + category.amountMinor,
      bookingCount: summary.bookingCount + category.bookingCount,
    }),
    { key: "other", label: "Weitere", amountMinor: 0, bookingCount: 0 },
  );
  return [...visible, remainder];
}
