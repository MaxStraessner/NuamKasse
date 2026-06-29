export type UserRole = "admin" | "member";

export type User = {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  created_at?: string | null;
  last_login_at?: string | null;
};

export type UserCreateInput = {
  username: string;
  display_name: string;
  password: string;
  password_confirmation: string;
  role: UserRole;
};

export type UserUpdateInput = {
  username?: string;
  display_name?: string;
  role?: UserRole;
  is_active?: boolean;
};
