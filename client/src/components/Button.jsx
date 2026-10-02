import React from 'react';
import Icon from './Icon';

const VARIANTS = { pri: 'btn-pri', sec: 'btn-sec', txt: 'btn-txt', dan: 'btn-dan', inv: 'btn-inv' };
const SIZES = { base: '', m: 'btn-m', l: 'btn-l', xl: 'btn-xl' };

// The one button (Componentes.dc.html): pri is the rose one, one per screen. Busy: disabled with aria-busy and the
// busy text, same size. Without children it is a 44 × 44 icon button and `label` is its name
export default function Button({
  variant = 'pri', size = 'base', icon, accent = false, busy = false, busyText, label,
  type = 'button', disabled, className = '', children, ...rest
}) {
  const iconOnly = icon && !children;
  const classes = [
    'btn',
    iconOnly ? 'btn-icono' : VARIANTS[variant],
    SIZES[size],
    icon && !iconOnly ? 'btn-ic' : '',
    accent ? 'btn-acc' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-label={iconOnly ? label : undefined}
      {...rest}
    >
      {icon && <Icon name={icon} size={iconOnly ? 24 : 20} />}
      {busy && busyText ? busyText : children}
    </button>
  );
}
