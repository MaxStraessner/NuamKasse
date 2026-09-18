import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatBookingDate, shiftLocalDate } from "../services/dateTime";

type BookingDatePickerProps = {
  value: string;
  min?: string;
  max: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function BookingDatePicker({ disabled = false, max, min, onChange, value }: BookingDatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const validMin = min && min <= max ? min : undefined;
  const previousDate = shiftLocalDate(value, -1);
  const nextDate = shiftLocalDate(value, 1);

  function openCalendar() {
    const input = inputRef.current;
    if (!input || disabled) {
      return;
    }
    input.focus({ preventScroll: true });
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch {
        // Browsers may expose showPicker() but reject it in some embedded contexts.
      }
    }
    input.click();
  }

  return (
    <div aria-label="Buchungsdatum" className="booking-date-picker" role="group">
      <button
        aria-label="Einen Tag zurück"
        disabled={disabled || Boolean(validMin && previousDate < validMin)}
        onClick={() => onChange(previousDate)}
        type="button"
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <button
        aria-label={`Buchungsdatum ${formatBookingDate(value)}, Kalender öffnen`}
        className="booking-date-picker__value"
        disabled={disabled}
        onClick={openCalendar}
        type="button"
      >
        {formatBookingDate(value)}
      </button>
      <input
        aria-label="Buchungsdatum im Kalender auswählen"
        className="booking-date-picker__input"
        disabled={disabled}
        max={max}
        min={validMin}
        onChange={(event) => {
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        ref={inputRef}
        tabIndex={-1}
        type="date"
        value={value}
      />
      <button
        aria-label="Einen Tag vor"
        disabled={disabled || nextDate > max}
        onClick={() => onChange(nextDate)}
        type="button"
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
