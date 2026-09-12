import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
  },
  {
    id: 2,
    name: "Zweite Kasse",
    description: null,
    currency: "THB",
    role: "admin",
    current_balance: "500.00",
    active_period_id: 2,
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
          return jsonResponse({ name: "Aktuelle Periode" });
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
      await screen.findByRole("heading", { name: "Meine Kassen" }),
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
});
