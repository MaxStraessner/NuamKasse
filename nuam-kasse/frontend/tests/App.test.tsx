import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { App } from "../src/App";
import type { CashPeriod, CashPeriodSummary } from "../src/types/cashPeriod";
import type { Expense } from "../src/types/expense";
import type { CashPeriodOverview, OverviewExpense, PaginatedOverviewExpenses } from "../src/types/overview";

const memberUser = {
  id: 2,
  username: "nuam",
  display_name: "Nuam",
  role: "member",
  is_active: true,
  must_change_password: false,
};

const adminUser = {
  id: 1,
  username: "admin",
  display_name: "Papa",
  role: "admin",
  is_active: true,
  must_change_password: false,
};

const essenCategory = {
  id: 1,
  user_id: memberUser.id,
  name: "Essen",
  icon_key: "utensils",
  color_key: "orange",
  parent_category_id: null,
  sort_order: 1,
  is_active: true,
  archived_at: null,
  created_at: "2026-06-29T12:00:00Z",
  updated_at: "2026-06-29T12:00:00Z",
};

const bankCategory = {
  id: 2,
  user_id: memberUser.id,
  name: "Bank",
  icon_key: "landmark",
  color_key: "blue",
  parent_category_id: null,
  sort_order: 2,
  is_active: true,
  archived_at: null,
  created_at: "2026-06-29T12:00:00Z",
  updated_at: "2026-06-29T12:00:00Z",
};

const apothekeCategory = {
  id: 3,
  user_id: memberUser.id,
  name: "Apotheke",
  icon_key: "pill",
  color_key: "red",
  parent_category_id: essenCategory.id,
  sort_order: 1,
  is_active: true,
  archived_at: null,
  created_at: "2026-06-29T12:00:00Z",
  updated_at: "2026-06-29T12:00:00Z",
};

const categoryCatalog = {
  icons: [
    { key: "utensils", label: "Essen" },
    { key: "shopping-cart", label: "Einkauf" },
    { key: "landmark", label: "Bank" },
    { key: "circle-ellipsis", label: "Sonstiges" },
  ],
  colors: [
    { key: "orange", label: "Orange" },
    { key: "green", label: "Grün" },
    { key: "blue", label: "Blau" },
    { key: "gray", label: "Grau" },
  ],
};

const activeCashPeriod: CashPeriod = {
  id: 1,
  name: "Juli 2026",
  opening_amount: "20000.00",
  currency: "THB",
  start_date: "2026-07-01",
  end_date: null,
  status: "active",
  created_by: { id: 1, display_name: "Papa" },
  created_at: "2026-06-29T12:00:00Z",
  updated_at: "2026-06-29T12:00:00Z",
  closed_at: null,
  closed_by: null,
};

const closedCashPeriod: CashPeriod = {
  ...activeCashPeriod,
  id: 2,
  name: "Juni 2026",
  status: "closed",
  start_date: "2026-06-01",
  end_date: "2026-06-30",
  closed_at: "2026-06-30T12:00:00Z",
  closed_by: { id: 1, display_name: "Papa" },
};

const activeCashSummary: CashPeriodSummary = {
  cash_period_id: 1,
  name: "Juli 2026",
  opening_amount: "20000.00",
  spent_amount: "0.00",
  remaining_amount: "20000.00",
  currency: "THB",
  status: "active",
  expense_count: 0,
  active_expense_count: 0,
  voided_expense_count: 0,
};

const spentCashSummary: CashPeriodSummary = {
  ...activeCashSummary,
  spent_amount: "250.00",
  remaining_amount: "19750.00",
  expense_count: 1,
  active_expense_count: 1,
};

const essenExpense: Expense = {
  id: 1,
  cash_period_id: 1,
  category: {
    id: essenCategory.id,
    name: essenCategory.name,
    icon_key: "utensils",
    color_key: "orange",
    parent_category_id: null,
  },
  amount: "250.00",
  currency: "THB",
  created_by: { id: memberUser.id, display_name: memberUser.display_name },
  created_at: "2026-07-03T12:25:00Z",
  is_voided: false,
  voided_at: null,
  voided_by: null,
  void_reason: null,
};

