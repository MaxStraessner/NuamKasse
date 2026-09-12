import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { App } from "../src/App";
import type { CashPeriodArchiveItem, CashPeriodSummary } from "../src/types/cashPeriod";
import type { Category } from "../src/types/category";
import type { Expense, ExpenseMutationResponse } from "../src/types/expense";
import type { CashPeriodOverview, OverviewExpense } from "../src/types/overview";
import type { User } from "../src/types/user";

const adminUser: User = {
  id: 1,
  username: "admin",
  display_name: "Papa",
  role: "admin",
  cashbook_id: 1,
  cashbook_name: "Nuam Kasse",
  cashbook_role: "admin",
  is_active: true,
  must_change_password: false,
};

const categories: Category[] = [
  { id: 10, user_id: null, name: "Lebenshaltung", icon_key: "shopping-cart", color_key: "orange", category_type: "expense", parent_category_id: null, sort_order: 1, is_active: true, archived_at: null, has_custom_image: true, image_url: "/api/v1/categories/10/image?v=1", created_at: "2026-09-01T08:00:00Z", updated_at: "2026-09-01T08:00:00Z" },
  { id: 11, user_id: null, name: "Obst", icon_key: "utensils", color_key: "green", category_type: "expense", parent_category_id: 10, sort_order: 1, is_active: true, archived_at: null, created_at: "2026-09-01T08:00:00Z", updated_at: "2026-09-01T08:00:00Z" },
  { id: 20, user_id: null, name: "Einzahlung", icon_key: "landmark", color_key: "blue", category_type: "income", parent_category_id: null, sort_order: 2, is_active: true, archived_at: null, created_at: "2026-09-01T08:00:00Z", updated_at: "2026-09-01T08:00:00Z" },
];

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
  transaction_count: 2,
};

const closedPeriod: CashPeriodArchiveItem = {
  ...activePeriod,
  id: 2,
  name: "August 2026",
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  status: "closed",
  closed_at: "2026-08-31T18:00:00Z",
  closed_by: { id: 1, display_name: "Papa" },
};

const cashSummary: CashPeriodSummary = {
  cash_period_id: 1,
  name: activePeriod.name,
  opening_amount: activePeriod.opening_amount,
  spent_amount: activePeriod.spent_amount,
  income_amount: activePeriod.income_amount,
  net_amount: activePeriod.net_amount,
  remaining_amount: activePeriod.remaining_amount,
  currency: "THB",
  status: "active",
  expense_count: 2,
  active_expense_count: 2,
  voided_expense_count: 0,
};

const expenses: OverviewExpense[] = [
  { id: 1, cash_period_id: 1, category: { id: 11, name: "Obst", icon_key: "utensils", color_key: "green", parent_category_id: 10, category_type: "expense" }, amount: "450.00", transaction_type: "expense", currency: "THB", created_by: { id: 2, display_name: "Nuam" }, created_at: "2026-09-02T10:00:00Z", is_voided: false, voided_at: null, voided_by: null, void_reason: null, note: "Markt" },
  { id: 2, cash_period_id: 1, category: { id: 20, name: "Einzahlung", icon_key: "landmark", color_key: "blue", parent_category_id: null, category_type: "income" }, amount: "1200.00", transaction_type: "income", currency: "THB", created_by: { id: 1, display_name: "Papa" }, created_at: "2026-09-03T10:00:00Z", is_voided: false, voided_at: null, voided_by: null, void_reason: null, note: null },
];

const bookedExpense: Expense = {
  ...expenses[0],
  category: { id: 11, name: "Obst", icon_key: "utensils", color_key: "green", parent_category_id: 10, category_type: "expense" },
};

const overview: CashPeriodOverview = {
  summary: {
    cash_period: { id: 1, name: activePeriod.name, status: "active", start_date: activePeriod.start_date, end_date: null, currency: "THB" },
    opening_amount: activePeriod.opening_amount,
    spent_amount: activePeriod.spent_amount,
    income_amount: activePeriod.income_amount,
    remaining_amount: activePeriod.remaining_amount,
    expense_count: 2,
    active_expense_count: 2,
    voided_expense_count: 0,
  },
  categories: [
    { category_id: 10, category_name: "Lebenshaltung", icon_key: "shopping-cart", color_key: "orange", category_type: "expense", expense_count: 1, total_amount: "450.00", percentage_of_spending: "100.00" },
    { category_id: 20, category_name: "Einzahlung", icon_key: "landmark", color_key: "blue", category_type: "income", expense_count: 1, total_amount: "1200.00", percentage_of_spending: "100.00" },
  ],
  users: [
    { user_id: 1, display_name: "Papa", expense_count: 1, total_amount: "1200.00", percentage_of_spending: "72.73" },
    { user_id: 2, display_name: "Nuam", expense_count: 1, total_amount: "450.00", percentage_of_spending: "27.27" },
  ],
  recent_expenses: expenses,
};

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => data, blob: async () => new Blob() } as Response);
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

