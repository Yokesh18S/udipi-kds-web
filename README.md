# Udipi KDS Web — Dedicated Kitchen Display System

A lightweight, standalone web application engineered specifically for commercial kitchen monitors, Android TVs, iPads, and touch terminals.

---

## ⚡ Key Architectural Advantages

- **Zero-Friction Deployment & Instant Updates**: Push to Git $\to$ live instantly across all kitchen screens without sideloading or managing APKs.
- **Ultra-Lightweight (<100 KB Gzip Bundle)**: Stripped of heavy customer-facing libraries, charts, and routing. Consumes negligible RAM and runs 24/7 without memory leaks on cheap 1GB/2GB TV sticks and tablets.
- **Audio Autoplay Unlock & Keep-Alive**: Dual-engine audio controller combining HTML5 Audio with Web Audio API synthesis (853Hz + 960Hz dual resonant alarm) plus a 15-second background heartbeat to prevent audio hardware from sleeping.
- **Screen Wake Lock API**: Automatically keeps the tablet or TV screen awake (`navigator.wakeLock.request('screen')`) and re-acquires the lock on document visibility changes.
- **Fullscreen Kiosk Mode**: One-tap kiosk activation hides browser address bars and URL chrome.
- **TV & Tablet Ergonomics**: High-contrast, steam-resistant dark mode with dynamic text zoom (100% / 120% / 140%) for effortless readability from 10 feet away.
- **0ms Optimistic Reactions**: Instant UI card state transition when cooks tap "Start Prep", "Mark Ready", or "Mark Served", shielded from polling race conditions.

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Navigate to the project directory
cd udipi-kds-web

# 2. Install dependencies (if not already installed)
npm install

# 3. Configure API URL in .env
# VITE_API_BASE_URL=http://localhost:8001 (or your production API URL)

# 4. Start local development server
npm run dev
```

---

## 🌐 Deployment to Subdomain (e.g. `kds.udipi.com`)

### Option A: Vercel (Recommended)
1. Push this directory or a dedicated repository to GitHub.
2. In [Vercel Dashboard](https://vercel.com): **New Project** $\to$ Import repository.
3. In **Environment Variables**, set:
   - `VITE_API_BASE_URL`: `https://your-backend-api.com`
4. In **Project Settings** $\to$ **Domains**, add your custom subdomain: `kds.yourrestaurant.com`.
5. Point your DNS CNAME record: `kds` $\to$ `cname.vercel-dns.com`.

### Option B: Cloudflare Pages / Netlify
1. Build command: `npm run build`
2. Output directory: `dist`
3. Environment variables: `VITE_API_BASE_URL`

---

## 🔒 Backend CORS Configuration

In `Food_Ordering_App_Backend`:
If `CORS_ALLOWED_ORIGINS` is configured in your backend `.env`, ensure your new KDS domain is included:

```env
CORS_ALLOWED_ORIGINS=https://kds.yourrestaurant.com,https://yourrestaurant.com,http://localhost:5173
```
*(If `CORS_ALLOWED_ORIGINS` is unset, the backend automatically allows all origins).*

---

## 📁 Project Structure

```text
udipi-kds-web/
├── public/
│   ├── _redirects               # SPA fallback for Netlify
│   └── sounds/
│       ├── kot_bell.wav         # Pre-buffered bell chime
│       └── bell_short.wav       # Short chime
├── src/
│   ├── components/
│   │   ├── KDSHeader.jsx        # Clock, active count, zoom, fullscreen, audio test
│   │   ├── KDSOrdersView.jsx    # 2-column ticket board (New/Prep vs Ready/Served)
│   │   ├── KioskBanner.jsx      # One-tap audio & kiosk activator banner
│   │   └── KitchenLogin.jsx     # Sleek manager/kitchen terminal login
│   ├── hooks/
│   │   ├── useFullscreen.js     # Vendor-agnostic Fullscreen API controller
│   │   └── useWakeLock.js       # 24/7 screen sleep prevention & re-acquisition
│   ├── services/
│   │   └── api.js               # Minimal Axios client with auto Bearer token
│   ├── utils/
│   │   └── kotAudio.js          # Cross-platform Web Audio + HTML5 audio alarm
│   ├── App.jsx                  # App coordinator & state management
│   ├── index.css                # High-contrast steam-resistant kitchen theme
│   └── main.jsx
├── vercel.json                  # SPA routing configuration for Vercel
├── vite.config.js
└── package.json
```
