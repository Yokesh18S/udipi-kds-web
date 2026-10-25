import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Screen Wake Lock Hook
 * Prevents kitchen display screens from dimming or falling asleep.
 * Automatically re-acquires the lock on document visibility change.
 */
export function useWakeLock() {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);
  const wakeLockRef = useRef(null);
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const requestWakeLock = useCallback(async () => {
    if (!isSupported) {
      setError('WakeLock not supported');
      return false;
    }

    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        setIsActive(true);
        return true;
      }

      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setIsActive(true);
      setError(null);

      wakeLockRef.current.addEventListener('release', () => {
        setIsActive(false);
      });

      return true;
    } catch (err) {
      console.warn('[KDS WakeLock] Acquisition failed:', err);
      setError(err.message || 'WakeLock acquisition failed');
      setIsActive(false);
      return false;
    }
  }, [isSupported]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        console.warn('[KDS WakeLock] Error releasing lock:', err);
      } finally {
        wakeLockRef.current = null;
        setIsActive(false);
      }
    }
  }, []);

  useEffect(() => {
    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);

  return { isSupported, isActive, error, requestWakeLock, releaseWakeLock };
}
