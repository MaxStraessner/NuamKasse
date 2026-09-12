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
  cashbook_accesses: [
    {
      cashbook_id: 1,
      cashbook_name: "Nuam Kasse",
      cashbook_role: "admin",
      period_access_mode: "all",
      period_access_from: null,
      accessible_period_ids: [7],
      accessible_period_count: 1,
      available_period_count: 1,
    },
  ],
  cashbook_count: 1,
  accessible_period_count: 1,
  last_login_at: "2026-09-12T08:00:00Z",
};

const memberUser: User = {
  ...adminUser,
  id: 2,
  username: "nuam",
  display_name: "Nuam",
  role: "member",
  cashbook_role: "member",
  must_change_password: true,
  cashbook_accesses: [
    {
      ...adminUser.cashbook_accesses![0],
      cashbook_role: "member",
      period_access_mode: "current_and_future",
    },
  ],
};

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

function installDesktopViewport() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(
      (query: string) =>
        ({
          matches: query.includes("min-width"),
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    ),
  );
}

function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function installApiMock(user: User = adminUser) {
  const requests: Array<{ method: string; url: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ method, url });
      if (url.endsWith("/auth/me")) return jsonResponse(user);
      if (url.endsWith("/cash-periods/current"))
        return jsonResponse({ name: "September 2026" });
      if (url.endsWith("/users/access-options")) {
        return jsonResponse([
          {
            id: 1,
            name: "Nuam Kasse",
            periods: [
              {
                id: 7,
                name: "September 2026",
                start_date: "2026-09-01",
                end_date: null,
                status: "active",
              },
            ],
          },
        ]);
      }
      if (url.endsWith("/users")) return jsonResponse([adminUser, memberUser]);
      if (url.includes("/users/audit-log")) {
        return jsonResponse([
          {
            id: 9,
            actor_user_id: 1,
            actor_username: "admin",
            target_user_id: 2,
            target_username: "nuam",
            action: "user.password_reset",
            details: { sessions_revoked: true },
            created_at: "2026-09-12T08:30:00Z",
          },
        ]);
      }
      return jsonResponse({});
    }),
  );
  return requests;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  navigateTo("/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Desktop administration and settings", () => {
  test("renders the existing user data as a desktop table and opens the structured detail", async () => {
    installDesktopViewport();
    const requests = installApiMock();
    navigateTo("/settings/users");

    render(<App />);

    const table = await screen.findByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "Benutzer" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Globale Rolle" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Archivzugriff" }),
    ).toBeInTheDocument();
    expect(within(table).getByText("Wechsel erforderlich")).toBeInTheDocument();

    fireEvent.click(within(table).getByRole("button", { name: "Nuam öffnen" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuam" });
    expect(dialog).toHaveClass("desktop-user-dialog--detail");
    expect(
      within(dialog).getByRole("heading", { name: "Konto" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Neues Passwort setzen" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Zugriffsrechte" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Administratoraktionen" }),
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByText("Passwort administrativ zurückgesetzt"),
    ).toBeInTheDocument();
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("keeps display mode preference in the browser and switches to the unchanged mobile shell", async () => {
    installDesktopViewport();
    installApiMock();
    navigateTo("/settings");

    const firstRender = render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Einstellungen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Einstellungsbereiche" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Mobil" }));
    await waitFor(() =>
      expect(document.querySelector(".app-shell--mobile")).toBeInTheDocument(),
    );
    expect(window.localStorage.getItem("nuam-kasse:display-mode")).toBe(
      "mobile",
    );

    firstRender.unmount();
    render(<App />);
    await waitFor(() =>
      expect(document.querySelector(".app-shell--mobile")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("navigation", { name: "Einstellungsbereiche" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Ansicht" }),
    ).toBeInTheDocument();
  });

  test("does not expose administration to a normal desktop user or through its direct URL", async () => {
    installDesktopViewport();
    installApiMock({ ...memberUser, must_change_password: false });
    navigateTo("/settings/users");

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Einstellungen" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Administration" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Benutzer" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Benutzer" }),
    ).not.toBeInTheDocument();
  });
});
