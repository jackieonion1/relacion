import React from 'react';
import Button from './Button';
import Icon from './Icon';
import MarkdownRenderer from './MarkdownRenderer';
import { sanitizeHtml } from '../lib/sanitize';
import { authorEmoji, noteWhen } from '../lib/noteText';

const isUnread = (note, identity) => Array.isArray(note.unreadFor) && note.unreadFor.includes(identity);

function Unread() {
  return (
    <>
      <span aria-hidden="true" className="inline-block size-2 rounded-full bg-lacre shrink-0" />
      <span className="sr-only">Sin leer</span>
    </>
  );
}

// Rich html (sanitised) or an old markdown note, same as everywhere else in Notas
export function NoteBody({ note, className = '' }) {
  return note.html ? (
    <div className={`note-content ${className}`.trim()} dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.html) }} />
  ) : (
    <div className={`note-content ${className}`.trim()}><MarkdownRenderer markdown={note.body || ''} /></div>
  );
}

// The open note (Nota.dc.html, "pantalla empujada" inside the sheet): back to Notas, options, the first note as a
// letter and the replies as bubbles, ours on the right. Every reply keeps its optional title. Tapping a bubble
// opens it alone. The bottom bar only looks like the reply box: it opens the full editor
export default function NoteThread({ items, identity, countLabel, unread, onBack, onOptions, onReply, onOpenMessage }) {
  const [first, ...replies] = items;
  return (
    // As tall as the sheet allows (92dvh, minus its handle and the bottom safe area): the "pushed screen" look
    <div className="flex flex-col min-h-[calc(92dvh_-_13px_-_env(safe-area-inset-bottom,0px))]">
      <header className="sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center px-2 pb-1 bg-card">
        <button
          type="button"
          onClick={onBack}
          className="justify-self-start flex items-center gap-0.5 h-11 pl-1 pr-3 rounded-control text-base font-semibold text-accent-ink active:bg-sunk"
        >
          <Icon name="atras" />Notas
        </button>
        <span className="flex items-center gap-2 etiqueta">
          {countLabel}
          {unread && <Unread />}
        </span>
        <Button icon="mas" label="Opciones de la nota" onClick={onOptions} className="justify-self-end" />
      </header>

      <div className="flex-1 flex flex-col gap-[18px] px-5 pt-2 pb-4">
        {first && (
          <article className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-[13px] text-ink-2">
              {authorEmoji(first.identity) && (
                <span className="inline-flex items-center justify-center size-7 rounded-full bg-sunk text-[15px] leading-none">{authorEmoji(first.identity)}</span>
              )}
              Escrita {noteWhen(first)}
              {isUnread(first, identity) && <Unread />}
            </p>
            {first.title && <h2 className="serif text-[32px] leading-[1.1] font-normal tracking-[-0.01em] break-words">{first.title}</h2>}
            <NoteBody note={first} className="text-[17px] leading-[1.55]" />
          </article>
        )}

        {replies.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <span className="flex-1 h-px bg-line" />
              <span className="etiqueta">{replies.length} {replies.length === 1 ? 'respuesta' : 'respuestas'}</span>
              <span className="flex-1 h-px bg-line" />
            </div>
            <div className="flex flex-col gap-2.5">
              {replies.map((it) => {
                const mine = it.identity === identity;
                return (
                  <div key={it.id} className={`max-w-[85%] flex flex-col gap-1 ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => onOpenMessage(it)}
                      className={`block w-full text-left py-2.5 px-3.5 text-base leading-[1.45] transition-transform active:scale-[0.98] ${
                        mine ? 'bg-lacre-soft rounded-[20px_20px_6px_20px]' : 'bg-card border border-line rounded-[20px_20px_20px_6px]'
                      }`}
                    >
                      {it.title && <span className="block font-semibold break-words">{it.title}</span>}
                      <NoteBody note={it} />
                    </button>
                    <span className="flex items-center gap-1.5 text-xs text-ink-2">
                      {authorEmoji(it.identity) && <>{authorEmoji(it.identity)} · </>}{noteWhen(it)}
                      {isUnread(it, identity) && <Unread />}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <footer className="sticky bottom-0 flex items-center gap-2 px-3 py-2 border-t border-line bg-bar backdrop-blur-[18px]">
        <button
          type="button"
          onClick={onReply}
          aria-label="Responder"
          className="flex-1 min-w-0 flex items-center justify-between h-11 pl-4 pr-1 rounded-full border border-line bg-card text-base text-ink-2 text-left"
        >
          Responder…
          <span aria-hidden="true" className="flex items-center justify-center size-9 rounded-full bg-lacre text-on-lacre">
            <Icon name="enviar" size={20} />
          </span>
        </button>
      </footer>
    </div>
  );
}
