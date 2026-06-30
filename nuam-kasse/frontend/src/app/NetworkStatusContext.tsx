import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { fetchHealth } from "../services/healthApi";

export type NetworkStatus = {
  isOnline: boolean;
  isServerReachable: boolean;
  lastSuccessfulConnection: string | null;
};

type NetworkStatusContextValue = {
  status: NetworkStatus;
  refreshServerStatus: () => Promise<void>;
};

const NetworkStatusContext = createContext<NetworkStatusContextValue | undefined>(undefined);

export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isServerReachable, setIsServerReachable] = useState(() => navigator.onLine);
  const [lastSuccessfulConnection, setLastSuccessfulConnection] = useState<string | null>(null);

  async function refreshServerStatus() {
    if (!navigator.onLine) {
      setIsOnline(false);
      setIsServerReachable(false);
      return;
    }

    setIsOnline(true);
    try {
      const health = await fetchHealth();
      const reachable = health.status === "ok" && health.database === "connected";
      setIsServerReachable(reachable);
      if (reachable) {
        setLastSuccessfulConnection(new Date().toISOString());
      }
    } catch {
      setIsServerReachable(false);
    }
  }

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      void refreshServerStatus();
    }

    function handleOffline() {
      setIsOnline(false);
      setIsServerReachable(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void refreshServerStatus();
    const intervalId = window.setInterval(() => void refreshServerStatus(), 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(intervalId);
    };
  }, []);

  const value = useMemo(
    () => ({
      refreshServerStatus,
      status: {
        isOnline,
        isServerReachable,
        lastSuccessfulConnection,
      },
    }),
    [isOnline, isServerReachable, lastSuccessfulConnection],
  );

  return <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>;
}

export function useNetworkStatus() {
  const context = useContext(NetworkStatusContext);
  if (!context) {
    throw new Error("useNetworkStatus must be used within NetworkStatusProvider");
  }
  return context;
}
