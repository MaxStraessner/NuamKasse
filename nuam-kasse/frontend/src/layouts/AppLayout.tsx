import { CircleUserRound } from "lucide-react";
import { Link, Outlet } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { BottomNav } from "../components/BottomNav";
import { OfflineNotice } from "../components/OfflineNotice";
import { PwaInstallPrompt } from "../components/PwaInstallPrompt";
import { PwaUpdatePrompt } from "../components/PwaUpdatePrompt";

export function AppLayout() {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <div className="user-strip">
        <span>Hallo, {user?.display_name}</span>
        <Link aria-label="Konto und Einstellungen öffnen" to="/settings">
          <CircleUserRound aria-hidden="true" />
        </Link>
      </div>
      <OfflineNotice />
      <Outlet />
      <PwaInstallPrompt />
      <PwaUpdatePrompt />
      <BottomNav />
    </div>
  );
}
