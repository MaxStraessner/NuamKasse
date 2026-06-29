import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { App } from "../src/App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  test("renders the start page", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));

    render(<App />);

    expect(screen.getByRole("heading", { name: "Nuam Kasse" })).toBeInTheDocument();
  });

  test("shows the app name", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));

    render(<App />);

    expect(screen.getByText("Nuam Kasse")).toBeInTheDocument();
  });

  test("shows the checking status", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));

    render(<App />);

    expect(screen.getByText("Backend wird geprueft")).toBeInTheDocument();
  });

  test("shows a successful health check", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ok",
          database: "connected",
          app: "Nuam Kasse",
          version: "0.1.0",
        }),
      }),
    );

    render(<App />);

    expect(await screen.findByText("Backend erreichbar")).toBeInTheDocument();
  });

  test("shows a failed health check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<App />);

    expect(await screen.findByText("Backend nicht erreichbar")).toBeInTheDocument();
  });

  test("shows the navigation", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));

    render(<App />);

    expect(screen.getByRole("link", { name: /Start/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Uebersicht/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Einstellungen/i })).toBeInTheDocument();
  });
});
