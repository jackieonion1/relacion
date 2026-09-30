import React, { useState, useEffect } from 'react';
import HeartRainAnimation from '../components/HeartRainAnimation';
import SimpleMap from '../components/SimpleMap';
import Modal from '../components/Modal';
import { getMapState, setMapState, subscribeToMapState } from '../lib/mapState';

// ViewSwitcher component for map states
function MapViewSwitcher({ activeState, onRequestChange }) {
  const states = [
    { id: 'home', label: 'En casa', emoji: '🏠' },
    { id: 'traveling', label: 'De camino', emoji: '🚀' },
    { id: 'together', label: 'Juntos', emoji: '💖' }
  ];

  return (
    <div className="flex bg-gray-100 rounded-xl p-1">
      {states.map(state => (
        <button
          key={state.id}
          onClick={() => {
            if (state.id !== activeState) {
              onRequestChange(state.id, state.label, state.emoji);
            }
          }}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            activeState === state.id
              ? 'bg-white text-rose-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span className="mr-1">{state.emoji}</span>
          {state.label}
        </button>
      ))}
    </div>
  );
}

// Traveling animation component
function TravelingAnimation() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="relative">
        <div className="text-6xl animate-bounce">🚀</div>
        <div className="absolute -top-2 -right-2 text-2xl animate-pulse">✨</div>
        <div className="absolute -bottom-2 -left-2 text-2xl animate-pulse delay-300">✨</div>
      </div>
      <div className="ml-4 text-center">
        <div className="text-lg font-semibold text-gray-900 mb-1">De camino...</div>
        <div className="text-sm text-gray-600">¡Pronto estaremos juntos!</div>
      </div>
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

  // Live distance and city labels from SimpleMap
  const [distanceInfo, setDistanceInfo] = useState({
    distanceKm: null,
    loading: false,
    cities: { novio: '', novia: '' }
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

  const renderContent = () => {
    switch (currentState) {
      case 'home':
        return (
          <div>
            <div className="text-center py-4">
              <div className="text-6xl mb-4">🏠</div>
              <div className="text-sm text-gray-600 mb-2">Distancia</div>
              <div className="text-3xl font-semibold text-rose-600 mb-1">
                {distanceInfo.loading
                  ? 'Calculando…'
                  : (distanceInfo.distanceKm != null ? `${distanceInfo.distanceKm} km` : '— km')}
              </div>
            </div>
            <SimpleMap onDistanceChange={setDistanceInfo} />
          </div>
        );
      
      case 'traveling':
        return <TravelingAnimation />;
      
      case 'together':
        return (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">💖</div>
            <div className="text-lg font-semibold text-rose-600 mb-1">¡Juntos!</div>
            <div className="text-sm text-gray-600">Distancia: 0 km</div>
          </div>
        );
      
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="card">
          <div className="text-center py-8 text-gray-600">
            Cargando estado...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 relative pb-20">
      <h2 className="text-lg font-semibold text-rose-600">Mapa</h2>
      {saveError && (
        <div className="card flex items-center justify-between gap-3 text-sm text-rose-600">
          <span>{saveError}</span>
          <button type="button" onClick={() => setSaveError('')} className="btn-link" aria-label="Cerrar aviso">×</button>
        </div>
      )}
      <div className="card">
        <div className="text-sm text-gray-600 mb-3">Estado actual</div>
        <MapViewSwitcher 
          activeState={currentState} 
          onRequestChange={handleStateChangeRequest} 
        />
      </div>

      <div className="card">
        {renderContent()}
      </div>

      {/* Heart rain animation for "together" state */}
      {showHeartRain && (
        <HeartRainAnimation 
          type="fireworks" 
          isActive={true}
          onStop={() => setShowHeartRain(false)}
        />
      )}

      {/* Confirmation modal */}
      <Modal isOpen={confirmationModal.isOpen} onClose={cancelStateChange}>
        <div className="p-6 text-center">
          <div className="text-4xl mb-4">{confirmationModal.newStateEmoji}</div>
          <h3 className="text-lg font-semibold mb-2">Cambiar estado</h3>
          <p className="text-gray-600 mb-6">
            ¿Quieres cambiar el estado a <strong>"{confirmationModal.newStateLabel}"</strong>?
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Este cambio se sincronizará con todas las sesiones abiertas.
          </p>
          <div className="flex gap-3 justify-center">
            <button 
              onClick={cancelStateChange}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={confirmStateChange}
              className="btn-primary"
            >
              Confirmar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
