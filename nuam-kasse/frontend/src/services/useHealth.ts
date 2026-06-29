import { useEffect, useState } from "react";

import { fetchHealth } from "./healthApi";
import type { HealthCheck } from "../types/health";

type HealthState =
  | { status: "checking"; data?: undefined; error?: undefined }
  | { status: "online"; data: HealthCheck; error?: undefined }
  | { status: "offline"; data?: undefined; error: Error };

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ status: "checking" });

  useEffect(() => {
    let isMounted = true;

    setState({ status: "checking" });
    fetchHealth()
      .then((data) => {
        if (isMounted) {
          setState({ status: "online", data });
        }
      })
      .catch((error: Error) => {
        if (isMounted) {
          setState({ status: "offline", error });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return state;
}
