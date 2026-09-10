export type UserRole = "admin" | "member";
export type PeriodAccessMode = "all" | "selected" | "current_and_future";

export type UserCashbookAccess = {
  cashbook_id: number;
  cashbook_name: string;
  cashbook_role: UserRole;
  period_access_mode: PeriodAccessMode;
  period_access_from: string | null;
  accessible_period_ids: number[];
  accessible_period_count: number;
  available_period_count: number;
};

export type User = {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  cashbook_id?: number | null;
  cashbook_name?: string | null;
  cashbook_role?: UserRole | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at?: string | null;
  last_login_at?: string | null;
  cashbook_accesses?: UserCashbookAccess[];
  cashbook_count?: number;
  accessible_period_count?: number;
};

export type UserCashbookAccessInput = {
  cashbook_id: number;
  cashbook_role: UserRole;
  period_access_mode: PeriodAccessMode;
  period_ids: number[];
};

export type UserCreateInput = {
  username: string;
  display_name: string;
  password: string;
  password_confirmation: string;
  role: UserRole;
  is_active: boolean;
  cashbook_accesses: UserCashbookAccessInput[];
};

export type CashbookAccessOption = {
  id: number;
  name: string;
  periods: Array<{
    id: number;
    name: string;
    start_date: string;
    end_date: string | null;
    status: "active" | "closed";
  }>;
};

export type AdminAuditLog = {
  id: number;
  actor_user_id: number | null;
  actor_username: string | null;
  target_user_id: number | null;
  target_username: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type UserUpdateInput = {
  username?: string;
  display_name?: string;
  role?: UserRole;
  is_active?: boolean;
};
