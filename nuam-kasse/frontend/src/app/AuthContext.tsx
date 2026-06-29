import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { ApiError } from "../services/apiClient";
import {
  changePassword as changePasswordRequest,
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  type ChangePasswordInput,
  type LoginInput,
} from "../services/authApi";
import type { User } from "../types/user";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  refreshUser: () => Promise<User | null>;
  login: (input: LoginInput) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      setError(null);
      return currentUser;
    } catch (err) {
      setUser(null);
      if (!isAuthError(err)) {
        setError(err instanceof Error ? err.message : "Sitzung konnte nicht geprueft werden.");
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (input: LoginInput) => {
    const loggedInUser = await loginRequest(input);
    setUser(loggedInUser);
    setError(null);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
    }
  }, []);

  const changePassword = useCallback(
    async (input: ChangePasswordInput) => {
      await changePasswordRequest(input);
      await refreshUser();
    },
    [refreshUser],
  );

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      error,
      refreshUser,
      login,
      logout,
      changePassword,
    }),
    [changePassword, error, isLoading, login, logout, refreshUser, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
