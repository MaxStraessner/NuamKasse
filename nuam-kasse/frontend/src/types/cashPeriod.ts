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
};

export type CashPeriodSummary = {
  cash_period_id: number;
  name: string;
  opening_amount: string;
  spent_amount: string;
  income_amount: string;
  remaining_amount: string;
  currency: "THB";
  status: CashPeriodStatus;
  expense_count: number;
  active_expense_count: number;
  voided_expense_count: number;
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
