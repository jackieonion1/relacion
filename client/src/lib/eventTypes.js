// What the screens call each event type and each role. Only the labels may change: the stored
// values (eventType 'conjunto' | 'novio' | 'novia', locations/novio and /novia) never do

export const ROLE_LABELS = { novio: 'Novio', novia: 'Novia' };

export const EVENT_TYPES = [
  { value: 'conjunto', emoji: '🩷', text: 'Los dos', color: 'bg-rose-500' },
  { value: 'novio', emoji: '💛', text: ROLE_LABELS.novio, color: 'bg-yellow-500' },
  { value: 'novia', emoji: '💜', text: ROLE_LABELS.novia, color: 'bg-purple-500' }
];
