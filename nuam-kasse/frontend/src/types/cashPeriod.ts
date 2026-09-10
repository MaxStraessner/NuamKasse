export type CashPeriodStatus = "active" | "closed";

export type CashPeriodUser = {
  id: number;
  display_name: string;
};

export type CashPeriod = {
  id: number;
  name: string;
  opening_amount: string;
  currency: "THB";
  start_date: string;
  end_date: string | null;
  status: CashPeriodStatus;
  created_by: CashPeriodUser;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_by: CashPeriodUser | null;
  closed_opening_amount?: string | null;
  closed_income_amount?: string | null;
  closed_expense_amount?: string | null;
  closed_balance_amount?: string | null;
  closed_booking_count?: number | null;
};

export type CashPeriodSummary = {
  cash_period_id: number;
  name: string;
  opening_amount: string;
  spent_amount: string;
  income_amount: string;
  net_amount: string;
  remaining_amount: string;
  currency: "THB";
  status: CashPeriodStatus;
  expense_count: number;
  active_expense_count: number;
  voided_expense_count: number;
};

export type CashPeriodArchiveItem = CashPeriod & {
  income_amount: string;
  spent_amount: string;
  net_amount: string;
  remaining_amount: string;
  transaction_count: number;
};

export type CashPeriodCloseResult = {
  closed_period: CashPeriod;
  summary: CashPeriodSummary;
};

export type CashPeriodCreate = {
  name: string;
  opening_amount: string;
  currency: "THB";
  start_date: string;
  end_date?: string | null;
};

export type CashPeriodUpdate = Partial<{
  name: string;
  opening_amount: string;
  start_date: string;
  end_date: string | null;
}>;
