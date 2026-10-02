import { useEffect, useMemo, useRef, useState } from 'react';
import { particles, sceneFor, seeded, skyKind, windTilt } from '../lib/escena';
import './CieloAnimado.css';

// Inline custom properties of one particle (CieloAnimado.css reads them): position, duration, delay, opacity, scale
const style = (p, extra) => ({
  '--x': `${p.x}%`, '--y': `${p.y}%`, '--t': `${p.t}s`, '--d': `${p.d}s`, '--o': p.o, '--s': p.s, ...extra,
});

// The animated sky behind a weather card: one scene per WMO code (lib/escena), by day and by night. Only transform
// and opacity move, so it runs on the GPU. aria-hidden: the card says the weather in words. `rafaga` is the tap:
// for two seconds the rain doubles, the sun pulses, the snow is shaken, a bolt falls. The seed (the city) keeps the
// particles in the same place when the card re-renders
export default function CieloAnimado({ code, phase = 'day', wind = null, seed = '', rafaga = false }) {
  const scene = useMemo(() => sceneFor(code), [code]);
  const night = phase === 'night';
  const sky = skyKind(scene, phase);

  // Out of the screen the animations stop (the browser already stops them with the app in the background)
  const root = useRef(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function' || !root.current) return undefined;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(root.current);
    return () => io.disconnect();
  }, []);

  const sets = useMemo(() => {
    const r = seeded(`${code}|${seed}`);
    const fall = scene.storm ? { t0: 0.55, t1: 0.75 } : scene.fine ? { t0: 1.2, t1: 1.7 } : { t0: 0.7, t1: 0.9 };
    return {
      stars: particles(9, r, { t0: 2.5, t1: 5, o0: 0.5, o1: 1 }).map((p) => ({ ...p, y: p.y * 0.7 })),
      clouds: particles(scene.clouds, r, { t0: 32, t1: 50, o0: 0.7, o1: 1 }).map((p) => ({ ...p, y: p.y * 0.7 })),
      drops: particles(scene.drops, r, { ...fall, o0: scene.fine ? 0.45 : 0.65, o1: scene.fine ? 0.75 : 1 }),
      flakes: particles(scene.flakes, r, scene.grains ? { t0: 1.6, t1: 2.4 } : { t0: 4, t1: 7, o0: 0.65, o1: 1 }),
      hail: particles(scene.hail, r, { t0: 0.9, t1: 1.3, o0: 0.8, o1: 1 }),
      bolt: particles(1, r, { t0: code === 97 ? 4.5 : 6, t1: code === 97 ? 6 : 9 })[0],
    };
  }, [code, seed, scene]);

  // The extra drops and flakes of the tap, only while it lasts
  const extra = useMemo(() => {
    const r = seeded(`${code}|${seed}|rafaga`);
    return {
      drops: particles(Math.min(scene.drops, 24), r, { t0: 0.6, t1: 0.8 }),
      flakes: particles(Math.min(scene.flakes, 20), r, { t0: 3, t1: 5, o0: 0.65, o1: 1 }),
    };
  }, [code, seed, scene]);

  const gusts = scene.gusts ? ' rachas' : '';
  const tilt = windTilt(wind);

  return (
    <div
      ref={root}
      aria-hidden="true"
      className={`cielo-anim tipo-${scene.type}${night ? ' es-noche' : ''}${rafaga ? ' rafaga' : ''}`}
      data-escena={scene.type}
      data-pausa={visible ? undefined : ''}
    >
      {(phase === 'dawn' || phase === 'dusk') && <span className="esc-resplandor" />}

      {sky === 'sol' && (
        <span className="esc-sol">
          <i className="esc-aura" />
          <svg className="esc-rayos" viewBox="-50 -50 100 100">
            {Array.from({ length: 12 }, (_, k) => (
              <line key={k} x1="0" y1="-30" x2="0" y2="-44" transform={`rotate(${k * 30})`} />
            ))}
          </svg>
          <i className="esc-disco" />
        </span>
      )}
      {sky === 'estrellas' && sets.stars.map((p) => <i key={p.i} className="esc-estrella" style={style(p)} />)}
      {sky === 'estrellas' && rafaga && <i className="esc-fugaz" />}

      {sets.clouds.map((p) => (
        <span key={p.i} className="esc-nube" style={style(p)}><i /></span>
      ))}

      {scene.fog && (
        <>
          <span className="esc-banda" />
          <span className="esc-banda esc-banda-2" />
        </>
      )}
      {scene.frost && <span className="esc-escarcha" />}

      {scene.drops > 0 && (
        <div className={`esc-lluvia${gusts}`} style={{ transform: `rotate(${tilt}deg)` }}>
          {sets.drops.map((p) => <i key={p.i} className="esc-gota" style={style(p)} />)}
          {rafaga && extra.drops.map((p) => <i key={`r${p.i}`} className="esc-gota esc-extra" style={style(p)} />)}
        </div>
      )}

      {scene.flakes > 0 && (
        <div className={`esc-nieve${gusts}${scene.grains ? ' esc-granos' : ''}`}>
          {sets.flakes.map((p) => <i key={p.i} className="esc-copo" style={style(p)}><b /></i>)}
          {rafaga && extra.flakes.map((p) => <i key={`r${p.i}`} className="esc-copo esc-extra" style={style(p)}><b /></i>)}
        </div>
      )}

      {scene.hail > 0 && sets.hail.map((p) => <i key={p.i} className="esc-granizo" style={style(p)} />)}

      {scene.storm && (
        <>
          <span className="esc-destello" style={style(sets.bolt, { '--d': `${(sets.bolt.t / 3).toFixed(1)}s` })} />
          <svg className="esc-rayo" viewBox="0 0 20 36" style={style(sets.bolt, { '--d': `${(sets.bolt.t / 3).toFixed(1)}s` })}>
            <polygon points="12,0 2,20 9,20 6,36 18,13 11,13" />
          </svg>
          {rafaga && (
            <>
              <span className="esc-destello esc-ya" />
              <svg className="esc-rayo esc-ya" viewBox="0 0 20 36" style={{ '--x': '62%' }}>
                <polygon points="12,0 2,20 9,20 6,36 18,13 11,13" />
              </svg>
            </>
          )}
        </>
      )}
    </div>
  );
}
