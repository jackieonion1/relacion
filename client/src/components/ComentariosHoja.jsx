import React, { useState } from 'react';
import Sheet from './Sheet';
import Button from './Button';
import Icon from './Icon';
import { authorEmoji, noteWhen } from '../lib/noteText';
import { MAX_COMENTARIO, limpiarComentario } from '../lib/fotoComentarios';

// The comments of a photo, over the viewer: bubbles as the replies in Notas (ours on the right, in rose) and the
// reply box at the bottom. Tapping one of ours offers to delete it, in place (no alert). onSend(text) resolves
// once the comment is queued (offline too) and rejects if it could not be written
export default function ComentariosHoja({ isOpen, onClose, comentarios, cargando, identity, onSend, onDelete }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(false);
  const [elegido, setElegido] = useState(null);
  const list = comentarios || [];

  async function send(e) {
    e.preventDefault();
    if (!limpiarComentario(texto) || enviando) return;
    setEnviando(true);
    setError(false);
    try {
      await onSend(texto);
      setTexto('');
    } catch {
      setError(true);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col min-h-[min(60dvh,520px)]">
        <div className="flex items-center justify-between gap-3 pl-5 pr-2 pt-1.5">
          <h2 className="serif text-2xl leading-[1.15] font-normal">Comentarios</h2>
          <Button icon="cerrar" label="Cerrar comentarios" onClick={onClose} />
        </div>

        <div className="flex-1 flex flex-col gap-2.5 px-5 pt-3 pb-4">
          {list.length === 0 ? (
            <p className="m-auto py-8 text-[15px] text-ink-2 text-center text-pretty max-w-[260px]">
              {cargando ? 'Cargando…' : 'Aún no hay comentarios. Lo que escribas le llega a la otra persona.'}
            </p>
          ) : list.map((c) => {
            const mine = c.identity === identity;
            return (
              <div key={c.id} className={`max-w-[85%] flex flex-col gap-1 ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
                <button
                  type="button"
                  disabled={!mine}
                  aria-expanded={mine ? elegido === c.id : undefined}
                  onClick={() => setElegido((x) => (x === c.id ? null : c.id))}
                  className={`block text-left py-2.5 px-3.5 text-base leading-[1.45] whitespace-pre-wrap break-words transition-transform enabled:active:scale-[0.98] disabled:cursor-default ${
                    mine ? 'bg-lacre-soft rounded-[20px_20px_6px_20px]' : 'bg-card border border-line rounded-[20px_20px_20px_6px]'
                  }`}
                >
                  {c.text}
                </button>
                <span className="flex items-center gap-1.5 text-xs text-ink-2">
                  {authorEmoji(c.identity) && <>{authorEmoji(c.identity)} · </>}{noteWhen(c)}
                </span>
                {mine && elegido === c.id && (
                  <Button variant="txt" className="text-danger -mr-3" onClick={() => { setElegido(null); onDelete(c); }}>Borrar comentario</Button>
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={send} className="sticky bottom-0 flex flex-col gap-1 px-3 py-2 border-t border-line bg-bar backdrop-blur-[18px]">
          {error && <p role="alert" className="px-2 text-[13px] text-danger">No se pudo enviar. Inténtalo de nuevo.</p>}
          <div className="flex items-center gap-2 h-11 pl-4 pr-1 rounded-full border border-line bg-card focus-within:border-ink">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={MAX_COMENTARIO}
              placeholder="Escribe un comentario…"
              aria-label="Escribe un comentario"
              enterKeyHint="send"
              className="flex-1 min-w-0 bg-transparent text-base text-ink placeholder:text-ink-2 outline-none"
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={!limpiarComentario(texto) || enviando}
              className="flex items-center justify-center size-9 shrink-0 rounded-full bg-lacre text-on-lacre disabled:opacity-40 active:scale-95 transition-transform"
            >
              <Icon name="enviar" size={20} />
            </button>
          </div>
        </form>
      </div>
    </Sheet>
  );
}
