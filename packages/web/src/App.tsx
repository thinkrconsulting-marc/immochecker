import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import PropertyCard from './components/PropertyCard';
import FilterBar from './components/FilterBar';
import Header from './components/Header';

interface Pand {
  _id: string;
  titel: string;
  gemeente: string;
  prijs?: number;
  slaapkamers?: number;
  woonoppervlakte_m2?: number;
  perceel_m2?: number;
  epc?: string;
  fotos: string[];
  bron_url: string;
  status: string;
  eerst_gezien: string;
}

interface FilterState {
  gemeente: string[];
  prijs_min?: number;
  prijs_max?: number;
  kantoor?: string[];
  sort?: string;
  page: number;
}

function App() {
  const [panden, setPanden] = useState<Pand[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    gemeente: [],
    page: 1
  });
  const [kantoren, setKantoren] = useState<any[]>([]);

  useEffect(() => {
    fetchKantoren();
  }, []);

  useEffect(() => {
    fetchPanden();
  }, [filters]);

  const fetchKantoren = async () => {
    try {
      const response = await axios.get('/api/kantoren');
      setKantoren(response.data);
    } catch (error) {
      console.error('Error fetching kantoren:', error);
    }
  };

  const fetchPanden = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.gemeente.length) params.append('gemeente', filters.gemeente.join(','));
      if (filters.prijs_min) params.append('prijs_min', filters.prijs_min.toString());
      if (filters.prijs_max) params.append('prijs_max', filters.prijs_max.toString());
      if (filters.kantoor?.length) params.append('kantoor', filters.kantoor.join(','));
      if (filters.sort) params.append('sort', filters.sort);
      params.append('page', filters.page.toString());
      params.append('limit', '24');

      const response = await axios.get(`/api/panden?${params}`);
      setPanden(response.data.panden);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Error fetching panden:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  return (
    <div className="app">
      <Header />
      <FilterBar kantoren={kantoren} onFilterChange={handleFilterChange} filters={filters} />
      
      {loading && <div className="loading">Loading...</div>}
      
      <div className="properties-grid">
        {panden.map((pand) => (
          <PropertyCard key={pand._id} pand={pand} />
        ))}
      </div>

      {!loading && panden.length === 0 && (
        <div className="no-results">No properties found</div>
      )}

      {panden.length > 0 && (
        <div className="pagination">
          <button 
            onClick={() => handlePageChange(filters.page - 1)}
            disabled={filters.page === 1}
          >
            Previous
          </button>
          <span>Page {filters.page}</span>
          <button 
            onClick={() => handlePageChange(filters.page + 1)}
            disabled={filters.page * 24 >= total}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
