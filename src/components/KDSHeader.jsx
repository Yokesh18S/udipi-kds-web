import React, { useState, useEffect } from 'react';
import {
  ChefHat,
  Clock,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Tv,
  LogOut,
  Bell,
  Search,
  CheckCircle,
  Eye,
  Zap
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
  onLogout
}) {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [testingSound, setTestingSound] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
      setDateStr(
        now.toLocaleDateString([], {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
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

  return (
    <header className="kds-header">
      {/* Top Main Row */}
      <div className="kds-header-top">
        {/* Left: Branding & Terminal Info */}
        <div className="header-brand-section">
          <div className="brand-icon-box">
            <ChefHat className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <div className="header-title-row">
              <h1 className="header-title">UDIPI KDS</h1>
              <span className="terminal-badge">
                <span className="live-dot" /> LIVE TERMINAL
              </span>
            </div>
            <div className="restaurant-subtext">
              {currentUser?.restaurant_name || 'Kitchen Display'} • Staff: {currentUser?.name || 'Manager'}
            </div>
          </div>
        </div>

        {/* Center: Live Clock & Active Badge */}
        <div className="header-center-section">
          <div className="clock-box">
            <Clock className="w-5 h-5 text-amber-400" />
            <div className="clock-time">{timeStr}</div>
            <div className="clock-date">{dateStr}</div>
          </div>

          <div className="active-counter-badge">
            <span className="counter-number">{activeCount}</span>
            <span className="counter-label">Active Orders</span>
          </div>
        </div>

        {/* Right: Controls & Kiosk Tools */}
        <div className="header-controls-section">
          {/* Active Ringing Alert with Mute Button */}
          {isRinging && (
            <button
              onClick={onSilenceRing}
              className="silence-ring-btn animate-bounce"
              title="Silence incoming order ringing"
            >
              <VolumeX className="w-5 h-5" />
              <span>Silence Alarm</span>
            </button>
          )}

          {/* Sound Armed Status / Test */}
          <button
            onClick={handleTestSound}
            disabled={testingSound}
            className={`control-btn ${isAudioUnlocked ? 'btn-audio-active' : 'btn-audio-locked'}`}
            title={isAudioUnlocked ? 'Sound alert active. Tap to test speaker.' : 'Sound alert locked by browser. Tap to activate.'}
          >
            {isAudioUnlocked ? (
              <>
                <Volume2 className={`w-4 h-4 text-emerald-400 ${testingSound ? 'animate-ping' : ''}`} />
                <span className="control-btn-text">Audio On</span>
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4 text-amber-400 animate-pulse" />
                <span className="control-btn-text">Unlock Audio</span>
              </>
            )}
          </button>

          {/* Screen Wake Lock Status */}
          <div
            className={`wake-lock-badge ${isWakeLockActive ? 'active' : 'inactive'}`}
            title={isWakeLockActive ? 'Screen sleep prevention active' : 'WakeLock inactive'}
          >
            <Zap className={`w-3.5 h-3.5 ${isWakeLockActive ? 'text-emerald-400' : 'text-neutral-500'}`} />
            <span className="wake-text">{isWakeLockActive ? 'Awake' : 'Sleep'}</span>
          </div>

          {/* TV Scale Zoom Switcher */}
          <button
            onClick={onCycleZoom}
            className="control-btn btn-secondary"
            title="Cycle Display Zoom (Standard / Large / TV Wall)"
          >
            <Tv className="w-4 h-4 text-sky-400" />
            <span className="control-btn-text">{Math.round(zoomScale * 100)}%</span>
          </button>

          {/* Fullscreen Kiosk Mode Toggle */}
          <button
            onClick={onToggleFullscreen}
            className="control-btn btn-secondary"
            title={isFullscreen ? 'Exit Kiosk Fullscreen' : 'Enter Kiosk Fullscreen (F11)'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-neutral-300" />
            ) : (
              <Maximize2 className="w-4 h-4 text-neutral-300" />
            )}
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="control-btn btn-danger"
            title="Disconnect Terminal / Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sub Header: Navigation Modes & Search */}
      <div className="kds-header-sub">
        <div className="mode-tabs">
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
          <button
            onClick={() => setOrderMode('ALL')}
            className={`mode-tab ${orderMode === 'ALL' ? 'active all' : ''}`}
          >
            All Orders
          </button>
        </div>

        <div className="header-search-wrapper">
          <Search className="search-icon" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Bill #, Table #, Order ID..."
            className="header-search-input"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="search-clear-btn"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
