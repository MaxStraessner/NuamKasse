import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BookingDatePicker } from "../src/components/BookingDatePicker";
import { shiftLocalDate } from "../src/services/dateTime";

afterEach(cleanup);

function PickerHarness({
  initialValue,
  max,
  min,
}: {
  initialValue: string;
  max: string;
  min?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return <BookingDatePicker max={max} min={min} onChange={setValue} value={value} />;
}

describe("BookingDatePicker", () => {
  test("moves exactly one local calendar day across month and year boundaries", () => {
    render(<PickerHarness initialValue="2026-01-01" max="2026-01-01" min="2025-12-30" />);

    const input = screen.getByLabelText("Buchungsdatum im Kalender auswählen") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Einen Tag zurück" }));
    expect(input.value).toBe("2025-12-31");
    fireEvent.click(screen.getByRole("button", { name: "Einen Tag zurück" }));
    expect(input.value).toBe("2025-12-30");
    expect(screen.getByRole("button", { name: "Einen Tag zurück" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Einen Tag vor" }));
    expect(input.value).toBe("2025-12-31");
  });

  test("never passes an impossible future minimum to the native date input", () => {
    render(<PickerHarness initialValue="2026-09-18" max="2026-09-18" min="2026-10-01" />);

    const input = screen.getByLabelText("Buchungsdatum im Kalender auswählen");
    expect(input).not.toHaveAttribute("min");
    expect(input).toHaveAttribute("max", "2026-09-18");
    expect(screen.getByRole("button", { name: "Einen Tag zurück" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Einen Tag vor" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Einen Tag zurück" }));
    expect(input).toHaveValue("2026-09-17");
  });

  test("opens the native calendar when the visible date is clicked and accepts its value", () => {
    render(<PickerHarness initialValue="2026-09-18" max="2026-09-18" min="2026-09-01" />);

    const input = screen.getByLabelText("Buchungsdatum im Kalender auswählen") as HTMLInputElement;
    const showPicker = vi.fn();
    Object.defineProperty(input, "showPicker", { configurable: true, value: showPicker });

    fireEvent.click(screen.getByRole("button", { name: /Kalender öffnen/ }));
    expect(showPicker).toHaveBeenCalledOnce();

    fireEvent.change(input, { target: { value: "2026-09-07" } });
    expect(input.value).toBe("2026-09-07");
    expect(screen.getByRole("button", { name: "Buchungsdatum 07.09.2026, Kalender öffnen" })).toBeInTheDocument();
  });

  test("local date shifting also handles leap days", () => {
    expect(shiftLocalDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftLocalDate("2028-02-29", 1)).toBe("2028-03-01");
  });
});
