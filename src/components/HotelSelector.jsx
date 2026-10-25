import React, { useState, useEffect } from 'react';
import { ChefHat, Building2, MapPin, Phone, ArrowRight, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { restaurantService } from '../services/api';

export default function HotelSelector({ onSelectHotel }) {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connectingId, setConnectingId] = useState(null);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchHotels = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await restaurantService.getPublicRestaurants();
      const list = Array.isArray(data) ? data : [];
      setHotels(list);
    } catch (err) {
      console.error('Failed to load connected hotels:', err);
      setError('Could not connect to restaurant server. Please verify network.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHotels();
  }, []);

  const handleConnect = async (hotel) => {
    setConnectingId(hotel.id);
    setError(null);
    try {
      const res = await restaurantService.connectTerminal(hotel.id);
      onSelectHotel(res.user);
    } catch (err) {
      console.error('Connection failed:', err);
      setError(`Failed to connect to ${hotel.name}. Please try again.`);
      setConnectingId(null);
    }
  };

  const filteredHotels = hotels.filter((h) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (h.name && h.name.toLowerCase().includes(q)) ||
      (h.address && h.address.toLowerCase().includes(q)) ||
      (h.phone && h.phone.includes(q))
    );
  });

  return (
    <div className="hotel-selector-container">
      <div className="hotel-selector-shell">
        {/* Header */}
        <div className="hotel-selector-header">
          <div className="selector-brand-box">
            <ChefHat className="w-10 h-10 text-amber-400" />
          </div>
          <h1 className="selector-title">Udipi Kitchen Display System</h1>
          <p className="selector-subtitle">
            Select your connected hotel station to start live kitchen orders immediately
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="selector-error-box">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={fetchHotels} className="selector-retry-btn">
              <RefreshCw className="w-4 h-4 mr-1" /> Retry
            </button>
          </div>
        )}

        {/* Search input (if multiple hotels) */}
        {hotels.length > 3 && (
          <div className="selector-search-box">
            <input
              type="text"
              placeholder="Search hotel or branch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="selector-search-input"
            />
          </div>
        )}

        {/* Hotel Grid */}
        <div className="hotels-grid">
          {loading ? (
            <div className="selector-loading-state">
              <RefreshCw className="w-10 h-10 text-amber-400 animate-spin mb-3" />
              <p>Scanning connected hotels...</p>
            </div>
          ) : filteredHotels.length === 0 ? (
            <div className="selector-empty-state">
              <Building2 className="w-12 h-12 text-neutral-500 mb-2" />
              <p className="font-bold text-lg text-neutral-300">No Hotels Found</p>
              <p className="text-sm text-neutral-500">
                {hotels.length === 0
                  ? 'No active restaurants configured in backend.'
                  : 'No matches found for your search.'}
              </p>
              <button onClick={fetchHotels} className="mt-4 px-4 py-2 bg-neutral-800 rounded-lg text-sm">
                Refresh List
              </button>
            </div>
          ) : (
            filteredHotels.map((hotel) => {
              const isConnecting = connectingId === hotel.id;

              return (
                <div
                  key={hotel.id}
                  className={`hotel-station-card ${isConnecting ? 'connecting' : ''}`}
                  onClick={() => !isConnecting && handleConnect(hotel)}
                >
                  <div className="hotel-card-top">
                    <div className="hotel-icon-avatar">
                      <Building2 className="w-7 h-7 text-amber-400" />
                    </div>

                    <div className="hotel-info">
                      <h3 className="hotel-name">{hotel.name}</h3>
                      <div className="hotel-meta">
                        {hotel.address && (
                          <div className="hotel-meta-item">
                            <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{hotel.address}</span>
                          </div>
                        )}
                        {hotel.phone && (
                          <div className="hotel-meta-item">
                            <Phone className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{hotel.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="hotel-card-bottom">
                    <div className="station-ready-badge">
                      <span className="live-dot" />
                      <span>Kitchen Station Active</span>
                    </div>

                    <button
                      disabled={isConnecting}
                      className="hotel-launch-btn"
                    >
                      {isConnecting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <>
                          <span>Open KDS</span>
                          <ArrowRight className="w-4 h-4 ml-1.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="selector-footer">
          <Sparkles className="w-4 h-4 text-emerald-400 inline mr-1" />
          <span>No login or credentials required • Direct live order feed</span>
        </div>
      </div>
    </div>
  );
}
