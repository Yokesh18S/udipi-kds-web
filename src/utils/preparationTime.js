/**
 * DATA UDIPI – INTELLIGENT MENU-WISE ESTIMATED PREPARATION TIME (ETA)
 * Frontend-only calculation utility for the Customer TV Display.
 * Calculates dynamic workload-aware and station-aware ETAs based on actual items and quantities.
 */

// 1. Configurable Base Preparation Times (in minutes)
export const MENU_PREP_TIMES = {
  // Steam / Tiffin
  idly: 2,
  'mini idly': 3,
  pongal: 5,
  upma: 5,
  khara_bath: 5,
  kesari_bath: 4,

  // Fry Station
  vada: 4,
  'sambar vada': 5,
  poori: 8,
  bonda: 5,
  bajji: 5,

  // Tawa Station (Dosa & Breads)
  'plain dosa': 5,
  dosa: 5,
  'onion dosa': 7,
  'masala dosa': 8,
  'ghee roast': 8,
  'paper roast': 9,
  'rava dosa': 8,
  'set dosa': 6,
  uttapam: 7,
  chapati: 6,
  parotta: 7,

  // Hot Beverages
  tea: 2,
  coffee: 3,
  'filter coffee': 3,
  milk: 2,
  boost: 3,
  horlicks: 3,

  // Cold Juices & Shakes
  'fresh juice': 4,
  juice: 4,
  milkshake: 5,
  lassi: 3,
  buttermilk: 2,

  // Wok / Main Kitchen
  'fried rice': 10,
  noodles: 10,
  biryani: 15,
  meals: 12,
  thali: 12,
  curry: 8,
};

// 2. Kitchen Preparation Stations for parallel processing
export const KITCHEN_STATIONS = {
  STEAM: ['idly', 'mini idly', 'pongal', 'upma', 'bath'],
  FRY: ['vada', 'sambar vada', 'poori', 'bonda', 'bajji'],
  TAWA: ['dosa', 'roast', 'uttapam', 'chapati', 'parotta'],
  HOT_DRINKS: ['tea', 'coffee', 'milk', 'boost', 'horlicks'],
  COLD_DRINKS: ['juice', 'shake', 'lassi', 'buttermilk'],
  MAIN_KITCHEN: ['rice', 'noodle', 'biryani', 'meal', 'thali', 'curry'],
};

// Configurable default estimate for items not in dictionary
export const DEFAULT_PREP_TIME = 8;

/**
 * Resolve base preparation time and station for an individual menu item.
 */
export function getItemPrepInfo(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return { time: DEFAULT_PREP_TIME, station: 'GENERAL' };
  }

  const name = rawName.toLowerCase().trim();

  // 1. Direct dictionary match
  if (MENU_PREP_TIMES[name] !== undefined) {
    const station = resolveStation(name);
    return { time: MENU_PREP_TIMES[name], station };
  }

  // 2. Keyword matching for variations (e.g. "Special Ghee Roast Dosa", "Filter Coffee (Large)")
  if (name.includes('mini idly')) return { time: 3, station: 'STEAM' };
  if (name.includes('idly') || name.includes('idli')) return { time: 2, station: 'STEAM' };
  if (name.includes('sambar vada')) return { time: 5, station: 'FRY' };
  if (name.includes('vada') || name.includes('vadai')) return { time: 4, station: 'FRY' };
  if (name.includes('poori') || name.includes('puri')) return { time: 8, station: 'FRY' };
  if (name.includes('pongal')) return { time: 5, station: 'STEAM' };
  if (name.includes('upma')) return { time: 5, station: 'STEAM' };
  if (name.includes('paper roast')) return { time: 9, station: 'TAWA' };
  if (name.includes('ghee roast') || name.includes('masala dosa')) return { time: 8, station: 'TAWA' };
  if (name.includes('onion dosa') || name.includes('rava dosa') || name.includes('uttapam')) return { time: 7, station: 'TAWA' };
  if (name.includes('dosa') || name.includes('dosai')) return { time: 5, station: 'TAWA' };
  if (name.includes('parotta') || name.includes('paratha')) return { time: 7, station: 'TAWA' };
  if (name.includes('chapati') || name.includes('roti')) return { time: 6, station: 'TAWA' };
  if (name.includes('biryani') || name.includes('briyani')) return { time: 15, station: 'MAIN_KITCHEN' };
  if (name.includes('fried rice') || name.includes('noodles')) return { time: 10, station: 'MAIN_KITCHEN' };
  if (name.includes('meal') || name.includes('thali')) return { time: 12, station: 'MAIN_KITCHEN' };
  if (name.includes('filter coffee') || name.includes('coffee')) return { time: 3, station: 'HOT_DRINKS' };
  if (name.includes('tea') || name.includes('chai')) return { time: 2, station: 'HOT_DRINKS' };
  if (name.includes('juice') || name.includes('shake')) return { time: 4, station: 'COLD_DRINKS' };

  return { time: DEFAULT_PREP_TIME, station: 'GENERAL' };
}