const adminExpense: Expense = {
  ...essenExpense,
  id: 2,
  amount: "100.00",
  created_by: { id: adminUser.id, display_name: adminUser.display_name },
};

const overviewExpense = {
  id: 11,
  cash_period_id: 1,
  category: {
    id: essenCategory.id,
    name: essenCategory.name,
    icon_key: essenCategory.icon_key,
    color_key: essenCategory.color_key,
    parent_category_id: null,
  },
  amount: "250.00",
  currency: "THB",
  created_by: { id: memberUser.id, display_name: memberUser.display_name },
  created_at: "2026-07-03T12:25:00Z",
  is_voided: false,
  voided_at: null,
  voided_by: null,
  void_reason: null,
} satisfies CashPeriodOverview["recent_expenses"][number];

const voidedOverviewExpense = {
  ...overviewExpense,
  id: 12,
  is_voided: true,
  voided_at: "2026-07-03T13:00:00Z",
  voided_by: { id: adminUser.id, display_name: adminUser.display_name },
  void_reason: "Doppelt",
} satisfies CashPeriodOverview["recent_expenses"][number];

const currentOverview: CashPeriodOverview = {
  summary: {
    cash_period: {
      id: activeCashPeriod.id,
      name: activeCashPeriod.name,
      status: activeCashPeriod.status,
      start_date: activeCashPeriod.start_date,
      end_date: activeCashPeriod.end_date,
      currency: activeCashPeriod.currency,
    },
    opening_amount: "20000.00",
    spent_amount: "400.00",
    remaining_amount: "19600.00",
    expense_count: 3,
    active_expense_count: 2,
    voided_expense_count: 1,
  },
  categories: [
    {
      category_id: essenCategory.id,
      category_name: essenCategory.name,
      icon_key: essenCategory.icon_key,
      color_key: essenCategory.color_key,
      expense_count: 1,
      total_amount: "250.00",
      percentage_of_spending: "62.50",
    },
    {
      category_id: bankCategory.id,
      category_name: bankCategory.name,
      icon_key: bankCategory.icon_key,
      color_key: bankCategory.color_key,
      expense_count: 1,
      total_amount: "150.00",
      percentage_of_spending: "37.50",
    },
  ],
  users: [
    {
      user_id: memberUser.id,
      display_name: memberUser.display_name,
      expense_count: 1,
      total_amount: "250.00",
      percentage_of_spending: "62.50",
    },
    {
      user_id: adminUser.id,
      display_name: adminUser.display_name,
      expense_count: 1,
      total_amount: "150.00",
      percentage_of_spending: "37.50",
    },
  ],
  recent_expenses: [overviewExpense],
};

const closedOverview: CashPeriodOverview = {
  ...currentOverview,
  summary: {
    ...currentOverview.summary,
    cash_period: {
      id: closedCashPeriod.id,
      name: closedCashPeriod.name,
      status: closedCashPeriod.status,
      start_date: closedCashPeriod.start_date,
      end_date: closedCashPeriod.end_date,
      currency: closedCashPeriod.currency,
    },
  },
  recent_expenses: [voidedOverviewExpense],
};

function overviewPage(items: OverviewExpense[] = [overviewExpense], hasMore = false): PaginatedOverviewExpenses {
  return {
    items,
    total: hasMore ? items.length + 1 : items.length,
    limit: 20,
    offset: 0,
    has_more: hasMore,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

function mockFetch(handler: (url: string, options?: RequestInit) => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return healthResponse();
      }
      return handler(url, options);
    }),
  );
}

