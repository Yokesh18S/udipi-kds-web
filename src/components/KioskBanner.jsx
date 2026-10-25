import React, { useState } from 'react';
import { Volume2, VolumeX, Bell, X } from 'lucide-react';
import { unlockKOTAudio, testKOTAudio } from '../utils/kotAudio';

export default function KioskBanner({ isAudioUnlocked, isFullscreen, onEnterFullscreen, onWakeLock }) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [testing, setTesting] = useState(false);

  // If audio is already active, HIDE the banner completely so screen space is saved for orders!
  if (isAudioUnlocked || isDismissed) {
    return null;
  }

  const handleActivateAll = async () => {
    try {
      await unlockKOTAudio();
      if (onWakeLock) onWakeLock();
      if (onEnterFullscreen) onEnterFullscreen();
    } catch (e) {
      console.warn('Activation error:', e);
    }
  };

  const handleTestSound = async (e) => {
    e.stopPropagation();
    setTesting(true);
    try {
      await testKOTAudio();
    } finally {
      setTimeout(() => setTesting(false), 1200);
    }
  };

  return (
    <div className="kiosk-banner-wrapper" onClick={handleActivateAll}>
      <div className="kiosk-banner-content">
        <div className="kiosk-banner-info">
          <VolumeX className="banner-sound-icon animate-pulse text-amber-300 flex-shrink-0" />
          <span className="kiosk-banner-title">
            Tap to enable kitchen sound alerts
          </span>
        </div>

        <div className="kiosk-banner-actions" onClick={(e) => e.stopPropagation()}>
          <button onClick={handleActivateAll} className="kiosk-btn-primary">
            <Volume2 className="w-3.5 h-3.5 mr-1" />
            <span>Enable</span>
          </button>

          <button onClick={handleTestSound} disabled={testing} className="kiosk-btn-secondary">
            <Bell className={`w-3.5 h-3.5 ${testing ? 'animate-bounce text-amber-400' : ''}`} />
            <span>{testing ? '...' : 'Test'}</span>
          </button>

          <button
            onClick={() => setIsDismissed(true)}
            className="kiosk-btn-dismiss"
            title="Dismiss banner"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
