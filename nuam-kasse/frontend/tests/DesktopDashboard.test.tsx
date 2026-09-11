import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { App } from "../src/App";
import type { CashPeriodArchiveItem } from "../src/types/cashPeriod";
import type { CashPeriodOverview, OverviewExpense } from "../src/types/overview";
import type { User } from "../src/types/user";

const memberUser = {
  id: 2,
  username: "nuam",
  display_name: "Nuam",
  role: "member" as const,
  cashbook_id: 1,
  cashbook_name: "Nuam Kasse",
  cashbook_role: "member" as const,
  is_active: true,
  must_change_password: false,
};

const adminUser = {
  ...memberUser,
  id: 1,
  username: "admin",
  display_name: "Papa",
  role: "admin" as const,
  cashbook_role: "admin" as const,
};

const activePeriod: CashPeriodArchiveItem = {
  id: 1,
  name: "September 2026",
  opening_amount: "20000.00",
  currency: "THB",
  start_date: "2026-09-01",
  end_date: null,
  status: "active",
  created_by: { id: 1, display_name: "Papa" },
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
  closed_at: null,
  closed_by: null,
  income_amount: "1200.00",
  spent_amount: "450.00",
  net_amount: "750.00",
  remaining_amount: "20750.00",
  transaction_count: 3,
};

const expenses: OverviewExpense[] = [
  {
    id: 1,
    cash_period_id: 1,
    category: { id: 10, name: "Essen", icon_key: "utensils", color_key: "orange", parent_category_id: null, category_type: "expense" },
    amount: "450.00",
    transaction_type: "expense",
    currency: "THB",
    created_by: { id: 2, display_name: "Nuam" },
    created_at: "2026-09-02T10:00:00Z",
    is_voided: false,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    note: null,
  },
  {
    id: 2,
    cash_period_id: 1,
    category: { id: 11, name: "Einzahlung", icon_key: "landmark", color_key: "green", parent_category_id: null, category_type: "income" },
    amount: "1200.00",
    transaction_type: "income",
    currency: "THB",
    created_by: { id: 1, display_name: "Papa" },
    created_at: "2026-09-03T10:00:00Z",
    is_voided: false,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    note: null,
  },
];

const overview: CashPeriodOverview = {
  summary: {
    cash_period: {
      id: 1,
      name: activePeriod.name,
      status: "active",
      start_date: activePeriod.start_date,
      end_date: null,
      currency: "THB",
    },
    opening_amount: activePeriod.opening_amount,
    spent_amount: activePeriod.spent_amount,
    income_amount: activePeriod.income_amount,
    remaining_amount: activePeriod.remaining_amount,
    expense_count: 3,
    active_expense_count: 3,
    voided_expense_count: 0,
  },
  categories: [
    { category_id: 10, category_name: "Essen", icon_key: "utensils", color_key: "orange", category_type: "expense", expense_count: 1, total_amount: "450.00", percentage_of_spending: "100.00" },
    { category_id: 11, category_name: "Einzahlung", icon_key: "landmark", color_key: "green", category_type: "income", expense_count: 2, total_amount: "1200.00", percentage_of_spending: "100.00" },
  ],
  users: [],
  recent_expenses: expenses,
};

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

function installDesktopViewport() {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList)));
}

function mockDashboard(user: User = memberUser, currentOverview = overview, currentExpenses = expenses) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return jsonResponse(user);
    if (url.endsWith("/overview/current")) return jsonResponse(currentOverview);
    if (url.includes("/overview/cash-periods/1/expenses")) {
      return jsonResponse({ items: currentExpenses, total: currentExpenses.length, limit: 100, offset: 0, has_more: false });
    }
    if (url.endsWith("/cash-periods/current")) return jsonResponse(activePeriod);
    if (url.endsWith("/cash-periods/current/summary")) return jsonResponse({ ...currentOverview.summary, cash_period_id: 1, name: activePeriod.name, net_amount: "750.00", status: "active" });
    if (url.endsWith("/cash-periods")) return jsonResponse([activePeriod]);
    if (url.endsWith("/categories")) return jsonResponse([]);
    if (url.endsWith("/health")) return jsonResponse({ status: "ok", database: "connected", app: "Nuam Kasse", version: "0.7.0" });
    return jsonResponse({});
  }));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Desktop dashboard", () => {
  test("shows current metrics, both charts, periods, and member-safe navigation", async () => {
    installDesktopViewport();
    mockDashboard();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Willkommen, Nuam" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Kennzahlen der aktuellen Kassenperiode")).toHaveTextContent("Einnahmen");
    expect(screen.getByLabelText("Kennzahlen der aktuellen Kassenperiode")).toHaveTextContent("1,200.00");
    expect(screen.getByRole("img", { name: "Einnahmen und Ausgaben im Zeitverlauf" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Ausgaben nach Kategorien/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Periodenübersicht" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Desktop-Hauptnavigation" })).toHaveTextContent("Buchen");
    expect(screen.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Kategorien" })).not.toBeInTheDocument();
  });

  test("admin receives only the already authorized administration links", async () => {
    installDesktopViewport();
    mockDashboard(adminUser);
    render(<App />);

    expect(await screen.findByRole("link", { name: "Administration" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kategorien" })).toBeInTheDocument();
  });

  test("empty charts render explanatory states without broken graphics", async () => {
    installDesktopViewport();
    mockDashboard(memberUser, {
      ...overview,
      summary: { ...overview.summary, spent_amount: "0.00", income_amount: "0.00", active_expense_count: 0 },
      categories: [],
      recent_expenses: [],
    }, []);
    render(<App />);

    expect(await screen.findByText("Noch keine Buchungen in dieser Kassenperiode.")).toBeInTheDocument();
    expect(screen.getByText("Noch keine Ausgaben für die Kategorienverteilung.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Einnahmen und Ausgaben im Zeitverlauf" })).not.toBeInTheDocument();
  });

  test("switching to mobile at desktop width restores the unchanged category start page", async () => {
    installDesktopViewport();
    mockDashboard();
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: "Einstellungen" }));
    fireEvent.click(screen.getByRole("radio", { name: "Mobil" }));
    expect(window.localStorage.getItem("nuam-kasse:display-mode")).toBe("mobile");
    fireEvent.click(screen.getByRole("link", { name: "Start" }));

    expect(await screen.findByText("Kategorien")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Willkommen/ })).not.toBeInTheDocument();
  });
});
