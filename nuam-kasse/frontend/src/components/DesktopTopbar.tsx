import { CircleUserRound, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { getCurrentCashPeriod } from "../services/cashPeriodsApi";

export function DesktopTopbar() {
  const { user } = useAuth();
  const [cashPeriodName, setCashPeriodName] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setCashPeriodName(null);
    void getCurrentCashPeriod()
      .then((cashPeriod) => {
        if (isCurrent) {
          setCashPeriodName(cashPeriod.name);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setCashPeriodName("Keine aktive Periode");
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [user?.cashbook_id]);

  return (
    <header className="desktop-topbar">
      <div className="desktop-topbar__context">
        <Link to="/cashbooks">
          <WalletCards aria-hidden="true" />
          <span><small>Aktuelle Kasse</small><strong>{user?.cashbook_name || "Kasse wählen"}</strong></span>
        </Link>
        <span className="desktop-topbar__divider" aria-hidden="true" />
        <span><small>Kassenperiode</small><strong>{cashPeriodName || "Wird geladen …"}</strong></span>
      </div>
      <Link className="desktop-topbar__account" aria-label="Konto und Einstellungen öffnen" to="/settings">
        <span><small>Angemeldet als</small><strong>{user?.display_name}</strong></span>
        <CircleUserRound aria-hidden="true" />
      </Link>
    </header>
  );
}
