import type { UserRole } from "./user";

export type Cashbook = {
  id: number;
  name: string;
  currency: "THB";
  description: string | null;
};

export type CashbookListItem = Cashbook & {
  role: UserRole;
  current_balance: string;
  active_period_id: number | null;
  status: "open" | "archived";
  archived_at: string | null;
};

export type CashbookCreate = {
  name: string;
  opening_amount: string;
  description?: string | null;
  template_cashbook_id?: number | null;
  member_user_ids?: number[];
  start_date?: string | null;
};

export type CashbookMemberUser = {
  id: number;
  username: string;
  display_name: string;
  is_active: boolean;
};

export type CashbookMembership = {
  id: number;
  role: UserRole;
  created_at: string;
  user: CashbookMemberUser;
};

export type CashbookMemberCandidate = {
  id: number;
  username: string;
  display_name: string;
};
