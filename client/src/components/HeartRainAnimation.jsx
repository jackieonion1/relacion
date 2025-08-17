import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function HeartRainAnimation({ isActive, type = 'rain', intensity = 1, effectOpacity = 1, zIndex = 10050 }) {
  const [hearts, setHearts] = useState([]);
  const intervalRef = useRef(null);
  const heartIdRef = useRef(0);

  useEffect(() => {
    if (!isActive) {
      setHearts([]);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const addHearts = () => {
      if (type === 'fireworks') {
        // Multiple random fireworks explosions (scaled by intensity)
        const baseExplosions = Math.floor(Math.random() * 3) + 2; // 2-4
        const explosionCount = Math.max(1, Math.round(baseExplosions * Math.max(0.2, Math.min(1, intensity))));
        
        for (let explosion = 0; explosion < explosionCount; explosion++) {
          const centerX = Math.random() * 80 + 10; // Random center (10-90%)
          const centerY = Math.random() * 60 + 20; // Random center (20-80%)
          const heartsPerExplosion = Math.max(6, Math.round(15 * (0.4 + 0.6 * Math.max(0.2, Math.min(1, intensity)))));
          
          setTimeout(() => {
            const newHearts = Array.from({ length: heartsPerExplosion }, (_, i) => {
              const angle = (i / heartsPerExplosion) * 2 * Math.PI;
              const distanceScale = 0.7 + 0.3 * Math.max(0.2, Math.min(1, intensity));
              const distance = (100 + Math.random() * 150) * distanceScale;
              
              return {
                id: `firework-${heartIdRef.current++}`,
                centerX,
                centerY,
                angle,
                distance,
                delay: Math.random() * 200,
                size: Math.random() * 1 + 1.2,
                emoji: ['💖', '💕', '💗', '❤️', '💝', '🎆', '✨', '🎇'][Math.floor(Math.random() * 8)],
                animationType: 'fireworks',
                createdAt: Date.now(),
              };
            });
            
            setHearts(prev => [...prev, ...newHearts]);
          }, explosion * 300); // Stagger explosions
        }
      } else if (type === 'birthday') {
        // Birthday party rain: add party elements
        const newElementCount = Math.floor(Math.random() * 6) + 4; // 4-9 elements
        const newHearts = Array.from({ length: newElementCount }, (_, i) => ({
          id: `birthday-${heartIdRef.current++}`,
          left: Math.random() * 100,
          delay: Math.random() * 600,
          size: Math.random() * 0.8 + 1.2, // Slightly larger for party elements
          emoji: ['🎂', '🍰', '🎉', '🎊', '🎈', '🎁', '🥳', '🎀', '🍾', '🎵', '🎶', '⭐', '✨'][Math.floor(Math.random() * 13)],
          animationType: 'rain',
          createdAt: Date.now(),
        }));
        
        setHearts(prev => [...prev, ...newHearts]);
      } else {
        // Continuous rain: add new hearts periodically
        const newHeartCount = Math.floor(Math.random() * 5) + 3; // 3-7 hearts
        const newHearts = Array.from({ length: newHeartCount }, (_, i) => ({
          id: `rain-${heartIdRef.current++}`,
          left: Math.random() * 100,
          delay: Math.random() * 500,
          size: Math.random() * 0.8 + 1,
          emoji: ['💖', '💕', '💗', '❤️', '💝'][Math.floor(Math.random() * 5)],
          animationType: 'rain',
          createdAt: Date.now(),
        }));
        
        setHearts(prev => [...prev, ...newHearts]);
      }
    };

    // Start immediately
    addHearts();
    
    // Set interval for continuous animation
    const interval = type === 'fireworks' ? 2000 : type === 'birthday' ? 700 : 800; // Fireworks every 2s, birthday every 0.7s, rain every 0.8s
    intervalRef.current = setInterval(addHearts, interval);

    // Clean up old hearts periodically
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setHearts(prev => prev.filter(heart => now - heart.createdAt < 8000)); // Remove hearts older than 8s
    }, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(cleanupInterval);
    };
  }, [isActive, type]);

  if (!isActive || hearts.length === 0) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes heartFall {
          0% {
            transform: translateY(-50px) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(calc(100vh + 100px)) rotate(360deg);
            opacity: 0;
          }
        }
        @keyframes heartFireworks {
          0% {
            transform: translate(0, 0) scale(0.5) rotate(0deg);
            opacity: 1;
          }
          50% {
            transform: translate(var(--dx), var(--dy)) scale(1.2) rotate(180deg);
            opacity: 1;
          }
          100% {
            transform: translate(calc(var(--dx) * 1.5), calc(var(--dy) * 1.5)) scale(0.3) rotate(360deg);
            opacity: 0;
          }
        }
        .heart-fall {
          animation: heartFall 4s ease-in forwards;
        }
        .heart-fireworks {
          animation: heartFireworks 3s ease-out forwards;
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex }}>
        {hearts.map((heart) => {
          if (heart.animationType === 'fireworks') {
            // Calculate explosion direction from random center
            const dx = Math.cos(heart.angle) * heart.distance;
            const dy = Math.sin(heart.angle) * heart.distance;
            
            return (
              <div
                key={heart.id}
                className="absolute heart-fireworks"
                style={{
                  left: `${heart.centerX}%`,
                  top: `${heart.centerY}%`,
                  fontSize: `${heart.size}rem`,
                  animationDelay: `${heart.delay}ms`,
                  '--dx': `${dx}px`,
                  '--dy': `${dy}px`,
                  filter: `opacity(${Math.max(0.1, Math.min(1, effectOpacity))})`,
                }}
              >
                {heart.emoji}
              </div>
            );
          } else {
            return (
              <div
                key={heart.id}
                className="absolute heart-fall"
                style={{
                  left: `${heart.left}%`,
                  top: '-50px',
                  fontSize: `${heart.size}rem`,
                  animationDelay: `${heart.delay}ms`,
                }}
              >
                {heart.emoji}
              </div>
            );
          }
        })}
      </div>
    </>,
    document.body
  );
}