function healthResponse() {
  return jsonResponse({ status: "ok", database: "connected", app: "Nuam Kasse", version: "0.6.0" });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("App authentication", () => {
  test("shows the login page for unauthenticated users", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse({ detail: "Eine Anmeldung ist erforderlich." }, 401);
      }
      return jsonResponse({});
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Nuam Kasse" })).toBeInTheDocument();
    expect(screen.getByLabelText("Benutzername")).toBeInTheDocument();
    expect(screen.getByLabelText("Passwort")).toBeInTheDocument();
  });

  test("logs in with valid credentials and opens the app", async () => {
    mockFetch((url, options) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse({ detail: "Eine Anmeldung ist erforderlich." }, 401);
      }
      if (url.endsWith("/auth/login") && options?.method === "POST") {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      if (url.endsWith("/health")) {
        return healthResponse();
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Benutzername"), {
      target: { value: "nuam" },
    });
    fireEvent.change(screen.getByLabelText("Passwort"), {
      target: { value: "secret-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByText("Hallo, Nuam")).toBeInTheDocument();
    expect(screen.getByText("Aktuelle Kasse")).toBeInTheDocument();
  });

  test("shows an error for invalid login", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse({ detail: "Eine Anmeldung ist erforderlich." }, 401);
      }
      if (url.endsWith("/auth/login")) {
        return jsonResponse({ detail: "Benutzername oder Passwort ist nicht korrekt." }, 401);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Benutzername"), {
      target: { value: "nuam" },
    });
    fireEvent.change(screen.getByLabelText("Passwort"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Benutzername oder Passwort ist nicht korrekt.",
    );
  });

  test("valid session opens the app and logout works", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/auth/logout")) {
        return jsonResponse({ message: "Abgemeldet." });
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      if (url.endsWith("/health")) {
        return healthResponse();
      }
      return jsonResponse({});
    });

    render(<App />);

    expect(await screen.findByText("Hallo, Nuam")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));

    await waitFor(() => expect(screen.getByLabelText("Benutzername")).toBeInTheDocument());
  });

  test("admin sees user management and can create a user", async () => {
    mockFetch((url, options) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(adminUser);
      }
      if (url.endsWith("/users") && (!options?.method || options.method === "GET")) {
        return jsonResponse([adminUser]);
      }
      if (url.endsWith("/users") && options?.method === "POST") {
        return jsonResponse({ ...memberUser, must_change_password: true }, 201);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Einstellungen/i }));
    fireEvent.click(await screen.findByRole("link", { name: "Benutzerverwaltung" }));
    expect(await screen.findByRole("heading", { name: "Benutzer" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Benutzername"), { target: { value: "nuam" } });
    fireEvent.change(screen.getByLabelText("Anzeigename"), { target: { value: "Nuam" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "temp-pass-123" } });
    fireEvent.change(screen.getByLabelText("Passwort wiederholen"), {
      target: { value: "temp-pass-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Benutzer anlegen" }));

    expect(await screen.findByText(/Benutzer wurde angelegt/)).toBeInTheDocument();
    expect(screen.getByText("Nuam")).toBeInTheDocument();
  });

  test("member can see category management but not user management", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Einstellungen/i }));
    expect(await screen.findByRole("heading", { name: "Einstellungen" })).toBeInTheDocument();
    expect(screen.queryByText("Benutzerverwaltung")).not.toBeInTheDocument();
    expect(screen.getByText("Kategorieverwaltung")).toBeInTheDocument();
  });

  test("user with required password change is redirected and can change password", async () => {
    const forcedUser = { ...memberUser, must_change_password: true };
    let changed = false;
    mockFetch((url, options) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(changed ? memberUser : forcedUser);
      }
      if (url.endsWith("/auth/change-password") && options?.method === "POST") {
        changed = true;
        return jsonResponse({ message: "Passwort wurde geändert." });
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      if (url.endsWith("/health")) {
        return healthResponse();
      }
      return jsonResponse({});
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Passwort ändern" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Bisheriges Passwort"), {
      target: { value: "temp-pass-123" },
    });
    fireEvent.change(screen.getByLabelText("Neues Passwort"), {
      target: { value: "new-pass-123" },
    });
    fireEvent.change(screen.getByLabelText("Neues Passwort wiederholen"), {
      target: { value: "new-pass-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));

    expect(await screen.findByText("Aktuelle Kasse")).toBeInTheDocument();
  });
});

