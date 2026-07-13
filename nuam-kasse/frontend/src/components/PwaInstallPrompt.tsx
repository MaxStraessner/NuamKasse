import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "nuam-kasse-install-dismissed-at";
const DISMISS_DAYS = 14;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function recentlyDismissed() {
  const value = window.localStorage.getItem(DISMISSED_KEY);
  if (!value) {
    return false;
  }
  const dismissedAt = Number(value);
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isStandalone);
  const [isDismissed, setIsDismissed] = useState(recentlyDismissed);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const shouldOfferIOSHelp = useMemo(() => isIOS() && !isInstalled, [isInstalled]);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      if (!recentlyDismissed() && !isStandalone()) {
        setInstallPrompt(event as BeforeInstallPromptEvent);
      }
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (isInstalled || isDismissed) {
    return null;
  }

  async function install() {
    if (!installPrompt) {
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "dismissed") {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
      setIsDismissed(true);
    }
  }

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setIsDismissed(true);
  }

  if (!installPrompt && !shouldOfferIOSHelp) {
    return null;
  }

  return (
    <div className="pwa-prompt" role="status">
      <div>
        <strong>Nuam Kasse installieren</strong>
        {showIOSHelp ? (
          <span>In Safari „Teilen“ öffnen und anschließend „Zum Home-Bildschirm“ wählen.</span>
        ) : (
          <span>Als App auf dem Startbildschirm nutzen.</span>
        )}
      </div>
      <div className="pwa-prompt__actions">
        {installPrompt ? (
          <button type="button" onClick={() => void install()}>
            App installieren
          </button>
        ) : null}
        {shouldOfferIOSHelp ? (
          <button type="button" onClick={() => setShowIOSHelp((current) => !current)}>
            iPhone Anleitung
          </button>
        ) : null}
        <button type="button" onClick={dismiss}>
          Später
        </button>
      </div>
    </div>
  );
}