function resolveStation(name) {
  for (const [station, keywords] of Object.entries(KITCHEN_STATIONS)) {
    if (keywords.some((kw) => name.includes(kw))) {
      return station;
    }
  }
  return 'GENERAL';
}

/**
 * Calculate the estimated preparation workload for an entire bill using a parallel preparation model.
 * - Items prepared at the same station batch partially.
 * - Different stations operate concurrently in parallel.
 * - Workload = max station duration + minor assembly coordination buffer.
 */
export function calculateBillBaseWorkload(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 8; // Default base workload for unknown item lists
  }

  const stationBatches = {};

  items.forEach((item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const { time, station } = getItemPrepInfo(item.name);

    if (!stationBatches[station]) {
      stationBatches[station] = {
        maxItemTime: time,
        totalQuantity: qty,
      };
    } else {
      stationBatches[station].maxItemTime = Math.max(stationBatches[station].maxItemTime, time);
      stationBatches[station].totalQuantity += qty;
    }
  });

  // Calculate duration per station accounting for batch volume
  const stationTimes = Object.values(stationBatches).map(({ maxItemTime, totalQuantity }) => {
    // Extra batch buffer: +1 min for every 2 additional portions at the same station
    const batchBuffer = Math.floor((totalQuantity - 1) * 0.5);
    return maxItemTime + batchBuffer;
  });

  // Since stations work in parallel, base preparation time is the longest station
  const longestStationTime = Math.max(...stationTimes, 4);

  // Minor coordination assembly buffer if 3 or more distinct kitchen stations are involved
  const activeStationsCount = Object.keys(stationBatches).length;
  const coordinationBuffer = activeStationsCount >= 3 ? 2 : activeStationsCount === 2 ? 1 : 0;

  return longestStationTime + coordinationBuffer;
}

/**
 * Calculate dynamic, queue-aware Estimated Preparation Time (ETA) for an order.
 *
 * @param {Object} order - Order object with status, created_at, items
 * @param {number} queuePosition - Number of active orders ahead in kitchen queue
 * @returns {string} Formatted ETA (e.g. "~15 MIN", "~8 MIN", "READY", "SERVED")
 */
export function calculateOrderETA(order, queuePosition = 0) {
  if (!order) return '~10 MIN';

  const status = (order.status || '').toUpperCase();

  // 1. Terminal / Ready Statuses
  if (status === 'READY') {
    return 'READY';
  }
  if (status === 'SERVED' || status === 'COMPLETED') {
    return 'SERVED';
  }

  // 2. Base Workload from actual bill items
  const baseWorkload = calculateBillBaseWorkload(order.items);

  // 3. Queue Workload adjustment
  // Each order ahead adds a realistic queue delay (capped at 12 min to prevent excessive inflation)
  const queueDelay = Math.min(12, Math.floor(queuePosition * 1.5));
  const totalTargetMinutes = Math.min(35, Math.max(4, baseWorkload + queueDelay));

  // 4. Status-specific countdown behavior
  if (status === 'PREPARING') {
    // Calculate elapsed time since order was created
    let elapsedMinutes = 0;
    if (order.created_at) {
      let dStr = typeof order.created_at === 'string' ? order.created_at : order.created_at.toString();
      if (!dStr.includes('Z') && !dStr.includes('+')) {
        dStr = dStr.replace(' ', 'T') + 'Z';
      }
      const diffMs = Date.now() - new Date(dStr).getTime();
      if (!isNaN(diffMs) && diffMs > 0) {
        elapsedMinutes = Math.floor(diffMs / 60000);
      }
    }

    // Remaining preparation time (minimum 2 minutes while actively preparing)
    const remaining = Math.max(2, Math.ceil(totalTargetMinutes - elapsedMinutes));
    return `~${remaining} MIN`;
  }

  // BILLED / PENDING / CONFIRMED status
  return `~${Math.ceil(totalTargetMinutes)} MIN`;
}

