import React, { useState, useEffect, useMemo } from 'react';

const pad2 = (n) => String(n).padStart(2, '0');

// Live countdown (D/H/M/S, every second) in one line: "12 d · 04 h · 22 min · 10 s". The days drop out on the last day
const Countdown = ({ toDate, className = '' }) => {
  const targetDate = useMemo(() => new Date(toDate), [toDate]);

  const calculateTimeLeft = () => {
    const difference = +targetDate - +new Date();
    let timeLeft = {};

    if (difference > 0) {
      timeLeft = {
        Días: Math.floor(difference / (1000 * 60 * 60 * 24)),
        Horas: Math.floor((difference / (1000 * 60 * 60)) % 24),
        Minutos: Math.floor((difference / 1000 / 60) % 60),
        Segundos: Math.floor((difference / 1000) % 60),
      };
    }

    return timeLeft;
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  if (timeLeft.Días == null) {
    return <p className={`text-[13px] font-semibold text-accent-ink ${className}`}>¡El evento ha llegado!</p>;
  }
  const { Días: d, Horas: h, Minutos: m, Segundos: s } = timeLeft;
  return (
    <p
      role="timer"
      aria-label={`Faltan ${d} días, ${h} horas y ${m} minutos`}
      className={`num text-[13px] font-semibold text-accent-ink ${className}`}
    >
      {d > 0 ? `${d} d · ` : ''}{pad2(h)} h · {pad2(m)} min · {pad2(s)} s
    </p>
  );
};

export default Countdown;