describe("Categories", () => {
  test("shows categories on the home page with controlled colors", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory, bankCategory]);
      }
      if (url.endsWith("/health")) {
        return healthResponse();
      }
      return jsonResponse({});
    });

    render(<App />);

    const essen = await screen.findByLabelText("Kategorie Essen");
    expect(essen).toBeInTheDocument();
    expect(essen).toHaveAttribute("data-category-color", "orange");
    expect(screen.getByLabelText("Kategorie Bank")).toHaveAttribute("data-category-color", "blue");
  });

  test("shows category loading state", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/categories")) {
        return new Promise<Response>(() => undefined);
      }
      if (url.endsWith("/health")) {
        return healthResponse();
      }
      return jsonResponse({});
    });

    render(<App />);

    expect(await screen.findByLabelText("Kategorien werden geladen")).toBeInTheDocument();
  });

  test("shows category error, retry, and empty states", async () => {
    let categoryCalls = 0;
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(adminUser);
      }
      if (url.endsWith("/categories")) {
        categoryCalls += 1;
        if (categoryCalls === 1) {
          return jsonResponse({ detail: "Kategorien konnten nicht geladen werden." }, 500);
        }
        return jsonResponse([]);
      }
      if (url.endsWith("/health")) {
        return healthResponse();
      }
      return jsonResponse({});
    });

    render(<App />);

    expect(await screen.findByText("Kategorien konnten nicht geladen werden.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Erneut laden" }));

    expect(await screen.findByText("Noch keine Kategorien vorhanden. Lege in den Einstellungen eine Kategorie an.")).toBeInTheDocument();
  });

  test("admin can create a category from catalog choices", async () => {
    let categories = [essenCategory];
    mockFetch((url, options) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(adminUser);
      }
      if (url.endsWith("/categories/catalog")) {
        return jsonResponse(categoryCatalog);
      }
      if (url.includes("/categories?include_inactive=true") && options?.method === "GET") {
        return jsonResponse(categories);
      }
      if (url.endsWith("/categories") && options?.method === "GET") {
        return jsonResponse(categories.filter((category) => category.is_active));
      }
      if (url.endsWith("/categories") && options?.method === "POST") {
        const created = {
          ...bankCategory,
          id: 3,
          name: "Einkauf",
          icon_key: "shopping-cart",
          color_key: "green",
          sort_order: 2,
        };
        categories = [...categories, created];
        return jsonResponse(created, 201);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Einstellungen/i }));
    fireEvent.click(await screen.findByRole("link", { name: "Kategorieverwaltung" }));
    expect(await screen.findByRole("heading", { name: "Kategorien" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Kategoriename"), { target: { value: "Einkauf" } });
    fireEvent.click(screen.getByRole("button", { name: "Symbol Einkauf" }));
    fireEvent.click(screen.getByRole("button", { name: "Farbe Grün" }));
    fireEvent.click(screen.getByRole("button", { name: "Kategorie anlegen" }));

    expect(await screen.findByText("Kategorie wurde angelegt.")).toBeInTheDocument();
    expect(screen.getAllByText("Einkauf").length).toBeGreaterThan(0);
  });

  test("admin can edit, deactivate, reactivate, and reorder categories", async () => {
    let categories = [essenCategory, bankCategory];
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    mockFetch((url, options) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(adminUser);
      }
      if (url.endsWith("/categories/catalog")) {
        return jsonResponse(categoryCatalog);
      }
      if (url.includes("/categories?include_inactive=true") && options?.method === "GET") {
        return jsonResponse(categories);
      }
      if (url.endsWith("/categories") && options?.method === "GET") {
        return jsonResponse(categories.filter((category) => category.is_active));
      }
      if (url.includes("/categories/1") && options?.method === "PATCH") {
        const patch = JSON.parse(String(options.body)) as Partial<typeof essenCategory>;
        categories = categories.map((category) =>
          category.id === 1 ? { ...category, ...patch, updated_at: "2026-06-29T13:00:00Z" } : category,
        );
        return jsonResponse(categories[0]);
      }
      if (url.endsWith("/categories/reorder") && options?.method === "PUT") {
        const payload = JSON.parse(String(options.body)) as { category_ids: number[] };
        categories = payload.category_ids.map((id, index) => ({
          ...categories.find((category) => category.id === id)!,
          sort_order: index + 1,
        }));
        return jsonResponse(categories);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Einstellungen/i }));
    fireEvent.click(await screen.findByRole("link", { name: "Kategorieverwaltung" }));
    await screen.findByRole("heading", { name: "Kategorien" });

    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    fireEvent.change(screen.getByLabelText("Kategoriename"), { target: { value: "Lebensmittel" } });
    fireEvent.click(screen.getByRole("button", { name: "Farbe Grün" }));
    fireEvent.click(screen.getByRole("button", { name: "Kategorie speichern" }));
    expect(await screen.findByText("Kategorie wurde aktualisiert.")).toBeInTheDocument();
    expect(screen.getAllByText("Lebensmittel").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Deaktivieren" })[0]);
    expect(confirmSpy).toHaveBeenCalled();
    expect(await screen.findByText("Kategorie wurde deaktiviert.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Aktivieren" })[0]);
    expect(await screen.findByText("Kategorie wurde wieder aktiviert.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Kategorie Bank nach oben verschieben" }));
    expect(await screen.findByText("Reihenfolge wurde gespeichert.")).toBeInTheDocument();
  });

  test("member can directly open own category management", async () => {
    window.history.pushState({}, "", "/settings/categories");
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/categories/catalog")) {
        return jsonResponse(categoryCatalog);
      }
      if (url.includes("/categories?include_inactive=true")) {
        return jsonResponse([essenCategory]);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      return jsonResponse({});
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Kategorien" })).toBeInTheDocument();
    expect(screen.getAllByText("Essen").length).toBeGreaterThan(0);
  });
});

