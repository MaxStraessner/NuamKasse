import { Outlet } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { BottomNav } from "../components/BottomNav";
import { OfflineNotice } from "../components/OfflineNotice";
import { PwaInstallPrompt } from "../components/PwaInstallPrompt";
import { PwaUpdatePrompt } from "../components/PwaUpdatePrompt";

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <div className="user-strip">
        <span>Hallo, {user?.display_name}</span>
        <button type="button" onClick={() => void logout()}>
          Abmelden
        </button>
      </div>
      <OfflineNotice />
      <Outlet />
      <PwaInstallPrompt />
      <PwaUpdatePrompt />
      <BottomNav />
    </div>
  );
}
