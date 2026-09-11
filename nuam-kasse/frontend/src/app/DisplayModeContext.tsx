import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

export type DisplayPreference = "auto" | "web" | "mobile";
export type ResolvedDisplayMode = "desktop" | "mobile";

type DisplayModeContextValue = {
  preference: DisplayPreference;
  resolvedMode: ResolvedDisplayMode;
  isWebAvailable: boolean;
  setPreference: (preference: DisplayPreference) => void;
};

const DISPLAY_MODE_STORAGE_KEY = "nuam-kasse:display-mode";
const AUTO_DESKTOP_QUERY = "(min-width: 1024px)";
const MANUAL_WEB_QUERY = "(min-width: 768px)";

const DisplayModeContext = createContext<DisplayModeContextValue | undefined>(undefined);

function isDisplayPreference(value: string | null): value is DisplayPreference {
  return value === "auto" || value === "web" || value === "mobile";
}

function readStoredPreference(): DisplayPreference {
  if (typeof window === "undefined") {
    return "auto";
  }
  try {
    const stored = window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
    return isDisplayPreference(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

function matchesMedia(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(query).matches;
}

export function DisplayModeProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<DisplayPreference>(readStoredPreference);
  const [isAutoDesktop, setIsAutoDesktop] = useState(() => matchesMedia(AUTO_DESKTOP_QUERY));
  const [isWebAvailable, setIsWebAvailable] = useState(() => matchesMedia(MANUAL_WEB_QUERY));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const autoDesktopMedia = window.matchMedia(AUTO_DESKTOP_QUERY);
    const manualWebMedia = window.matchMedia(MANUAL_WEB_QUERY);
    const updateViewport = () => {
      setIsAutoDesktop(autoDesktopMedia.matches);
      setIsWebAvailable(manualWebMedia.matches);
    };

    updateViewport();
    autoDesktopMedia.addEventListener("change", updateViewport);
    manualWebMedia.addEventListener("change", updateViewport);
    return () => {
      autoDesktopMedia.removeEventListener("change", updateViewport);
      manualWebMedia.removeEventListener("change", updateViewport);
    };
  }, []);

  useEffect(() => {
    function syncPreference(event: StorageEvent) {
      if (event.key === DISPLAY_MODE_STORAGE_KEY && isDisplayPreference(event.newValue)) {
        setPreferenceState(event.newValue);
      }
    }

    window.addEventListener("storage", syncPreference);
    return () => window.removeEventListener("storage", syncPreference);
  }, []);

  const setPreference = useCallback((nextPreference: DisplayPreference) => {
    setPreferenceState(nextPreference);
    try {
      window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, nextPreference);
    } catch {
      // The preference remains valid for the current session when storage is unavailable.
    }
  }, []);

  const resolvedMode: ResolvedDisplayMode = preference === "mobile"
    ? "mobile"
    : preference === "web"
      ? (isWebAvailable ? "desktop" : "mobile")
      : (isAutoDesktop ? "desktop" : "mobile");

  const value = useMemo(
    () => ({ preference, resolvedMode, isWebAvailable, setPreference }),
    [isWebAvailable, preference, resolvedMode, setPreference],
  );

  return <DisplayModeContext.Provider value={value}>{children}</DisplayModeContext.Provider>;
}

export function useDisplayMode() {
  const context = useContext(DisplayModeContext);
  if (!context) {
    throw new Error("useDisplayMode must be used inside DisplayModeProvider");
  }
  return context;
}