describe("Expenses", () => {
  test("member can select a category, enter an amount, and save an expense", async () => {
    window.history.pushState({}, "", "/");
    let summary = activeCashSummary;
    let createPayload: { category_id: number; amount: string } | null = null;
    mockFetch((url, options) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(summary);
      }
      if (url.endsWith("/cash-periods/current")) {
        return jsonResponse(activeCashPeriod);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      if (url.endsWith("/expenses") && options?.method === "POST") {
        createPayload = JSON.parse(String(options.body)) as typeof createPayload;
        summary = spentCashSummary;
        return jsonResponse({ expense: essenExpense, summary }, 201);
      }
      if (url.endsWith("/health")) {
        return healthResponse();
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Start/i }));
    fireEvent.click(await screen.findByLabelText("Kategorie Essen"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText("Essen").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Betrag")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "250,00" } });
    expect(screen.getByText("Voraussichtlich verbleibend")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ausgabe speichern" }));

    expect(await screen.findByText(/gespeichert/)).toBeInTheDocument();
    expect(createPayload).toEqual({ category_id: 1, amount: "250.00" });
    expect(screen.queryByText("Letzte Ausgaben")).not.toBeInTheDocument();
    expect(screen.getAllByText("Essen").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/19,750\.00/).length).toBeGreaterThan(0);
  });

  test("root category with subcategories opens subcategory selection before amount dialog", async () => {
    window.history.pushState({}, "", "/");
    let summary = activeCashSummary;
    let createPayload: { category_id: number; amount: string } | null = null;
    const apothekeExpense: Expense = {
      ...essenExpense,
      id: 4,
      category: {
        id: apothekeCategory.id,
        name: apothekeCategory.name,
        icon_key: "pill",
        color_key: "red",
        parent_category_id: essenCategory.id,
      },
    };
    mockFetch((url, options) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(summary);
      }
      if (url.endsWith("/cash-periods/current")) {
        return jsonResponse(activeCashPeriod);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory, apothekeCategory]);
      }
      if (url.endsWith("/expenses") && options?.method === "POST") {
        createPayload = JSON.parse(String(options.body)) as typeof createPayload;
        summary = spentCashSummary;
        return jsonResponse({ expense: apothekeExpense, summary }, 201);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Start/i }));
    fireEvent.click(await screen.findByLabelText("Kategorie Essen"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByLabelText("Betrag")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Kategorie Apotheke"));
    expect(await screen.findByLabelText("Betrag")).toBeInTheDocument();
    expect(screen.getByText("Oberkategorie")).toBeInTheDocument();
    expect(screen.getByText("Unterkategorie")).toBeInTheDocument();
    expect(screen.getAllByText("Essen").length).toBeGreaterThan(0);
    expect(screen.getByText("Apotheke")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "25,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Ausgabe speichern" }));

    expect(await screen.findByText(/Essen > Apotheke gespeichert/)).toBeInTheDocument();
    expect(createPayload).toEqual({ category_id: apothekeCategory.id, amount: "25.00" });
  });

  test("category tiles are not bookable without an active remaining amount", async () => {
    window.history.pushState({}, "", "/");
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/cash-periods/current") || url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(
          { detail: { code: "no_active_cash_period", message: "Es ist keine aktive Kassenperiode vorhanden." } },
          404,
        );
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      if (url.includes("/expenses/current")) {
        return jsonResponse([], 404);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Start/i }));
    const category = await screen.findByLabelText("Kategorie Essen");
    expect(category).toBeDisabled();
    fireEvent.click(category);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("home page does not load or show recent expenses", async () => {
    window.history.pushState({}, "", "/");
    let expenseCalls = 0;
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(spentCashSummary);
      }
      if (url.endsWith("/cash-periods/current")) {
        return jsonResponse(activeCashPeriod);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      if (url.includes("/expenses/current")) {
        expenseCalls += 1;
        return jsonResponse([adminExpense, essenExpense]);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Start/i }));
    expect(await screen.findByText("Kategorien")).toBeInTheDocument();
    expect(screen.queryByText("Letzte Ausgaben")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Buchung entfernen" })).not.toBeInTheDocument();
    expect(screen.queryByText("Nuam /")).not.toBeInTheDocument();
    expect(expenseCalls).toBe(0);
  });

  test("visible home page refreshes cash summary silently", async () => {
    window.history.pushState({}, "", "/");
    let summaryCalls = 0;
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/cash-periods/current/summary")) {
        summaryCalls += 1;
        return jsonResponse(activeCashSummary);
      }
      if (url.endsWith("/cash-periods/current")) {
        return jsonResponse(activeCashPeriod);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      if (url.includes("/expenses/current")) {
        throw new Error("Home page should not request recent expenses.");
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Start/i }));
    expect(await screen.findByText("Kategorien")).toBeInTheDocument();
    expect(summaryCalls).toBeGreaterThan(0);
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(summaryCalls).toBeGreaterThan(1));
  });
});

