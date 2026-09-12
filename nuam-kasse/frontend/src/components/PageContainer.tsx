import type { PropsWithChildren } from "react";

type PageContainerProps = PropsWithChildren<{ className?: string }>;

export function PageContainer({
  children,
  className = "",
}: PageContainerProps) {
  return (
    <main className={`page-container ${className}`.trim()}>{children}</main>
  );
}
