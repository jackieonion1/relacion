import { useEffect, useState } from 'react';

const REDUCE = '(prefers-reduced-motion: reduce)';

// The system setting, read now: for timers and animations that CSS alone cannot switch off
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches;
}

// The same, following changes while the component lives
export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(REDUCE);
    const onChange = () => setReduce(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduce;
}