describe("Overview", () => {
  test("member can open overview and filter expenses by category and user", async () => {
    const expenseUrls: string[] = [];
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/overview/current")) {
        return jsonResponse(currentOverview);
      }
      if (url.includes("/overview/cash-periods/1/expenses")) {
        expenseUrls.push(url);
        return jsonResponse(overviewPage([overviewExpense]));
      }
      if (url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(activeCashSummary);
      }
      if (url.endsWith("/cash-periods/current")) {
        return jsonResponse(activeCashPeriod);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory, bankCategory]);
      }
      if (url.includes("/expenses/current")) {
        return jsonResponse([]);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Übersicht/i }));

    expect(await screen.findByRole("heading", { name: "Übersicht" })).toBeInTheDocument();
    expect(screen.getByText("Juli 2026")).toBeInTheDocument();
    expect(screen.getAllByText(/19,600\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/400\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/62\.50/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Kassenperiode")).not.toBeInTheDocument();
    expect(screen.queryByText("Mit stornierten")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Essen")[0]);
    await waitFor(() => expect(expenseUrls.some((url) => url.includes("category_id=1"))).toBe(true));
    expect(screen.getByRole("button", { name: "Kategorie: Essen" })).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Nuam")[0]);
    await waitFor(() => expect(expenseUrls.some((url) => url.includes("created_by_user_id=2"))).toBe(true));
    expect(screen.getByRole("button", { name: "Benutzer: Nuam" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Alle Filter zurücksetzen" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Kategorie: Essen" })).not.toBeInTheDocument());
  });

  test("admin can select historical periods and include voided expenses", async () => {
    const expenseUrls: string[] = [];
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(adminUser);
      }
      if (url.endsWith("/cash-periods")) {
        return jsonResponse([activeCashPeriod, closedCashPeriod]);
      }
      if (url.endsWith("/overview/current")) {
        return jsonResponse(currentOverview);
      }
      if (url.endsWith("/overview/cash-periods/2")) {
        return jsonResponse(closedOverview);
      }
      if (url.includes("/overview/cash-periods/1/expenses")) {
        expenseUrls.push(url);
        return jsonResponse(overviewPage([overviewExpense]));
      }
      if (url.includes("/overview/cash-periods/2/expenses")) {
        expenseUrls.push(url);
        return jsonResponse(overviewPage([voidedOverviewExpense]));
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Übersicht/i }));
    expect(await screen.findByLabelText("Kassenperiode")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Kassenperiode"), { target: { value: "2" } });
    expect(await screen.findByText("Juni 2026")).toBeInTheDocument();
    expect(screen.getByText("Abgeschlossen")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "all" } });
    await waitFor(() => expect(expenseUrls.some((url) => url.includes("include_voided=true"))).toBe(true));
    expect(await screen.findByText("Storniert")).toBeInTheDocument();
    expect(screen.getByText(/Doppelt/)).toBeInTheDocument();
  });

  test("overview validates custom date range and supports loading more expenses", async () => {
    const expenseUrls: string[] = [];
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/overview/current")) {
        return jsonResponse(currentOverview);
      }
      if (url.includes("/overview/cash-periods/1/expenses")) {
        expenseUrls.push(url);
        const isSecondPage = url.includes("offset=20");
        return jsonResponse(
          isSecondPage
            ? { ...overviewPage([{ ...overviewExpense, id: 13, amount: "75.00" }]), offset: 20, has_more: false }
            : overviewPage([overviewExpense], true),
        );
      }
      if (url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(activeCashSummary);
      }
      if (url.endsWith("/cash-periods/current")) {
        return jsonResponse(activeCashPeriod);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      if (url.includes("/expenses/current")) {
        return jsonResponse([]);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Übersicht/i }));
    expect(await screen.findByText("Weitere Buchungen laden")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Weitere Buchungen laden" }));
    await waitFor(() => expect(expenseUrls.some((url) => url.includes("offset=20"))).toBe(true));
    expect(await screen.findByText(/75\.00/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Zeitraum"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-07-10" } });
    fireEvent.change(screen.getByLabelText("Bis"), { target: { value: "2026-07-01" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Das Ende darf nicht vor dem Beginn liegen.");
  });
});

