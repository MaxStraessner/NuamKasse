import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { App } from "../src/App";

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
    vi.fn((input: RequestInfo | URL, options?: RequestInit) =>
      handler(String(input), options),
    ),
  );
}

afterEach(() => {
  cleanup();
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
      if (url.endsWith("/health")) {
        return jsonResponse({ status: "ok", database: "connected", app: "Nuam Kasse", version: "0.1.0" });
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
      if (url.endsWith("/health")) {
        return jsonResponse({ status: "ok", database: "connected", app: "Nuam Kasse", version: "0.1.0" });
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
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Benutzer/i }));
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

  test("member cannot see user management", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) {
        return jsonResponse(memberUser);
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /Einstellungen/i }));
    expect(await screen.findByRole("heading", { name: "Einstellungen" })).toBeInTheDocument();
    expect(screen.queryByText("Benutzerverwaltung")).not.toBeInTheDocument();
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
        return jsonResponse({ message: "Passwort wurde geaendert." });
      }
      if (url.endsWith("/health")) {
        return jsonResponse({ status: "ok", database: "connected", app: "Nuam Kasse", version: "0.1.0" });
      }
      return jsonResponse({});
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Passwort aendern" })).toBeInTheDocument();
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
