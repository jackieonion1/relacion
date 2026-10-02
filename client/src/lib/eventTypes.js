// What the screens call each event type and each role. Only the labels may change: the stored
// values (eventType 'conjunto' | 'novio' | 'novia', locations/novio and /novia) never do

export const ROLE_LABELS = { novio: 'Novio', novia: 'Novia' };

export const EVENT_TYPES = [
  { value: 'conjunto', emoji: '🩷', text: 'Los dos', color: 'bg-lacre' },
  { value: 'novio', emoji: '💛', text: ROLE_LABELS.novio, color: 'bg-el' },
  { value: 'novia', emoji: '💜', text: ROLE_LABELS.novia, color: 'bg-ella' }
];

// The automatic birthday events take the colour of whoever has the birthday
const BIRTHDAY_TYPE = { 'sebas-birthday': 'novio', 'lucy-birthday': 'novia' };

// The type entry an event is painted with; anything unknown is 'conjunto', as it was saved by default
export function eventTypeOf(eventType) {
  const value = BIRTHDAY_TYPE[eventType] || eventType;
  return EVENT_TYPES.find((t) => t.value === value) || EVENT_TYPES[0];
}
