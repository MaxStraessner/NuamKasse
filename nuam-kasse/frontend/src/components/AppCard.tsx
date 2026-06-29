import type { PropsWithChildren } from "react";

type AppCardProps = PropsWithChildren<{
  className?: string;
  ariaLabel?: string;
}>;

export function AppCard({ children, className = "", ariaLabel }: AppCardProps) {
  return (
    <section className={`app-card ${className}`.trim()} aria-label={ariaLabel}>
      {children}
    </section>
  );
}
