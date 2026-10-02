import React from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import { authorEmoji, notePlain, noteWhen } from '../lib/noteText';

// One thread in the Notas list (Notas.dc.html): serif title, the latest message as a two-line preview, and who
// wrote it, when and how many replies. The dot says something in it is unread for us
export default function NoteCard({ thread, onOpen }) {
  const { items, latest, unread } = thread;
  const title = items[0]?.title || latest?.title || '';
  const who = authorEmoji(latest?.identity);
  const replies = items.length - 1;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-2 w-full py-4 px-[18px] rounded-tarjeta bg-card border border-line shadow-carta text-left transition-transform active:scale-[0.98]"
    >
      {(title || unread) && (
        <span className="flex items-center gap-2.5 w-full min-w-0">
          <span className="serif flex-1 min-w-0 text-[21px] leading-[1.2] break-words">{title}</span>
          {unread && (
            <>
              <span aria-hidden="true" className="size-2 rounded-full bg-lacre shrink-0" />
              <span className="sr-only">Sin leer</span>
            </>
          )}
        </span>
      )}
      {latest?.html ? (
        <span className={`line-clamp-2 break-words whitespace-pre-line text-[15px] leading-[1.45] ${title ? 'text-ink-2' : 'text-ink'}`}>
          {notePlain(latest)}
        </span>
      ) : (
        <span className={`note-card block max-h-[2.9em] overflow-hidden text-[15px] leading-[1.45] ${title ? 'text-ink-2' : 'text-ink'}`}>
          <MarkdownRenderer markdown={latest?.body || ''} />
        </span>
      )}
      <span className="flex items-center gap-2 text-[13px] text-ink-2">
        {who && <span className="inline-flex items-center justify-center size-6 rounded-full bg-sunk text-[13px] leading-none">{who}</span>}
        {noteWhen(latest)}
        {replies > 0 && <> · {replies} {replies === 1 ? 'respuesta' : 'respuestas'}</>}
      </span>
    </button>
  );
}