function installApiMock() {
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.endsWith("/auth/me")) return jsonResponse(adminUser);
    if (url.endsWith("/health")) return jsonResponse({ status: "ok", database: "connected", app: "Nuam Kasse", version: "0.7.0" });
    if (url.endsWith("/categories/catalog")) return jsonResponse({ icons: [], colors: [] });
    if (url.includes("/categories")) return jsonResponse(categories);
    if (url.endsWith("/cash-periods/current/summary")) return jsonResponse(cashSummary);
    if (url.endsWith("/cash-periods/current")) return jsonResponse(activePeriod);
    if (url.endsWith("/cash-periods")) return jsonResponse([activePeriod, closedPeriod]);
    if (url.endsWith("/overview/current")) return jsonResponse(overview);
    if (url.includes("/overview/cash-periods/1/expenses")) return jsonResponse({ items: expenses, total: expenses.length, limit: 20, offset: 0, has_more: false });
    if (url.endsWith("/expenses") && method === "POST") {
      const result: ExpenseMutationResponse = { expense: bookedExpense, summary: cashSummary };
      return jsonResponse(result);
    }
    return jsonResponse({});
  }));
  return requests;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Desktop core views", () => {
  test("books through the shared category and validation flow without a mobile dialog", async () => {
    installDesktopViewport();
    const requests = installApiMock();
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: "Buchen" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Buchen" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Kategorie Lebenshaltung" }));
    expect(screen.getByRole("heading", { name: "Lebenshaltung" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kategorie Obst" }));
    expect(screen.getByRole("heading", { name: "Ausgabe" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Betrag" }), { target: { value: "125,50" } });
    fireEvent.change(screen.getByPlaceholderText("Kurze Beschreibung"), { target: { value: "Markt" } });
    fireEvent.click(screen.getByRole("button", { name: "Bestätigen" }));

    await waitFor(() => expect(requests.some((request) => request.url.endsWith("/expenses") && request.method === "POST" && request.body?.includes('"category_id":11'))).toBe(true));
  });

  test("renders existing filters and both transaction types in a desktop table", async () => {
    installDesktopViewport();
    installApiMock();
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: "Buchungen" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Buchungen" })).toBeInTheDocument();
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Datum" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Beschreibung" })).toBeInTheDocument();
    expect(within(table).getByText("Markt")).toBeInTheDocument();
    expect(within(table).getByText("Einnahme")).toBeInTheDocument();
    expect(within(table).getByText("Ausgabe")).toBeInTheDocument();
    expect(screen.getByLabelText("Buchungen filtern")).toBeInTheDocument();
  });

  test("keeps category order and exposes the existing management actions", async () => {
    installDesktopViewport();
    installApiMock();
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: "Kategorien" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Kategorien" })).toBeInTheDocument();
    const overviewRegion = screen.getByRole("region", { name: "Oberkategorien" });
    const categoryButtons = within(overviewRegion).getAllByRole("button", { name: /Kategorie .+ auswählen/ });
    expect(categoryButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Kategorie Lebenshaltung auswählen",
      "Kategorie Einzahlung auswählen",
    ]);
    expect(screen.getByText("Eigenes Bild")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Bearbeiten" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Kategorie Obst nach oben verschieben" })).toBeInTheDocument();
  });

  test("keeps period closing off the dashboard and inside period administration", async () => {
    installDesktopViewport();
    installApiMock();
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: "Übersicht" }));
    expect(await screen.findByRole("heading", { name: "Willkommen, Papa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kasse abschließen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Kasse abschließen" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Kassenperioden" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Kassenperioden" })).toBeInTheDocument();
    expect(screen.getByLabelText("Kennzahlen der aktuellen Periode")).toHaveTextContent("20,750.00");
    expect(screen.getByRole("button", { name: "Kasse abschließen" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Periodenübersicht" })).toBeInTheDocument();
  });
});
