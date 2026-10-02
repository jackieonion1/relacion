import React, { useState, useEffect } from 'react';
import HeartRainAnimation from '../components/HeartRainAnimation';
import SimpleMap from '../components/SimpleMap';
import Sheet from '../components/Sheet';
import Button from '../components/Button';
import { getMapState, setMapState, subscribeToMapState } from '../lib/mapState';
import './Map.css';

const STATES = [
  { id: 'home', label: 'En casa', emoji: '🏠' },
  { id: 'traveling', label: 'De camino', emoji: '🚀' },
  { id: 'together', label: 'Juntos', emoji: '💖' }
];

// The hero of each state: same box as the map, so switching does not move what is below
const HERO = 'relative h-[280px] rounded-hero overflow-hidden border border-line flex flex-col items-center justify-center text-center p-6';

// ViewSwitcher component for map states
function MapViewSwitcher({ activeState, onRequestChange }) {
  return (
    <section aria-labelledby="mapa-estados" className="flex flex-col gap-2 pt-[18px]">
      <h2 id="mapa-estados" className="etiqueta px-1">Cómo estamos</h2>
      <div className="grid grid-cols-3 gap-2">
        {STATES.map(state => {
          const on = activeState === state.id;
          return (
            <button
              key={state.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (state.id !== activeState) {
                  onRequestChange(state.id, state.label, state.emoji);
                }
              }}
              className={`h-[84px] rounded-[18px] border-[1.5px] flex flex-col items-center justify-center gap-1.5 text-sm font-semibold transition-colors duration-200 ease-suave active:scale-[0.97] ${
                on ? 'border-lacre bg-lacre-soft text-accent-ink' : 'border-line bg-card text-ink'
              }`}
            >
              <span aria-hidden="true" className="text-[28px] leading-none">{state.emoji}</span>
              {state.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Traveling animation component
function TravelingAnimation() {
  return (
    <div role="status" className={`${HERO} mapa-cielo gap-2.5`}>
      <span aria-hidden="true" className="relative inline-block text-[64px] leading-none mb-1.5">
        <span className="mapa-cohete">🚀</span>
        <span className="mapa-brillo text-[22px]" style={{ top: -10, right: -22 }}>✨</span>
        <span className="mapa-brillo text-xl" style={{ bottom: -6, left: -24, animationDelay: '500ms' }}>✨</span>
      </span>
      <p className="serif text-[30px] leading-[1.1] text-ink">De camino…</p>
      <p className="text-base font-semibold text-accent-ink">¡Pronto estaremos juntos!</p>
    </div>
  );
}

export default function MapPage() {
  // The local copy shows at once; Firestore refines it (without a session it may take up to the auth wait)
  const [currentState, setCurrentState] = useState(() => localStorage.getItem('mapState') || 'home');
  const [showHeartRain, setShowHeartRain] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !localStorage.getItem('mapState'));
  const [saveError, setSaveError] = useState(''); // write rejected after the modal was closed
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    newState: '',
    newStateLabel: '',
    newStateEmoji: ''
  });

  // Load initial state from Firestore and subscribe to changes
  useEffect(() => {
    let cancelled = false;
    // Subscribe first: the unsubscribe is sync, so leaving the page before getMapState resolves still cancels it
    const unsubscribe = subscribeToMapState((newState) => {
      if (!cancelled) setCurrentState(newState);
    });

    (async () => {
      try {
        // Get initial state
        const initialState = await getMapState();
        if (cancelled) return;
        setCurrentState(initialState);
        setIsLoading(false);
      } catch (e) {
        console.error('Error loading map state:', e);
        if (cancelled) return;
        setCurrentState(localStorage.getItem('mapState') || 'home');
        setIsLoading(false);
      }
    })();

    return () => { cancelled = true; unsubscribe(); };
  }, []);

  // Handle state changes and animations
  useEffect(() => {
    // Show heart rain animation when "together" is selected
    if (currentState === 'together') {
      setShowHeartRain(true);
    } else {
      setShowHeartRain(false);
    }
  }, [currentState]);

  // Handle state change request (shows confirmation modal)
  const handleStateChangeRequest = (newState, newStateLabel, newStateEmoji) => {
    setConfirmationModal({
      isOpen: true,
      newState,
      newStateLabel,
      newStateEmoji
    });
  };

  // Confirm and apply state change
  // Closes at once: offline the server ack never arrives (the write stays queued); only a rejection is shown
  const confirmStateChange = async () => {
    const { newState, newStateLabel } = confirmationModal;
    setCurrentState(newState);
    setSaveError('');
    setConfirmationModal({
      isOpen: false,
      newState: '',
      newStateLabel: '',
      newStateEmoji: ''
    });
    const { committed } = await setMapState(newState);
    committed.catch(() => {
      setSaveError(`No se pudo guardar el estado "${newStateLabel}". La otra persona no lo verá.`);
    });
  };

  // Cancel state change
  const cancelStateChange = () => {
    setConfirmationModal({
      isOpen: false,
      newState: '',
      newStateLabel: '',
      newStateEmoji: ''
    });
  };

  const switcher = (
    <MapViewSwitcher
      activeState={currentState}
      onRequestChange={handleStateChangeRequest}
    />
  );

  const renderContent = () => {
    switch (currentState) {
      case 'home':
        return <SimpleMap>{switcher}</SimpleMap>;

      case 'traveling':
        return (
          <>
            <TravelingAnimation />
            {switcher}
          </>
        );

      case 'together':
        return (
          <>
            <div role="status" className={`${HERO} bg-lacre-soft gap-2`}>
              <span className="mapa-sello text-[72px] leading-none" aria-hidden="true">💖</span>
              <p className="serif italic text-[36px] leading-[1.05] text-accent-ink">¡Juntos!</p>
              <p className="text-[15px] text-ink-2">🫒 y 🍪 en el mismo sitio</p>
            </div>
            <div className="flex items-baseline justify-between px-1 pt-3.5">
              <span className="etiqueta">Distancia</span>
              <span className="serif num text-[28px] text-ink">0 km 💖</span>
            </div>
            {switcher}
          </>
        );

      default:
        return switcher;
    }
  };

  const title = <h1 className="serif text-[36px] leading-[1.05] font-normal tracking-[-0.01em] text-ink px-1 pt-1.5 pb-3.5">Mapa</h1>;

  if (isLoading) {
    return (
      <div className="px-4">
        {title}
        <div role="status" className="h-[280px] rounded-hero bg-sunk animate-pulse">
          <span className="sr-only">Cargando estado…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 relative pb-20">
      {title}
      {saveError && (
        <div role="alert" className="mb-3 flex items-center justify-between gap-3 pl-4 pr-1 py-1 rounded-control bg-card border border-line text-sm text-danger">
          <span>{saveError}</span>
          <Button icon="cerrar" label="Cerrar aviso" onClick={() => setSaveError('')} />
        </div>
      )}

      {renderContent()}

      {/* Heart rain animation for "together" state */}
      {showHeartRain && (
        <HeartRainAnimation
          type="fireworks"
          isActive={true}
          onStop={() => setShowHeartRain(false)}
        />
      )}

      {/* Confirmation sheet; while the fireworks fall it leaves room for «Parar la fiesta», which floats above it */}
      <Sheet isOpen={confirmationModal.isOpen} onClose={cancelStateChange}>
        <div className={`flex flex-col gap-1.5 px-5 pt-1.5 transition-[padding] duration-200 ${showHeartRain ? 'pb-[10.5rem]' : 'pb-[34px]'}`}>
          <div className="text-4xl leading-none py-2" aria-hidden="true">{confirmationModal.newStateEmoji}</div>
          <h2 className="serif text-[26px] leading-[1.15] font-normal">¿Cambiar a «{confirmationModal.newStateLabel}»?</h2>
          <p className="text-[15px] text-ink-2 pb-3.5">Lo verá la otra persona en su mapa.</p>
          <Button size="l" onClick={confirmStateChange}>Cambiar</Button>
          <Button variant="txt" size="l" onClick={cancelStateChange}>Cancelar</Button>
        </div>
      </Sheet>
    </div>
  );
}
