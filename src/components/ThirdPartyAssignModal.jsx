import React, { useState } from 'react';
import {
  X,
  Bike,
  Zap,
  Box,
  User,
  Phone,
  Car,
  Hash,
  Clock,
  Link,
  CheckCircle2,
  Loader2,
  KeyRound,
} from 'lucide-react';
import { api } from '../services/api';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Smart API caller: tries primary base URL, falls back to localhost if 404
// (Cloud api may not have assign-partner yet; local dev server always does)
// ─────────────────────────────────────────────────────────────────────────────
async function smartPost(path, payload) {
  const primary = api.defaults.baseURL || 'http://dev-api.dataudipi.com';
  const fallbacks = [
    'http://localhost:8001',
    'http://127.0.0.1:8001',
  ];

  // Try primary first
  try {
    const r = await api.post(path, payload);
    return r.data;
  } catch (err) {
    if (err?.response?.status !== 404) throw err; // only fallback on 404
    console.warn(`[ThirdParty] Primary (${primary}) returned 404 for ${path}. Trying local fallback...`);
  }

  // Try local fallbacks
  const token = localStorage.getItem('kds_access_token') || localStorage.getItem('access_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  for (const base of fallbacks) {
    try {
      const r = await axios.post(`${base}${path}`, payload, { headers, timeout: 5000 });
      // Update default base so subsequent calls also use local
      api.defaults.baseURL = base;
      console.info(`[ThirdParty] Switched to local backend: ${base}`);
      return r.data;
    } catch (fbErr) {
      if (fbErr?.response?.status !== 404) {
        // Got a real error (not 404) — this base exists, surface the error
        const detail = fbErr?.response?.data?.detail || fbErr?.response?.data?.message || fbErr.message;
        throw new Error(typeof detail === 'string' ? detail : 'Request failed');
      }
      // This fallback also 404'd, try next
    }
  }

  throw new Error('assign-partner endpoint not found on any server. Please ensure the backend is running.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner Option Chip
// ─────────────────────────────────────────────────────────────────────────────
function PartnerChip({ value, label, icon: Icon, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`partner-chip ${selected ? 'partner-chip-active' : ''}`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Modal
// ─────────────────────────────────────────────────────────────────────────────
export default function ThirdPartyAssignModal({ order, onClose, onSuccess }) {
  // ── The live orders API returns `order_id: o.id` (the DB primary key).
  // `id` does NOT exist on the KDS order object — always use `order_id`.
  const dbOrderId = order?.order_id;
  const displayId =
    order?.branch_order_id || order?.bill_no || order?.order_id;

  const [partner, setPartner] = useState('Rapido');
  const [riderName, setRiderName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('Bike');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [eta, setEta] = useState('25 mins');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [pin, setPin] = useState('');           // PIN shown to customer

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);

  const PARTNERS = [
    { value: 'Rapido', label: 'Rapido', icon: Bike },
    { value: 'Dunzo', label: 'Dunzo', icon: Zap },
    { value: 'Other', label: 'Other', icon: Box },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // ── Validations
    if (!riderName.trim()) return setError('Rider Name is required.');
    if (!riderPhone.trim() || riderPhone.trim().length < 10)
      return setError('Enter a valid 10-digit Rider Phone Number.');
    if (!dbOrderId) return setError('Order ID is missing. Please close and reopen.');

    setLoading(true);
    try {
      // Step 1: Assign the third-party partner — with cloud→local fallback
      const data = await smartPost(
        `/api/v1/delivery/orders/${dbOrderId}/assign-partner`,
        {
          partner,
          rider_name: riderName.trim(),
          rider_phone: riderPhone.trim(),
          vehicle_type: vehicleType || 'Bike',
          vehicle_number: vehicleNumber.trim() || undefined,
          eta: eta.trim() || '25 mins',
          tracking_url: trackingUrl.trim() || undefined,
          otp: pin.trim() || undefined,
        }
      );

      if (data?.success) {
        // Step 2: Set order status to OUT_FOR_DELIVERY (non-fatal if fails)
        try {
          await smartPost(`/api/v1/delivery/orders/${dbOrderId}/status`, {
            status: 'OUT_FOR_DELIVERY',
            notes: `Third-party ${partner} rider assigned. Rider: ${riderName.trim()}.${pin.trim() ? ` Customer PIN: ${pin.trim()}.` : ''}`,
          });
        } catch (statusErr) {
          console.warn('Status update (non-fatal):', statusErr?.message);
        }

        setSuccessData(data);
        setSuccess(true);
        setTimeout(() => {
          if (onSuccess) onSuccess(data);
          onClose();
        }, 2000);
      } else {
        setError('Assignment failed. Please try again.');
      }
    } catch (err) {
      console.error('[ThirdPartyAssignModal error]:', err);
      const detail = err?.response?.data?.detail;
      const msg =
        typeof detail === 'string'
          ? detail
          : err?.response?.data?.message || err?.message || 'Failed to assign rider. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tpa-backdrop" onClick={onClose}>
      <div className="tpa-sheet" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="tpa-header">
          <div className="tpa-header-left">
            <span className="tpa-admin-pill">ADMIN / DISPATCH</span>
            <h2 className="tpa-title">Third-Party Rider Assignment</h2>
            <p className="tpa-subtitle">Order #{displayId}</p>
          </div>
          <button className="tpa-close-btn" onClick={onClose} type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Success State ── */}
        {success ? (
          <div className="tpa-success-state">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mb-3" />
            <p className="tpa-success-title">Out for Delivery! 🚀</p>
            <p className="tpa-success-sub">
              {successData?.partner || partner} rider{' '}
              <strong>{successData?.rider_name || riderName}</strong> has been assigned.
            </p>
            {pin.trim() && (
              <div className="tpa-pin-display">
                <span className="tpa-pin-label">Customer PIN</span>
                <span className="tpa-pin-value">{pin.trim()}</span>
              </div>
            )}
            <p className="tpa-success-status">Status → OUT FOR DELIVERY</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="tpa-form">

            {/* ── Delivery Partner ── */}
            <div className="tpa-field-group">
              <label className="tpa-label">
                Delivery Partner <span className="tpa-required">*</span>
              </label>
              <div className="tpa-partner-row">
                {PARTNERS.map((p) => (
                  <PartnerChip
                    key={p.value}
                    value={p.value}
                    label={p.label}
                    icon={p.icon}
                    selected={partner === p.value}
                    onSelect={setPartner}
                  />
                ))}
              </div>
            </div>

            {/* ── Rider Name ── */}
            <div className="tpa-field-group">
              <label className="tpa-label" htmlFor="tpa-rider-name">
                Rider Name <span className="tpa-required">*</span>
              </label>
              <div className="tpa-input-wrap">
                <User className="tpa-input-icon" />
                <input
                  id="tpa-rider-name"
                  type="text"
                  className="tpa-input"
                  placeholder="Enter rider's full name"
                  value={riderName}
                  onChange={(e) => setRiderName(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* ── Rider Phone ── */}
            <div className="tpa-field-group">
              <label className="tpa-label" htmlFor="tpa-rider-phone">
                Rider Phone Number <span className="tpa-required">*</span>
              </label>
              <div className="tpa-input-wrap">
                <Phone className="tpa-input-icon" />
                <input
                  id="tpa-rider-phone"
                  type="tel"
                  className="tpa-input"
                  placeholder="10-digit mobile number"
                  value={riderPhone}
                  onChange={(e) =>
                    setRiderPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                  autoComplete="off"
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* ── Vehicle Type & Number (2-col) ── */}
            <div className="tpa-two-col">
              <div className="tpa-field-group">
                <label className="tpa-label" htmlFor="tpa-vehicle-type">
                  Vehicle Type
                </label>
                <div className="tpa-input-wrap">
                  <Car className="tpa-input-icon" />
                  <select
                    id="tpa-vehicle-type"
                    className="tpa-input tpa-select"
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                  >
                    <option value="Bike">Bike</option>
                    <option value="Scooter">Scooter</option>
                    <option value="Car">Car</option>
                    <option value="Auto">Auto</option>
                    <option value="Cycle">Cycle</option>
                  </select>
                </div>
              </div>

              <div className="tpa-field-group">
                <label className="tpa-label" htmlFor="tpa-vehicle-number">
                  Vehicle Number
                </label>
                <div className="tpa-input-wrap">
                  <Hash className="tpa-input-icon" />
                  <input
                    id="tpa-vehicle-number"
                    type="text"
                    className="tpa-input"
                    placeholder="TN 01 AB 1234"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>

            {/* ── ETA & PIN (2-col) ── */}
            <div className="tpa-two-col">
              <div className="tpa-field-group">
                <label className="tpa-label" htmlFor="tpa-eta">
                  ETA
                </label>
                <div className="tpa-input-wrap">
                  <Clock className="tpa-input-icon" />
                  <input
                    id="tpa-eta"
                    type="text"
                    className="tpa-input"
                    placeholder="25 mins"
                    value={eta}
                    onChange={(e) => setEta(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="tpa-field-group">
                <label className="tpa-label" htmlFor="tpa-pin">
                  Customer PIN{' '}
                  <span className="tpa-optional">(shown to customer)</span>
                </label>
                <div className="tpa-input-wrap">
                  <KeyRound className="tpa-input-icon" />
                  <input
                    id="tpa-pin"
                    type="text"
                    className="tpa-input tpa-pin-input"
                    placeholder="e.g. 4821"
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={6}
                  />
                </div>
              </div>
            </div>

            {/* ── Tracking URL (optional, full width) ── */}
            <div className="tpa-field-group">
              <label className="tpa-label" htmlFor="tpa-tracking-url">
                External Live Tracking URL{' '}
                <span className="tpa-optional">(Optional)</span>
              </label>
              <div className="tpa-input-wrap">
                <Link className="tpa-input-icon" />
                {/* type="text" avoids browser's built-in URL validation on optional field */}
                <input
                  id="tpa-tracking-url"
                  type="text"
                  className="tpa-input"
                  placeholder="https://track.rapido.bike/..."
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* ── Error ── */}
            {error && (
              <div className="tpa-error-box">⚠️ {error}</div>
            )}

            {/* ── Submit ── */}
            <button type="submit" className="tpa-submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Assigning Rider...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  Save &amp; Set Out for Delivery
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
