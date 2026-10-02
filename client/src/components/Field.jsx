import React, { useId } from 'react';

// Text field with its label always visible above (never only a placeholder). The error is announced with
// aria-invalid and its text, not only by colour. `multiline` renders a textarea
export default function Field({ label, error, hint, multiline = false, id, className = '', ...rest }) {
  const auto = useId();
  const fieldId = id || auto;
  const noteId = `${fieldId}-nota`;
  const Tag = multiline ? 'textarea' : 'input';
  const note = error || hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="etiqueta">{label}</label>
      <Tag
        id={fieldId}
        className={`input w-full ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        {...rest}
      />
      {note && (
        <span id={noteId} className={`text-[13px] ${error ? 'text-danger' : 'text-ink-2'}`}>{note}</span>
      )}
    </div>
  );
}
