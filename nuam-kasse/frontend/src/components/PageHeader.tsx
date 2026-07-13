import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

type PageHeaderProps = { title: string; eyebrow?: string; backTo?: string; backLabel?: string; action?: ReactNode };

export function PageHeader({ action, backLabel = "Zurück", backTo, eyebrow, title }: PageHeaderProps) {
  return (
    <header className="page-header">
      {backTo ? <Link aria-label={`Zurück zu ${backLabel}`} className="page-header__back" to={backTo}><ChevronLeft aria-hidden="true" /><span>{backLabel}</span></Link> : null}
      <div className="page-header__title">{eyebrow ? <p>{eyebrow}</p> : null}<h1>{title}</h1></div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}
