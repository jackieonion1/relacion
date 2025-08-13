import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listPhotos } from '../lib/photos';

export default function RandomPhoto() {
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    async function fetchRandomPhoto() {
      try {
        const pairId = localStorage.getItem('pairId');
        if (!pairId) {
          setLoading(false);
          return;
        }
        const photos = await listPhotos(pairId);
        if (!isCancelled && photos.length > 0) {
          const randomIndex = Math.floor(Math.random() * photos.length);
          setPhoto(photos[randomIndex]);
        }
      } catch (error) {
        console.error("Error fetching random photo:", error);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchRandomPhoto();
    return () => { isCancelled = true; };
  }, []);

  // Always render the same card structure to prevent any layout shift
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm text-gray-600">Foto del día</h3>
        {!loading && photo && (
          <Link to="/gallery" className="btn-link text-sm">Ver galería</Link>
        )}
      </div>
      
      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
        {loading ? (
          <div className="w-full h-full bg-gray-200"></div>
        ) : photo ? (
          <Link to={`/gallery?photo=${photo.id}`} className="block w-full h-full">
            <img 
              src={photo.thumbUrl}
              alt="Recuerdo aleatorio"
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
            />
          </Link>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
            Sin fotos
          </div>
        )}
      </div>
    </div>
  );
}
