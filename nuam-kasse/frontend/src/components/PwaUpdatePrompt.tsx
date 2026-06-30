import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

export function PwaUpdatePrompt() {
  const [updateServiceWorker, setUpdateServiceWorker] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    const update = registerSW({
      immediate: false,
      onNeedRefresh() {
        setUpdateServiceWorker(() => update);
      },
      onOfflineReady() {
        return undefined;
      },
    });
  }, []);

  if (!updateServiceWorker) {
    return null;
  }

  return (
    <div className="pwa-prompt pwa-prompt--update" role="status">
      <div>
        <strong>Neue Version verfuegbar</strong>
        <span>Aktualisiere bewusst, wenn gerade keine Eingabe laeuft.</span>
      </div>
      <div className="pwa-prompt__actions">
        <button type="button" onClick={() => void updateServiceWorker(true)}>
          Jetzt aktualisieren
        </button>
        <button type="button" onClick={() => setUpdateServiceWorker(null)}>
          Spaeter
        </button>
      </div>
    </div>
  );
}
