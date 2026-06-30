import { useNetworkStatus } from "../app/NetworkStatusContext";

export function OfflineNotice() {
  const { refreshServerStatus, status } = useNetworkStatus();

  if (status.isOnline && status.isServerReachable) {
    return null;
  }

  return (
    <div className="offline-notice" role="status">
      <div>
        <strong>Keine Verbindung zum Server</strong>
        <span>Die angezeigten Daten sind moeglicherweise nicht aktuell. Neue Buchungen sind erst wieder mit Serververbindung moeglich.</span>
      </div>
      <button type="button" onClick={() => void refreshServerStatus()}>
        Erneut pruefen
      </button>
    </div>
  );
}
