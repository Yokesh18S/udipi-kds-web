import React, { useState, useEffect } from 'react';
import {
  ChefHat,
  Clock,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Building2,
  Search,
  X
} from 'lucide-react';
import { testKOTAudio } from '../utils/kotAudio';

export default function KDSHeader({
  currentUser,
  activeCount,
  orderMode,
  setOrderMode,
  searchTerm,
  setSearchTerm,
  isAudioUnlocked,
  isRinging,
  onSilenceRing,
  isWakeLockActive,
  isFullscreen,
  onToggleFullscreen,
  zoomScale,
  onCycleZoom,
  onSwitchHotel
}) {
  const [timeStr, setTimeStr] = useState('');
  const [testingSound, setTestingSound] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleTestSound = async () => {
    setTestingSound(true);
    try {
      await testKOTAudio();
    } finally {
      setTimeout(() => setTestingSound(false), 1200);
    }
  };

  // Clean short name for mobile display
  const rawName = currentUser?.restaurant_name || '';
  const hotelDisplayName = rawName
    ? rawName.replace(/Data Udipi\s*[-—]\s*/i, '').replace(/Data Udipi/i, '').trim() || rawName
    : 'Kitchen Display';

  return (
    <header className="kds-header">
      {/* Top Main Row - Compact & Ultra Space-Efficient */}
      <div className="kds-header-top">
        {/* Left: Branding & Hotel Station */}
        <div className="header-brand-section">
          <div className="brand-icon-box" title="Udipi Kitchen Display System">
            <ChefHat className="brand-icon text-amber-400" />
          </div>

          <div className="brand-text-block">
            <div className="header-title-row">
              <h1 className="header-title" title={rawName || 'Kitchen Station'}>
                {hotelDisplayName}
              </h1>
              <span className="mobile-active-pill" title={`${activeCount} Live Orders`}>
                <span className="live-dot" />
                <span className="pill-count">{activeCount}</span>
              </span>
            </div>
            <div className="restaurant-subtext desktop-only">
              Kitchen Display Station • Real-Time Order Stream
            </div>
          </div>
        </div>

        {/* Center: Live Clock & Live Count (Desktop/Tablet Only) */}
        <div className="header-center-section desktop-only">
          <div className="clock-box">
            <Clock className="w-4 h-4 text-amber-400" />
            <div className="clock-time">{timeStr}</div>
          </div>

          <div className="active-counter-badge">
            <span className="counter-number">{activeCount}</span>
            <span className="counter-label">Active Orders</span>
          </div>
        </div>

        {/* Right: Essential Tools (Optimized for Mobile Touch) */}
        <div className="header-controls-section">
          {isRinging && (
            <button
              onClick={onSilenceRing}
              className="silence-ring-btn animate-bounce"
              title="Silence incoming order alarm"
            >
              <VolumeX className="w-4 h-4" />
              <span>Silence</span>
            </button>
          )}

          {/* Sound Arm / Test */}
          <button
            onClick={handleTestSound}
            disabled={testingSound}
            className={`control-btn ${isAudioUnlocked ? 'btn-audio-active' : 'btn-audio-locked'}`}
            title={isAudioUnlocked ? 'Audio Active (Click to test loud bell)' : 'Audio Locked (Click to enable)'}
          >
            {isAudioUnlocked ? (
              <Volume2 className={`w-4 h-4 text-emerald-400 ${testingSound ? 'animate-ping' : ''}`} />
            ) : (
              <VolumeX className="w-4 h-4 text-amber-400 animate-pulse" />
            )}
            <span className="desktop-only">{isAudioUnlocked ? 'Audio' : 'Unlock'}</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={onToggleFullscreen}
            className="control-btn"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-neutral-300" />
            ) : (
              <Maximize2 className="w-4 h-4 text-neutral-300" />
            )}
          </button>

          {/* Search Toggle (Mobile) */}
          <button
            onClick={() => setShowMobileSearch(!showMobileSearch)}
            className={`control-btn mobile-only ${showMobileSearch || searchTerm ? 'btn-active-search' : ''}`}
            title="Search Orders"
          >
            <Search className="w-4 h-4 text-neutral-300" />
          </button>

          {/* Switch Hotel */}
          <button
            onClick={onSwitchHotel}
            className="control-btn btn-switch-hotel"
            title="Switch Hotel Station"
          >
            <Building2 className="w-4 h-4 text-amber-400" />
            <span className="desktop-only">Switch</span>
          </button>
        </div>
      </div>

      {/* Sub Header: Navigation Modes & Search (Ultra-Compact Single Row) */}
      <div className={`kds-header-sub ${showMobileSearch ? 'show-mobile-search' : ''}`}>
        <div className="mode-tabs">
          <button
            onClick={() => setOrderMode('ALL')}
            className={`mode-tab ${orderMode === 'ALL' ? 'active all' : ''}`}
          >
            All
          </button>
          <button
            onClick={() => setOrderMode('DINE_IN')}
            className={`mode-tab ${orderMode === 'DINE_IN' ? 'active dine-in' : ''}`}
          >
            Dine-In
          </button>
          <button
            onClick={() => setOrderMode('TAKEAWAY')}
            className={`mode-tab ${orderMode === 'TAKEAWAY' ? 'active takeaway' : ''}`}
          >
            Takeaway
          </button>
          <button
            onClick={() => setOrderMode('DELIVERY')}
            className={`mode-tab ${orderMode === 'DELIVERY' ? 'active delivery' : ''}`}
          >
            Delivery
          </button>
        </div>

        <div className={`header-search-wrapper ${showMobileSearch ? 'mobile-visible' : 'desktop-only-flex'}`}>
          <Search className="search-icon w-3.5 h-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Bill #, Table #, Phone..."
            className="header-search-input"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="search-clear-btn" title="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
