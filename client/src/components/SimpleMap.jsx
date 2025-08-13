import React from 'react';

export default function SimpleMap() {
  return (
    <div className="mt-6 p-4 bg-gray-50 rounded-xl">
      <div className="relative h-32 bg-gradient-to-br from-blue-100 to-green-100 rounded-lg overflow-hidden">
        {/* Barcelona marker (left side) */}
        <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-center">
          <div className="text-2xl mb-1">📍</div>
          <div className="text-xs font-medium text-gray-700 bg-white px-2 py-1 rounded shadow-sm">
            Barcelona
          </div>
        </div>
        
        {/* Madrid marker (right side) */}
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-center">
          <div className="text-2xl mb-1">📍</div>
          <div className="text-xs font-medium text-gray-700 bg-white px-2 py-1 rounded shadow-sm">
            Madrid
          </div>
        </div>
        
        {/* Arrow between cities */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center text-gray-600">
            <div className="w-16 h-0.5 bg-gray-400"></div>
            <div className="text-lg">→</div>
            <div className="w-16 h-0.5 bg-gray-400"></div>
          </div>
        </div>
        
        {/* Distance label */}
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2">
          <div className="text-xs font-medium text-gray-600 bg-white px-2 py-1 rounded shadow-sm">
            505.62 km
          </div>
        </div>
      </div>
      
      {/* Address details */}
      <div className="mt-3 grid grid-cols-2 gap-4 text-xs text-gray-600">
        <div>
          <div className="font-medium text-gray-800">Barcelona</div>
          <div>Carrer de Doctor Cadevall 19</div>
          <div>08041 Barcelona</div>
        </div>
        <div>
          <div className="font-medium text-gray-800">Madrid</div>
          <div>Sector de los escultores 34</div>
          <div>Tres Cantos, Madrid</div>
        </div>
      </div>
    </div>
  );
}
