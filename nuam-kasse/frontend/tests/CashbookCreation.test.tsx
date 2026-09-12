import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { App } from "../src/App";
import type { User } from "../src/types/user";

const user: User = {
  id: 1,
  username: "admin",
  display_name: "Admin",
  role: "admin",
  cashbook_id: 1,
  cashbook_name: "Nuam Kasse",
  cashbook_role: "admin",
  is_active: true,
  must_change_password: false,
};

const cashbooks = [
  {
    id: 1,
    name: "Nuam Kasse",
    description: null,
    currency: "THB",
    role: "admin",
    current_balance: "1000.00",
    active_period_id: 1,
    status: "open",
    archived_at: null,
  },
  {
    id: 2,
    name: "Zweite Kasse",
    description: null,
    currency: "THB",
    role: "admin",
    current_balance: "500.00",
    active_period_id: 2,
    status: "open",
    archived_at: null,
  },
];

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  navigateTo("/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Cashbook creation", () => {
  test("uses the current cashbook as category template and allows an explicit choice", async () => {
    let submittedBody: Record<string, unknown> | null = null;
    let created = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/auth/me")) {
          return jsonResponse(
            created
              ? { ...user, cashbook_id: 3, cashbook_name: "Neue Kasse" }
              : user,
          );
        }
        if (url.endsWith("/cashbooks") && options?.method === "POST") {
          submittedBody = JSON.parse(String(options.body));
          created = true;
          return jsonResponse(
            {
              id: 3,
              name: "Neue Kasse",
              description: null,
              currency: "THB",
            },
            201,
          );
        }
        if (url.endsWith("/cashbooks")) return jsonResponse(cashbooks);
        if (url.endsWith("/categories")) return jsonResponse([]);
        if (url.endsWith("/cash-periods/current")) {
          return jsonResponse({ name: "Aktuelle Kasse" });
        }
        if (url.endsWith("/health")) {
          return jsonResponse({ status: "ok", database: "connected" });
        }
        return jsonResponse({});
      }),
    );
    navigateTo("/cashbooks");

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Kassenverwaltung" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Neue Kasse" }));
    const templateSelect = await screen.findByLabelText(
      "Kategorien übernehmen von",
    );
    expect(templateSelect).toHaveValue("1");
    fireEvent.change(templateSelect, { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Name der Kasse"), {
      target: { value: "Neue Kasse" },
    });
    fireEvent.change(screen.getByLabelText("Anfangsbestand"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kasse anlegen" }));

    await waitFor(() => expect(submittedBody).not.toBeNull());
    expect(submittedBody).toMatchObject({
      name: "Neue Kasse",
      opening_amount: "500.00",
      description: null,
      template_cashbook_id: 2,
    });
  });

  test("groups cashbooks by lifecycle and closes and reopens them through confirmations", async () => {
    let currentCashbooks = [
      cashbooks[0],
      cashbooks[1],
      {
        id: 3,
        name: "Archivkasse",
        description: null,
        currency: "THB",
        role: "admin",
        current_balance: "250.00",
        active_period_id: null,
        status: "archived",
        archived_at: "2026-08-31T18:00:00Z",
      },
    ];
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        const method = options?.method ?? "GET";
        requests.push(`${method} ${url}`);
        if (url.endsWith("/auth/me")) return jsonResponse(user);
        if (url.endsWith("/cashbooks/1/close") && method === "POST") {
          currentCashbooks = currentCashbooks.map((cashbook) => cashbook.id === 1 ? {
            ...cashbook,
            status: "archived",
            active_period_id: null,
            archived_at: "2026-09-12T12:00:00Z",
          } : cashbook);
          return jsonResponse({
            closed_period: { id: 1, status: "closed" },
            summary: { remaining_amount: "1000.00", currency: "THB" },
          });
        }
        if (url.endsWith("/cashbooks/3/reopen") && method === "POST") {
          currentCashbooks = currentCashbooks.map((cashbook) => cashbook.id === 3 ? {
            ...cashbook,
            status: "open",
            active_period_id: 4,
            archived_at: null,
          } : cashbook);
          return jsonResponse({ id: 4, status: "active", opening_amount: "250.00" }, 201);
        }
        if (url.endsWith("/cashbooks")) return jsonResponse(currentCashbooks);
        if (url.endsWith("/health")) return jsonResponse({ status: "ok", database: "connected" });
        return jsonResponse({});
      }),
    );
    navigateTo("/cashbooks");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Aktive Kasse" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weitere Kassen" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Archiv" })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Kasse schließen" })[0]);
    let dialog = screen.getByRole("dialog", { name: "Kasse schließen" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Kasse endgültig schließen" }));
    await waitFor(() => expect(requests.some((request) => request.includes("POST") && request.endsWith("/cashbooks/1/close"))).toBe(true));
    expect((await screen.findAllByText("Nuam Kasse")).length).toBeGreaterThan(0);

    const archiveCard = screen.getByText("Archivkasse").closest(".app-card");
    expect(archiveCard).not.toBeNull();
    fireEvent.click(within(archiveCard as HTMLElement).getByRole("button", { name: "Kasse wieder öffnen" }));
    dialog = screen.getByRole("dialog", { name: "Kasse wieder öffnen" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Kasse wieder öffnen" }));
    await waitFor(() => expect(requests.some((request) => request.includes("POST") && request.endsWith("/cashbooks/3/reopen"))).toBe(true));
    expect(await screen.findByRole("heading", { name: "Weitere Kassen" })).toBeInTheDocument();
  });
});
