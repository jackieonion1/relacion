import React, { useRef } from 'react';

function surroundSelection(textarea, before, after = before) {
  const el = textarea;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const value = el.value;
  const selected = value.slice(start, end);
  const newValue = value.slice(0, start) + before + selected + after + value.slice(end);
  const newCursor = start + before.length + selected.length + after.length;
  return { value: newValue, selectionStart: newCursor, selectionEnd: newCursor };
}

function linePrefixSelection(textarea, prefixGenerator) {
  const el = textarea;
  const value = el.value;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;

  // Expand to full lines
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = (() => {
    const idx = value.indexOf('\n', end);
    return idx === -1 ? value.length : idx;
  })();
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const updated = lines.map((l, i) => `${prefixGenerator(i)}${l}`);
  const newBlock = updated.join('\n');
  const newValue = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
  const delta = newBlock.length - block.length;
  return { value: newValue, selectionStart: start + 0, selectionEnd: end + delta };
}

export default function MarkdownEditor({ value, onChange, className = '' }) {
  const ref = useRef(null);

  const apply = (fn) => {
    const el = ref.current;
    if (!el) return;
    const result = fn(el);
    if (!result) return;
    onChange(result.value);
    // Update selection asap
    requestAnimationFrame(() => {
      try {
        el.focus();
        el.setSelectionRange(result.selectionStart, result.selectionEnd);
      } catch {}
    });
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2 mb-2">
        <button type="button" className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm" onClick={() => apply((el) => surroundSelection(el, '**'))}>
          Negrita
        </button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm" onClick={() => apply((el) => surroundSelection(el, '*'))}>
          Cursiva
        </button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm" onClick={() => apply((el) => linePrefixSelection(el, () => '- '))}>
          Lista •
        </button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm" onClick={() => apply((el) => linePrefixSelection(el, (i) => `${i + 1}. `))}>
          Lista 1.
        </button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm" onClick={() => apply((el) => linePrefixSelection(el, () => '# '))}>
          Título
        </button>
        <button type="button" className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm" onClick={() => apply((el) => surroundSelection(el, '[', '](https://)'))}>
          Enlace
        </button>
      </div>
      <textarea
        ref={ref}
        className="input w-full h-40 resize-y leading-relaxed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escribe tu nota en Markdown…"
      />
    </div>
  );
}
