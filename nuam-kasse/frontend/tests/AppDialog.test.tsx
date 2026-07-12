import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AppDialog } from "../src/components/AppDialog";

afterEach(cleanup);

describe("AppDialog", () => {
  test("moves focus into the dialog and requests closing with Escape", async () => {
    const onClose = vi.fn();
    render(
      <div>
        <button type="button">Auslöser</button>
        <AppDialog isOpen onClose={onClose} title="Testdialog">
          <input aria-label="Erstes Feld" data-autofocus />
        </AppDialog>
      </div>,
    );

    await waitFor(() => expect(screen.getByLabelText("Erstes Feld")).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("does not close while a critical operation is running", () => {
    const onClose = vi.fn();
    render(
      <AppDialog isOpen onClose={onClose} preventClose title="Speichern">
        <p>Bitte warten</p>
      </AppDialog>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Dialog schließen" })).toBeDisabled();
  });
});
