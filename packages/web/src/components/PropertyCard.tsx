import { useState } from 'react';
import './PropertyCard.css';

interface Pand {
  id: number;
  titel: string;
  gemeente: string;
  prijs?: number;
  slaapkamers?: number;
  woonoppervlakte_m2?: number;
  perceel_m2?: number;
  epc?: string;
  fotos: string[];
  bron_url: string;
  eerst_gezien: string;
}

interface PropertyCardProps {
  pand: Pand;
}

function PropertyCard({ pand }: PropertyCardProps) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const photos = pand.fotos || [];

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const isNew = () => {
    const days = (new Date().getTime() - new Date(pand.eerst_gezien).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 7;
  };

  return (
    <div className="property-card">
      {isNew() && <div className="new-badge">Nieuw</div>}
      
      <div className="photo-carousel">
        {photos.length > 0 ? (
          <>
            <img src={photos[currentPhotoIndex]} alt={pand.titel} />
            {photos.length > 1 && (
              <>
                <button className="prev-btn" onClick={prevPhoto}>❮</button>
                <button className="next-btn" onClick={nextPhoto}>❯</button>
                <div className="photo-counter">
                  {currentPhotoIndex + 1} / {photos.length}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="no-photo">Geen foto</div>
        )}
      </div>

      <div className="property-info">
        <h3>{pand.titel}</h3>
        
        <div className="price">
          {pand.prijs ? `€ ${pand.prijs.toLocaleString('nl-NL')}` : 'Prijs op aanvraag'}
        </div>

        <div className="location">
          {pand.gemeente}
        </div>

        <div className="details">
          {pand.slaapkamers && (
            <span className="detail-item">
              🛏️ {pand.slaapkamers} slpk
            </span>
          )}
          {pand.woonoppervlakte_m2 && (
            <span className="detail-item">
              📐 {pand.woonoppervlakte_m2} m²
            </span>
          )}
          {pand.epc && (
            <span className="detail-item epc" data-epc={pand.epc}>
              EPC {pand.epc}
            </span>
          )}
        </div>

        <a 
          href={pand.bron_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="more-info-btn"
        >
          Meer info →
        </a>
      </div>
    </div>
  );
}

export default PropertyCard;


