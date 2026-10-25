/**
 * Cross-Platform KOT (Kitchen Order Ticket) Audio Controller
 *
 * Designed to reliably play loud order alert sounds on ALL devices:
 * - Android Phones & Tablets (Samsung, Xiaomi/Redmi, Vivo, Oppo, OnePlus, Realme, Pixel, Motorola)
 * - iOS & iPadOS (iPhone, iPad Safari/Chrome)
 * - Desktop Browsers (Chrome, Edge, Safari, Firefox)
 *
 * Implements a redundant multi-engine architecture:
 * 1. HTML5 Audio element with pre-buffered WAV bell sound (/sounds/kot_bell.wav)
 * 2. Web Audio API synthesized resonant telephone/alarm bell (853Hz + 960Hz dual frequency)
 * 3. WebKit / iOS silent buffer unlock to bypass mobile autoplay restrictions
 * 4. Periodic keep-alive heartbeat to prevent mobile OS from putting audio hardware to sleep
 * 5. Device Vibration API for haptic physical notification
 */

class KOTAudioController {
  constructor() {
    this.ctx = null;
    this.audioElement = null;
    this.isRinging = false;
    this.pendingRings = 0;
    this.stopRequested = false;
    this.activeNodes = [];
    this.listeners = new Set();
    this.isUnlocked = false;
    this.keepAliveInterval = null;

    if (typeof window !== 'undefined') {
      this.initAudioElement();
      this.setupGlobalUnlockListeners();
    }
  }

  initAudioElement() {
    try {
      if (!this.audioElement) {
        this.audioElement = new Audio('/sounds/kot_bell.wav');
        this.audioElement.preload = 'auto';
        this.audioElement.volume = 1.0;
      }
    } catch (e) {
      console.warn('[KOT Audio] Audio element initialization error:', e);
    }
  }

  getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    return this.ctx;
  }

  /**
   * Complete unlock protocol for mobile devices (iOS Safari, Android Chrome, Samsung Internet).
   * MUST be called during a user touch/click gesture.
   */
  async unlock() {
    let unlockedAny = false;

    // 1. Unlock Web Audio API (Required for iOS Safari & Android Web Audio)
    const ctx = this.getAudioContext();
    if (ctx) {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        // iOS WebKit requires playing a real audio buffer during the touch event to permanently unlock
        const silentBuffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = silentBuffer;
        source.connect(ctx.destination);
        source.start(0);
        unlockedAny = true;
      } catch (err) {
        console.warn('[KOT Audio] Web Audio unlock error:', err);
      }
    }

    // 2. Unlock HTML5 Audio element
    if (!this.audioElement) {
      this.initAudioElement();
    }
    if (this.audioElement) {
      try {
        // Muted micro-play to satisfy mobile browser autoplay policy
        this.audioElement.volume = 0.001;
        const playPromise = this.audioElement.play();
        if (playPromise !== undefined) {
          await playPromise;
          this.audioElement.pause();
          this.audioElement.currentTime = 0;
          this.audioElement.volume = 1.0;
          unlockedAny = true;
        }
      } catch (err) {
        // May fail if not in a direct user gesture; silent catch
      }
    }

    this.isUnlocked = true;
    this.startKeepAlive();
    this.notifyListeners();
    return unlockedAny;
  }

  /**
   * Automatically hook up user touch/click events to unlock audio on first interaction
   */
  setupGlobalUnlockListeners() {
    const handleGesture = () => {
      this.unlock().catch(() => {});
    };

    const events = ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'];
    events.forEach(ev => {
      window.addEventListener(ev, handleGesture, { passive: true });
    });
  }

  /**
   * Periodic 15-second inaudible keep-alive to prevent mobile devices (especially iOS & Xiaomi/Samsung)
   * from putting audio hardware to sleep while the kitchen display tab is active.
   */
  startKeepAlive() {
    if (this.keepAliveInterval) return;
    this.keepAliveInterval = setInterval(() => {
      if (document.hidden) return;
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'running') {
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.00001; // Inaudible
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.05);
        } catch (e) {}
      }
    }, 15000);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    callback({
      isRinging: this.isRinging,
      remainingCount: this.pendingRings,
      isUnlocked: this.isUnlocked
    });
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    const state = {
      isRinging: this.isRinging,
      remainingCount: this.pendingRings,
      isUnlocked: this.isUnlocked
    };
    this.listeners.forEach((cb) => {
      try {
        cb(state);
      } catch (e) {
        console.error('Error in audio state listener:', e);
      }
    });
  }

  /**
   * Play single 3-second loud ring using HTML5 Audio element fallback
   */
  playHtmlAudio() {
    return new Promise((resolve) => {
      if (!this.audioElement) {
        this.initAudioElement();
      }
      if (!this.audioElement) {
        resolve(false);
        return;
      }

      this.audioElement.currentTime = 0;
      this.audioElement.volume = 1.0;

      const onEnded = () => {
        cleanup();
        resolve(true);
      };

      const onError = () => {
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        this.audioElement.removeEventListener('ended', onEnded);
        this.audioElement.removeEventListener('error', onError);
      };

      this.audioElement.addEventListener('ended', onEnded, { once: true });
      this.audioElement.addEventListener('error', onError, { once: true });

      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          cleanup();
          resolve(false);
        });
      }

      // Safety timeout at 3.2 seconds
      setTimeout(() => {
        cleanup();
        resolve(true);
      }, 3200);
    });
  }

  /**
   * Synthesize a piercing, loud 3-second ringing burst via Web Audio API
   * Uses dual resonant alarm frequencies (853Hz + 960Hz) with 16Hz mechanical trill.
   */
  playWebAudioRing(ctx) {
    return new Promise((resolve) => {
      if (this.stopRequested) {
        resolve();
        return;
      }

      try {
        const startTime = ctx.currentTime;
        const ringDuration = 3.0;

        // Dynamics Compressor to maximize perceived volume without speaker distortion
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-14, startTime);
        compressor.knee.setValueAtTime(24, startTime);
        compressor.ratio.setValueAtTime(12, startTime);
        compressor.attack.setValueAtTime(0.003, startTime);
        compressor.release.setValueAtTime(0.2, startTime);
        compressor.connect(ctx.destination);

        // Master Gain
        const masterGain = ctx.createGain();
        masterGain.connect(compressor);

        // Dual resonant bell frequencies
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'triangle';
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(853, startTime);
        osc2.frequency.setValueAtTime(960, startTime);

        // Piercing bandpass filter
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(900, startTime);
        filter.Q.setValueAtTime(2.2, startTime);

        osc1.connect(filter);
        osc2.connect(filter);

        // Tremolo: 16 Hz modulation for realistic ringer trill
        const tremoloGain = ctx.createGain();
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.setValueAtTime(16, startTime);

        const lfoDepth = ctx.createGain();
        lfoDepth.gain.setValueAtTime(0.4, startTime);

        lfo.connect(lfoDepth);
        lfoDepth.connect(tremoloGain.gain);
        tremoloGain.gain.setValueAtTime(0.6, startTime);

        filter.connect(tremoloGain);
        tremoloGain.connect(masterGain);

        // Triple-burst rhythmic ring profile inside 3 seconds
        const bursts = [
          { start: 0.0, end: 0.85 },
          { start: 0.95, end: 1.80 },
          { start: 1.90, end: 2.85 }
        ];

        masterGain.gain.setValueAtTime(0, startTime);
        bursts.forEach(({ start, end }) => {
          masterGain.gain.setValueAtTime(0, startTime + start);
          masterGain.gain.linearRampToValueAtTime(0.98, startTime + start + 0.02);
          masterGain.gain.setValueAtTime(0.98, startTime + end - 0.03);
          masterGain.gain.linearRampToValueAtTime(0, startTime + end);
        });

        masterGain.gain.setValueAtTime(0, startTime + 2.85);
        masterGain.gain.linearRampToValueAtTime(0.8, startTime + 2.86);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + ringDuration);

        lfo.start(startTime);
        osc1.start(startTime);
        osc2.start(startTime);

        lfo.stop(startTime + ringDuration);
        osc1.stop(startTime + ringDuration);
        osc2.stop(startTime + ringDuration);

        const nodes = [osc1, osc2, lfo, masterGain];
        this.activeNodes.push(...nodes);

        setTimeout(() => {
          this.activeNodes = this.activeNodes.filter((n) => !nodes.includes(n));
          resolve();
        }, ringDuration * 1000);
      } catch (err) {
        console.error('[KOT Audio] playWebAudioRing error:', err);
        resolve();
      }
    });
  }

  /**
   * Play single 3-second ring across BOTH engines simultaneously (or fallback)
   */
  async playSingle3SecRing() {
    // 1. Vibrate mobile hardware (supported on Android phones and tablets)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([400, 150, 400, 150, 400]);
      } catch (e) {}
    }

    const ctx = this.getAudioContext();
    const canUseWebAudio = ctx && ctx.state === 'running';

    // If Web Audio is active, play synthesized audio and also launch HTML5 audio as companion/backup
    if (canUseWebAudio) {
      await Promise.race([
        this.playWebAudioRing(ctx),
        this.playHtmlAudio()
      ]);
    } else {
      // Direct HTML5 audio fallback
      await this.playHtmlAudio();
    }
  }

  /**
   * Main entry point: ring loudly for N order arrivals.
   * If 1 order -> 1 cycle (3 sec).
   * If 2 orders -> 2 cycles (3 sec each with brief pause).
   */
  async ringForOrders(count = 1) {
    const ordersCount = Math.max(1, parseInt(count, 10) || 1);
    this.pendingRings += ordersCount;
    this.stopRequested = false;

    if (this.isRinging) {
      this.notifyListeners();
      return;
    }

    this.isRinging = true;
    this.notifyListeners();

    try {
      // Ensure audio context is resumed if possible
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch (e) {}
      }

      while (this.pendingRings > 0 && !this.stopRequested) {
        this.notifyListeners();
        await this.playSingle3SecRing();
        this.pendingRings = Math.max(0, this.pendingRings - 1);

        if (this.pendingRings > 0 && !this.stopRequested) {
          // 0.4s pause between distinct 3-second rings
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    } catch (err) {
      console.warn('[KOT Audio] Ringing error:', err);
    } finally {
      this.isRinging = false;
      this.pendingRings = 0;
      this.stopRequested = false;
      this.notifyListeners();
    }
  }

  /**
   * Instantly silence active ringing
   */
  stop() {
    this.stopRequested = true;
    this.pendingRings = 0;

    // Stop HTML5 audio
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch (e) {}
    }

    // Stop Web Audio nodes
    this.activeNodes.forEach((node) => {
      try {
        if (typeof node.stop === 'function') node.stop();
        if (node.gain && typeof node.gain.setValueAtTime === 'function') {
          node.gain.setValueAtTime(0, 0);
        }
      } catch (e) {}
    });
    this.activeNodes = [];
    this.isRinging = false;
    this.notifyListeners();
  }
}

export const kotAudio = new KOTAudioController();

export const ringKOTOrders = (count = 1) => kotAudio.ringForOrders(count);

export const stopKOTRinging = () => kotAudio.stop();

export const unlockKOTAudio = () => kotAudio.unlock();

export const testKOTAudio = () => kotAudio.ringForOrders(1);
