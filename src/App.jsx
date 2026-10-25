import React, { useState, useEffect, useCallback } from 'react';
import { authService } from './services/api';
import { kotAudio, stopKOTRinging, unlockKOTAudio } from './utils/kotAudio';
import { useWakeLock } from './hooks/useWakeLock';
import { useFullscreen } from './hooks/useFullscreen';
import KDSHeader from './components/KDSHeader';
import KDSOrdersView from './components/KDSOrdersView';
import KitchenLogin from './components/KitchenLogin';
import KioskBanner from './components/KioskBanner';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [activeCount, setActiveCount] = useState(0);
  const [orderMode, setOrderMode] = useState('DINE_IN');
  const [searchTerm, setSearchTerm] = useState('');
  const [zoomScale, setZoomScale] = useState(1.0); // 1.0, 1.2, 1.4

  const [ringingInfo, setRingingInfo] = useState({
    isRinging: false,
    remainingCount: 0,
    isUnlocked: false,
  });

  const { isSupported: isWakeSupported, isActive: isWakeLockActive, requestWakeLock } = useWakeLock();
  const { isFullscreen, enterFullscreen, toggleFullscreen } = useFullscreen();

  // Check saved credentials & restore session on initial launch
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('kds_access_token');
      if (!storedToken) {
        setIsAuthChecking(false);
        return;
      }

      try {
        const user = await authService.getCurrentUser();
        setCurrentUser(user);
      } catch (err) {
        console.warn('Session verification failed, attempting token refresh...', err);
        try {
          const refreshRes = await authService.refreshToken();
          if (refreshRes?.user) {
            setCurrentUser(refreshRes.user);
          } else {
            const user = await authService.getCurrentUser();
            setCurrentUser(user);
          }
        } catch (refreshErr) {
          console.warn('Could not restore terminal session:', refreshErr);
          // If remember terminal was not set, clear
          if (!localStorage.getItem('kds_remember_terminal')) {
            authService.logout();
          } else {
            // Keep user from local cache if offline
            const cachedUser = authService.getStoredUser();
            if (cachedUser) setCurrentUser(cachedUser);
          }
        }
      } finally {
        setIsAuthChecking(false);
      }
    };

    initAuth();

    // Listen for auth expiration events
    const handleExpired = () => {
      setCurrentUser(null);
    };
    window.addEventListener('kds-auth-expired', handleExpired);
    return () => window.removeEventListener('kds-auth-expired', handleExpired);
  }, []);

  // Subscribe to audio ringing state
  useEffect(() => {
    const unsubscribe = kotAudio.subscribe((state) => {
      setRingingInfo(state);
    });
    return () => unsubscribe();
  }, []);

  // Global user gesture listener to unlock audio & wake lock seamlessly
  useEffect(() => {
    const handleGesture = () => {
      unlockKOTAudio().catch(() => {});
      requestWakeLock();
    };

    const events = ['click', 'touchstart', 'touchend', 'keydown'];
    events.forEach((ev) => window.addEventListener(ev, handleGesture, { passive: true, once: true }));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleGesture));
    };
  }, [requestWakeLock]);

  // Apply display zoom scale to document
  const handleCycleZoom = useCallback(() => {
    setZoomScale((prev) => {
      if (prev === 1.0) return 1.2;
      if (prev === 1.2) return 1.4;
      return 1.0;
    });
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--kds-scale', zoomScale.toString());
  }, [zoomScale]);

  if (isAuthChecking) {
    return (
      <div className="kds-loading-screen">
        <div className="spinner-border animate-spin" />
        <p>Connecting to Kitchen Terminal...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <KitchenLogin onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <div className={`kds-root zoom-${Math.round(zoomScale * 100)}`}>
      {/* Kiosk Mode / Audio Autoplay Banner */}
      <KioskBanner
        isAudioUnlocked={ringingInfo.isUnlocked}
        isFullscreen={isFullscreen}
        onEnterFullscreen={enterFullscreen}
        onWakeLock={requestWakeLock}
      />

      {/* Primary Header */}
      <KDSHeader
        currentUser={currentUser}
        activeCount={activeCount}
        orderMode={orderMode}
        setOrderMode={setOrderMode}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isAudioUnlocked={ringingInfo.isUnlocked}
        isRinging={ringingInfo.isRinging}
        onSilenceRing={() => stopKOTRinging()}
        isWakeLockActive={isWakeLockActive}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        zoomScale={zoomScale}
        onCycleZoom={handleCycleZoom}
        onLogout={() => authService.logout()}
      />

      {/* Main 2-Column Ticket Board */}
      <main className="kds-main-content">
        <KDSOrdersView
          orderMode={orderMode}
          searchTerm={searchTerm}
          onActiveCountChange={setActiveCount}
          isAudioUnlocked={ringingInfo.isUnlocked}
        />
      </main>
    </div>
  );
}
