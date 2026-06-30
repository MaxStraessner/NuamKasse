import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { registerSW } from "virtual:pwa-register";
import { describe, expect, it, vi } from "vitest";

import { NetworkStatusProvider } from "../src/app/NetworkStatusContext";
import { OfflineNotice } from "../src/components/OfflineNotice";
import { PwaInstallPrompt } from "../src/components/PwaInstallPrompt";
import { PwaUpdatePrompt } from "../src/components/PwaUpdatePrompt";

function healthResponse(status = 200) {
  return new Response(JSON.stringify({ status: "ok", database: "connected", app: "Nuam Kasse", version: "0.6.0" }), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("PWA network behaviour", () => {
  it("shows an offline notice when the browser goes offline", async () => {
    render(
      <NetworkStatusProvider>
        <OfflineNotice />
      </NetworkStatusProvider>,
    );

    window.dispatchEvent(new Event("offline"));

    expect(await screen.findByText("Keine Verbindung zum Server")).toBeInTheDocument();
    expect(screen.getByText(/Neue Buchungen sind erst wieder/)).toBeInTheDocument();
  });

  it("hides the offline notice when the server is reachable", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(healthResponse());

    render(
      <NetworkStatusProvider>
        <OfflineNotice />
      </NetworkStatusProvider>,
    );

    await waitFor(() => expect(screen.queryByText("Keine Verbindung zum Server")).not.toBeInTheDocument());
  });
});

describe("PWA install prompt", () => {
  it("offers installation when beforeinstallprompt is available", async () => {
    window.localStorage.clear();

    render(<PwaInstallPrompt />);

    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted"; platform: string }>;
    };
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
    window.dispatchEvent(event);

    expect(await screen.findByText("App installieren")).toBeInTheDocument();
    fireEvent.click(screen.getByText("App installieren"));

    await waitFor(() => expect(event.prompt).toHaveBeenCalled());
  });
});

describe("PWA update prompt", () => {
  it("shows and applies a controlled service worker update", async () => {
    const updateServiceWorker = vi.fn(async () => undefined);
    vi.mocked(registerSW).mockReturnValueOnce(updateServiceWorker);

    render(<PwaUpdatePrompt />);

    const calls = vi.mocked(registerSW).mock.calls;
    const options = calls[calls.length - 1]?.[0];
    options?.onNeedRefresh?.();

    expect(await screen.findByText("Neue Version verfuegbar")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Jetzt aktualisieren"));

    await waitFor(() => expect(updateServiceWorker).toHaveBeenCalledWith(true));
  });
});
