import { CircleUserRound, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { ApiError } from "../services/apiClient";
import { getCurrentCashPeriod } from "../services/cashPeriodsApi";

type CashbookState = "loading" | "open" | "archived" | "unknown";

export function DesktopTopbar() {
  const { user } = useAuth();
  const [cashbookState, setCashbookState] = useState<CashbookState>("loading");

  useEffect(() => {
    let isCurrent = true;

    if (!user?.cashbook_id) {
      setCashbookState("archived");
      return () => {
        isCurrent = false;
      };
    }

    setCashbookState("loading");
    void getCurrentCashPeriod()
      .then(() => {
        if (isCurrent) setCashbookState("open");
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        setCashbookState(error instanceof ApiError && error.status === 404 ? "archived" : "unknown");
      });

    return () => {
      isCurrent = false;
    };
  }, [user?.cashbook_id]);

  const contextLabel = cashbookState === "open" ? "Aktive Kasse" : "Kassenstatus";
  const contextName =
    cashbookState === "open"
      ? user?.cashbook_name || "Kasse wählen"
      : cashbookState === "archived"
        ? "Keine aktive Kasse"
        : cashbookState === "unknown"
          ? "Status nicht verfügbar"
          : "Wird geladen";

  return (
    <header className="desktop-topbar">
      <div className="desktop-topbar__context">
        <Link to="/cashbooks">
          <WalletCards aria-hidden="true" />
          <span><small>{contextLabel}</small><strong>{contextName}</strong></span>
        </Link>
      </div>
      <Link className="desktop-topbar__account" aria-label="Konto und Einstellungen öffnen" to="/settings">
        <span><small>Angemeldet als</small><strong>{user?.display_name}</strong></span>
        <CircleUserRound aria-hidden="true" />
      </Link>
    </header>
  );
}
