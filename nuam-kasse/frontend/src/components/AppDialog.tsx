import { type PropsWithChildren, type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type AppDialogProps = PropsWithChildren<{
  title: string;
  description?: string;
  footer?: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  closeLabel?: string;
  className?: string;
  preventClose?: boolean;
}>;

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let activeDialogCount = 0;

export function AppDialog({ children, className = "", closeLabel = "Dialog schließen", description, footer, isOpen, onClose, preventClose = false, title }: AppDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById("root") as (HTMLElement & { inert?: boolean }) | null;
    const previousOverflow = document.body.style.overflow;
    activeDialogCount += 1;
    document.body.style.overflow = "hidden";
    if (root) root.inert = true;
    const coveredDialogs = Array.from(document.querySelectorAll<HTMLElement>(".app-dialog"))
      .filter((dialog) => dialog !== panelRef.current) as Array<HTMLElement & { inert?: boolean }>;
    coveredDialogs.forEach((dialog) => {
      dialog.inert = true;
      dialog.setAttribute("aria-hidden", "true");
    });

    window.requestAnimationFrame(() => {
      const initialFocus = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")
        ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        ?? panelRef.current;
      initialFocus?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      const openDialogs = Array.from(document.querySelectorAll<HTMLElement>(".app-dialog"));
      if (openDialogs[openDialogs.length - 1] !== panelRef.current) return;
      if (event.key === "Escape" && !preventClose) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      activeDialogCount = Math.max(0, activeDialogCount - 1);
      if (activeDialogCount === 0) {
        document.body.style.overflow = previousOverflow;
        if (root) root.inert = false;
      }
      coveredDialogs.forEach((dialog) => {
        dialog.inert = false;
        dialog.removeAttribute("aria-hidden");
      });
      previousFocus?.focus();
    };
  }, [isOpen, preventClose]);

  if (!isOpen) return null;
  return createPortal(
    <div className="app-dialog__backdrop" onMouseDown={(event) => {
      if (!preventClose && event.target === event.currentTarget) onClose();
    }} role="presentation">
      <div aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className={`app-dialog ${className}`.trim()} ref={panelRef} role="dialog" tabIndex={-1}>
        <header className="app-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button aria-label={closeLabel} className="icon-button" disabled={preventClose} onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="app-dialog__body">{children}</div>
        {footer ? <footer className="app-dialog__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
