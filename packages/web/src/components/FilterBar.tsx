import React, { useState } from 'react';
import './FilterBar.css';

interface FilterBarProps {
  kantoren: any[];
  onFilterChange: (filters: any) => void;
  filters?: any;
}

function FilterBar({ kantoren, onFilterChange }: FilterBarProps) {
  const [prijsMin, setPrijsMin] = useState('');
  const [prijsMax, setPrijsMax] = useState('');
  const [selectedGemeenten, setSelectedGemeenten] = useState<string[]>([]);
  const [selectedKantoren, setSelectedKantoren] = useState<string[]>([]);
  const [sort, setSort] = useState('');

  const gemeenten = ['Leuven', 'Herent', 'Holsbeek', 'Rotselaar', 'Linden', 'Lubbeek', 'Pellenberg'];

  const handleGemeenteChange = (gemeente: string) => {
    const updated = selectedGemeenten.includes(gemeente)
      ? selectedGemeenten.filter((g) => g !== gemeente)
      : [...selectedGemeenten, gemeente];
    setSelectedGemeenten(updated);
    onFilterChange({ gemeente: updated });
  };

  const handleKantoorChange = (kantoorId: string) => {
    const updated = selectedKantoren.includes(kantoorId)
      ? selectedKantoren.filter((k) => k !== kantoorId)
      : [...selectedKantoren, kantoorId];
    setSelectedKantoren(updated);
    onFilterChange({ kantoor: updated });
  };

  const handlePrijsChange = () => {
    onFilterChange({
      prijs_min: prijsMin ? parseInt(prijsMin) : undefined,
      prijs_max: prijsMax ? parseInt(prijsMax) : undefined
    });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSort(e.target.value);
    onFilterChange({ sort: e.target.value });
  };

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label>Prijs</label>
        <div className="price-inputs">
          <input
            type="number"
            placeholder="Min"
            value={prijsMin}
            onChange={(e) => setPrijsMin(e.target.value)}
            onBlur={handlePrijsChange}
          />
          <span>—</span>
          <input
            type="number"
            placeholder="Max"
            value={prijsMax}
            onChange={(e) => setPrijsMax(e.target.value)}
            onBlur={handlePrijsChange}
          />
        </div>
      </div>

      <div className="filter-group">
        <label>Gemeente</label>
        <div className="gemeente-checkboxes">
          {gemeenten.map((gemeente) => (
            <label key={gemeente}>
              <input
                type="checkbox"
                checked={selectedGemeenten.includes(gemeente)}
                onChange={() => handleGemeenteChange(gemeente)}
              />
              {gemeente}
            </label>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label>Kantoor</label>
        <div className="kantoor-checkboxes">
          {kantoren.map((kantoor) => (
            <label key={kantoor.id}>
              <input
                type="checkbox"
                checked={selectedKantoren.includes(kantoor.id.toString())}
                onChange={() => handleKantoorChange(kantoor.id.toString())}
              />
              {kantoor.naam}
            </label>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label>Sortering</label>
        <select value={sort} onChange={handleSortChange}>
          <option value="">Standaard</option>
          <option value="prijs_asc">Prijs: laag → hoog</option>
          <option value="prijs_desc">Prijs: hoog → laag</option>
          <option value="nieuwst">Nieuwste eerst</option>
          <option value="oudst">Oudste eerst</option>
        </select>
      </div>
    </div>
  );
}

export default FilterBar;
