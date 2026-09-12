import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { DisplayModeProvider, useDisplayMode } from "../src/app/DisplayModeContext";

function installViewport(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<() => void>();

  vi.stubGlobal("matchMedia", vi.fn((query: string) => {
    const minimumWidth = Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
    return {
      media: query,
      get matches() {
        return width >= minimumWidth;
      },
      onchange: null,
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  }));

  return (nextWidth: number) => {
    width = nextWidth;
    act(() => listeners.forEach((listener) => listener()));
  };
}

function DisplayModeProbe() {
  const { isWebAvailable, preference, resolvedMode, setPreference } = useDisplayMode();
  return (
    <div>
      <output aria-label="Präferenz">{preference}</output>
      <output aria-label="Aktive Ansicht">{resolvedMode}</output>
      <output aria-label="Web verfügbar">{String(isWebAvailable)}</output>
      <button onClick={() => setPreference("auto")} type="button">Automatisch</button>
      <button onClick={() => setPreference("web")} type="button">Web</button>
      <button onClick={() => setPreference("mobile")} type="button">Mobil</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Display mode", () => {
  test("automatic mode follows the viewport and manual mobile remains selected", () => {
    const setWidth = installViewport(1280);
    render(<DisplayModeProvider><DisplayModeProbe /></DisplayModeProvider>);

    expect(screen.getByLabelText("Aktive Ansicht")).toHaveTextContent("desktop");
    expect(screen.getByLabelText("Web verfügbar")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "Mobil" }));
    expect(screen.getByLabelText("Aktive Ansicht")).toHaveTextContent("mobile");
    expect(window.localStorage.getItem("nuam-kasse:display-mode")).toBe("mobile");

    setWidth(390);
    expect(screen.getByLabelText("Aktive Ansicht")).toHaveTextContent("mobile");
    expect(screen.getByLabelText("Web verfügbar")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "Automatisch" }));
    setWidth(1280);
    expect(screen.getByLabelText("Aktive Ansicht")).toHaveTextContent("desktop");
  });

  test("stored mobile preference is restored and web falls back safely on a small screen", () => {
    installViewport(390);
    window.localStorage.setItem("nuam-kasse:display-mode", "mobile");
    render(<DisplayModeProvider><DisplayModeProbe /></DisplayModeProvider>);

    expect(screen.getByLabelText("Präferenz")).toHaveTextContent("mobile");
    expect(screen.getByLabelText("Aktive Ansicht")).toHaveTextContent("mobile");

    fireEvent.click(screen.getByRole("button", { name: "Web" }));
    expect(screen.getByLabelText("Präferenz")).toHaveTextContent("web");
    expect(screen.getByLabelText("Aktive Ansicht")).toHaveTextContent("mobile");
  });
});
