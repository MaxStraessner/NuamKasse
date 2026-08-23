import type { UserRole } from "./user";

export type Cashbook = {
  id: number;
  name: string;
  currency: "THB";
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
