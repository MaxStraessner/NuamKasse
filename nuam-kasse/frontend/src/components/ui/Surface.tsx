import type { HTMLAttributes, PropsWithChildren } from "react";

type SurfaceProps = PropsWithChildren<HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article";
  tone?: "default" | "muted" | "elevated";
}>;

export function Surface({
  as: Component = "section",
  children,
  className = "",
  tone = "default",
  ...props
}: SurfaceProps) {
  return (
    <Component className={`ui-surface ui-surface--${tone} ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}
