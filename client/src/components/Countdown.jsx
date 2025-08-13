import React, { useState, useEffect, useMemo } from 'react';

const Countdown = ({ toDate }) => {
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

  const timerComponents = Object.entries(timeLeft).map(([interval, value]) => (
    <div key={interval} className="text-center">
      <div className="text-2xl md:text-3xl font-bold text-rose-600">{String(value).padStart(2, '0')}</div>
      <div className="text-xs text-gray-500 capitalize">{interval}</div>
    </div>
  ));

  return (
    <div>
      {timerComponents.length ? (
        <div className="flex justify-around gap-2 p-3 bg-rose-50/50 rounded-lg">
            {timerComponents}
        </div>
      ) : (
        <div className="text-center p-3 bg-rose-50/50 rounded-lg">
          <span className="text-gray-600 font-medium">¡El evento ha llegado!</span>
        </div>
      )}
    </div>
  );
};

export default Countdown;
