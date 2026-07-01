import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

type StatusMessageVariant = "success" | "error" | "warning" | "info";

type StatusMessageProps = {
  children: ReactNode;
  variant?: StatusMessageVariant;
};

const iconByVariant = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: TriangleAlert,
  info: Info,
};

export function StatusMessage({ children, variant = "info" }: StatusMessageProps) {
  const Icon = iconByVariant[variant];
  const role = variant === "error" || variant === "warning" ? "alert" : "status";

  return (
    <div className={`ui-status ui-status--${variant}`} role={role}>
      <Icon aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
