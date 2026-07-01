import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

type FieldProps = {
  children: ReactNode;
  htmlFor: string;
  label: string;
  error?: string | null;
  helpText?: string;
  isRequired?: boolean;
};

export function Field({
  children,
  error,
  helpText,
  htmlFor,
  isRequired = false,
  label,
}: FieldProps) {
  const descriptionId = helpText ? `${htmlFor}-help` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        id: (children as ReactElement<Record<string, unknown>>).props.id ?? htmlFor,
      })
    : children;

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={htmlFor}>
        <span>{label}</span>
        {isRequired ? <span aria-hidden="true">*</span> : null}
      </label>
      {control}
      {helpText ? (
        <p className="ui-field__help" id={descriptionId}>
          {helpText}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
