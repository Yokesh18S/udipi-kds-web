import React, { useState } from 'react';
import { Volume2, VolumeX, Maximize2, Bell, CheckCircle2, ShieldAlert } from 'lucide-react';
import { unlockKOTAudio, testKOTAudio } from '../utils/kotAudio';

export default function KioskBanner({ isAudioUnlocked, isFullscreen, onEnterFullscreen, onWakeLock }) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleActivateAll = async () => {
    try {
      await unlockKOTAudio();
      if (onWakeLock) onWakeLock();
      if (onEnterFullscreen) onEnterFullscreen();
    } catch (e) {
      console.warn('Activation error:', e);
    }
  };

  const handleTestSound = async () => {
    setTesting(true);
    try {
      await testKOTAudio();
    } finally {
      setTimeout(() => setTesting(false), 1500);
    }
  };

  if (isAudioUnlocked && isFullscreen) {
    return null;
  }

  if (isDismissed && isAudioUnlocked) {
    return null;
  }

  return (
    <div className="kiosk-banner-wrapper">
      <div className="kiosk-banner-content">
        <div className="kiosk-banner-info">
          {!isAudioUnlocked ? (
            <div className="kiosk-icon-badge alert">
              <VolumeX className="w-5 h-5 animate-pulse text-amber-300" />
            </div>
          ) : (
            <div className="kiosk-icon-badge success">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
          )}

          <div>
            <h4 className="kiosk-banner-title">
              {!isAudioUnlocked
                ? 'Kitchen Sound Alerts & Kiosk Mode Require One-Tap Activation'
                : 'Display Ready — Switch to Fullscreen Kiosk Mode'}
            </h4>
            <p className="kiosk-banner-desc">
              {!isAudioUnlocked
                ? 'Modern browsers block sound until you tap once. Tap below to enable loud ringing bells and keep display awake.'
                : 'Hide browser address bars for uninterrupted kitchen display operation.'}
            </p>
          </div>
        </div>

        <div className="kiosk-banner-actions">
          {!isAudioUnlocked ? (
            <button
              onClick={handleActivateAll}
              className="kiosk-btn-primary"
            >
              <Volume2 className="w-4 h-4" />
              <span>Enable Audio & Fullscreen</span>
            </button>
          ) : (
            <button
              onClick={onEnterFullscreen}
              className="kiosk-btn-primary"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Enter Fullscreen</span>
            </button>
          )}

          <button
            onClick={handleTestSound}
            disabled={testing}
            className="kiosk-btn-secondary"
            title="Test speaker bell sound"
          >
            <Bell className={`w-4 h-4 ${testing ? 'animate-bounce text-amber-400' : ''}`} />
            <span>{testing ? 'Ringing...' : 'Test Sound'}</span>
          </button>

          {isAudioUnlocked && (
            <button
              onClick={() => setIsDismissed(true)}
              className="kiosk-btn-ghost"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
