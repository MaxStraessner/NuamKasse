import { useEffect } from "react";
import { registerSW } from "virtual:pwa-register";

export function PwaUpdatePrompt() {
  useEffect(() => {
    registerSW({ immediate: true });
  }, []);

  return null;
}
