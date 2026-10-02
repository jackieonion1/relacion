import React from 'react';
import { Link } from 'react-router';
import RouletteIcon from '../components/icons/RouletteIcon';

export default function Decisions() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-lacre">Decisiones</h2>
      <div className="grid grid-cols-2 gap-3">
        {/* Roulette Card */}
        <Link to="/decisions/roulette" className="card group active:scale-[0.99] transition-transform">
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <RouletteIcon className="w-10 h-10 text-lacre mb-2 transition-transform group-hover:rotate-12" />
            <div className="title-sm">Ruleta</div>
            <div className="text-xs text-ink-2">Añade opciones y gira</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