describe("Cash periods", () => {
  test("shows active cash period summary on the home page", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(activeCashSummary);
      }
      if (url.endsWith("/cash-periods/current")) {
        return jsonResponse(activeCashPeriod);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      if (url.endsWith("/health")) {
        return healthResponse();
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Start/i }));
    expect(await screen.findByText("Restbetrag")).toBeInTheDocument();
    expect(screen.getByText(/Startbetrag: .*20,000\.00/)).toBeInTheDocument();
    expect(screen.getAllByText(/20,000\.00/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Ausgaben")).not.toBeInTheDocument();
    expect(screen.queryByText("Beginn: 1.7.2026")).not.toBeInTheDocument();
  });

  test("shows no active cash period state with admin action only for admins", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(adminUser);
      }
      if (url.endsWith("/cash-periods/current") || url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(
          { detail: { code: "no_active_cash_period", message: "Es ist keine aktive Kassenperiode vorhanden." } },
          404,
        );
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([]);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Start/i }));
    expect(await screen.findByText("Zurzeit ist kein Betrag hinterlegt.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Neue Kassenperiode anlegen" })).toBeInTheDocument();
  });

  test("member does not see cash period administration", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      if (url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(activeCashSummary);
      }
      if (url.endsWith("/cash-periods/current")) {
        return jsonResponse(activeCashPeriod);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Einstellungen/i }));
    expect(await screen.findByRole("heading", { name: "Einstellungen" })).toBeInTheDocument();
    expect(screen.queryByText("Kassenverwaltung")).not.toBeInTheDocument();
  });

  test("admin can create and edit a cash period", async () => {
    let cashPeriods: CashPeriod[] = [activeCashPeriod];
    mockFetch((url, options) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(adminUser);
      }
      if (url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(activeCashSummary);
      }
      if (url.endsWith("/cash-periods/current")) {
        return jsonResponse(activeCashPeriod);
      }
      if (url.endsWith("/cash-periods") && options?.method === "GET") {
        return jsonResponse(cashPeriods);
      }
      if (url.endsWith("/cash-periods") && options?.method === "POST") {
        const created = { ...activeCashPeriod, id: 3, name: "August 2026", start_date: "2026-08-01" };
        cashPeriods = [created, ...cashPeriods];
        return jsonResponse(created, 201);
      }
      if (url.includes("/cash-periods/1") && options?.method === "PATCH") {
        const patch = JSON.parse(String(options.body)) as Partial<typeof activeCashPeriod>;
        cashPeriods = cashPeriods.map((item) => item.id === 1 ? { ...item, ...patch } : item);
        return jsonResponse(cashPeriods.find((item) => item.id === 1));
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Einstellungen/i }));
    fireEvent.click(await screen.findByRole("link", { name: "Kassenverwaltung" }));
    expect(await screen.findByRole("heading", { name: "Kassenperioden" })).toBeInTheDocument();
    expect(screen.queryByText("Löschen")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Beginn"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Ausgangsbetrag"), { target: { value: "21000.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Kassenperiode anlegen" }));
    expect(await screen.findByText("Kassenperiode wurde angelegt.")).toBeInTheDocument();
    expect(screen.getByText("August 2026")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[1]);
    fireEvent.change(screen.getByLabelText("Name der Kassenperiode"), { target: { value: "Juli korrigiert" } });
    fireEvent.change(screen.getByLabelText("Ausgangsbetrag"), { target: { value: "25000.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Kassenperiode speichern" }));
    expect(await screen.findByText("Kassenperiode wurde aktualisiert.")).toBeInTheDocument();
    expect(screen.getByText("Juli korrigiert")).toBeInTheDocument();
  });

  test("admin can close an active cash period and closed period has no edit action", async () => {
    let cashPeriods: CashPeriod[] = [activeCashPeriod];
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("2026-07-31");
    mockFetch((url, options) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(adminUser);
      }
      if (url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(activeCashSummary);
      }
      if (url.endsWith("/cash-periods/current")) {
        return jsonResponse(activeCashPeriod);
      }
      if (url.endsWith("/cash-periods") && options?.method === "GET") {
        return jsonResponse(cashPeriods);
      }
      if (url.includes("/cash-periods/1/close") && options?.method === "POST") {
        cashPeriods = [{ ...closedCashPeriod, id: 1, name: "Juli 2026" }];
        return jsonResponse(cashPeriods[0]);
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Einstellungen/i }));
    fireEvent.click(await screen.findByRole("link", { name: "Kassenverwaltung" }));
    fireEvent.click(await screen.findByRole("button", { name: "Abschließen" }));

    expect(promptSpy).toHaveBeenCalled();
    expect(await screen.findByText("Kassenperiode wurde abgeschlossen.")).toBeInTheDocument();
    expect(screen.getByText("abgeschlossen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).not.toBeInTheDocument();
  });

  test("create form shows validation and conflict errors", async () => {
    mockFetch((url, options) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(adminUser);
      }
      if (url.endsWith("/cash-periods/current/summary")) {
        return jsonResponse(activeCashSummary);
      }
      if (url.endsWith("/cash-periods/current")) {
        return jsonResponse(activeCashPeriod);
      }
      if (url.endsWith("/cash-periods") && options?.method === "GET") {
        return jsonResponse([activeCashPeriod]);
      }
      if (url.endsWith("/cash-periods") && options?.method === "POST") {
        return jsonResponse(
          { detail: { code: "active_cash_period_exists", message: "Es existiert bereits eine aktive Kassenperiode." } },
          409,
        );
      }
      if (url.endsWith("/categories")) {
        return jsonResponse([essenCategory]);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Einstellungen/i }));
    fireEvent.click(await screen.findByRole("link", { name: "Kassenverwaltung" }));
    fireEvent.change(await screen.findByLabelText("Name der Kassenperiode"), { target: { value: "August 2026" } });
    fireEvent.change(screen.getByLabelText("Ausgangsbetrag"), { target: { value: "21000.00" } });
    fireEvent.change(screen.getByLabelText("Beginn"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Ende optional"), { target: { value: "2026-07-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Kassenperiode anlegen" }));
    expect(await screen.findByText("Das Ende darf nicht vor dem Beginn liegen.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Ende optional"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Kassenperiode anlegen" }));
    expect(await screen.findByText("Es existiert bereits eine aktive Kassenperiode.")).toBeInTheDocument();
  });
});
