import type { HealthCheck } from "../types/health";

type HealthStatusProps = {
  status: "checking" | "online" | "offline";
  health?: HealthCheck;
};

export function HealthStatus({ status, health }: HealthStatusProps) {
  const labelByStatus = {
    checking: "Backend wird geprueft",
    online: "Backend erreichbar",
    offline: "Backend nicht erreichbar",
  };

  return (
    <div className={`health-badge health-badge--${status}`} role="status">
      <span className="health-badge__pulse" aria-hidden="true" />
      <span>{labelByStatus[status]}</span>
      {health?.version ? (
        <span className="health-badge__meta">v{health.version}</span>
      ) : null}
    </div>
  );
}
