// ── N1 Route Optimizer — Shared Config ──────────────────────

export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || "";
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const KITCHEN = {
  name: "N1 Central Kitchen",
  address: "2508 N 33rd Ave, Phoenix, AZ 85009",
};

// ── Design tokens ────────────────────────────────────────────
export const C = {
  navy: "#0f2744",
  teal: "#0d9488",
  red: "#dc2626",
  amber: "#f59e0b",
  green: "#16a34a",
  purple: "#7c3aed",
  blue: "#2563eb",
  bg: "#f8fafc",
  surface: "#ffffff",
  border: "#e2e8f0",
  muted: "#64748b",
  light: "#f1f5f9",
};

// ── Supabase headers ─────────────────────────────────────────
export const sbHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "apikey": SUPABASE_ANON_KEY,
};

// ── Supabase CRUD ────────────────────────────────────────────
export async function fetchSchoolsFromDB() {
  const sr = await fetch(`${SUPABASE_URL}/rest/v1/routing_schools?active=eq.true&order=name`, { headers: sbHeaders });
  const schools = await sr.json();
  const wr = await fetch(`${SUPABASE_URL}/rest/v1/routing_service_windows?order=school_id,meal_type,service_number`, { headers: sbHeaders });
  const windows = await wr.json();
  return schools.map(s => ({ ...s, service_windows: windows.filter(w => w.school_id === s.id) }));
}

export async function updateSchool(id, updates) {
  await fetch(`${SUPABASE_URL}/rest/v1/routing_schools?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...sbHeaders, "Prefer": "return=minimal" },
    body: JSON.stringify(updates),
  });
}

export async function updateServiceWindow(id, updates) {
  await fetch(`${SUPABASE_URL}/rest/v1/routing_service_windows?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...sbHeaders, "Prefer": "return=minimal" },
    body: JSON.stringify(updates),
  });
}

export async function createServiceWindow(data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/routing_service_windows`, {
    method: "POST",
    headers: { ...sbHeaders, "Prefer": "return=representation" },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function deleteServiceWindow(id) {
  await fetch(`${SUPABASE_URL}/rest/v1/routing_service_windows?id=eq.${id}`, {
    method: "DELETE",
    headers: sbHeaders,
  });
}

export async function createSchool(data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/routing_schools`, {
    method: "POST",
    headers: { ...sbHeaders, "Prefer": "return=representation" },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function deleteSchool(id) {
  await fetch(`${SUPABASE_URL}/rest/v1/routing_service_windows?school_id=eq.${id}`, {
    method: "DELETE",
    headers: sbHeaders,
  });
  await fetch(`${SUPABASE_URL}/rest/v1/routing_schools?id=eq.${id}`, {
    method: "DELETE",
    headers: sbHeaders,
  });
}

// ── Route CRUD (Supabase) ────────────────────────────────────
export async function fetchRoutesFromDB() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/routing_routes?active=eq.true&order=sort_order,created_at`, { headers: sbHeaders });
  return res.json();
}

export async function createRoute(data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/routing_routes`, {
    method: "POST",
    headers: { ...sbHeaders, "Prefer": "return=representation" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateRouteDB(id, updates) {
  await fetch(`${SUPABASE_URL}/rest/v1/routing_routes?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...sbHeaders, "Prefer": "return=minimal" },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
}

export async function deleteRouteDB(id) {
  await fetch(`${SUPABASE_URL}/rest/v1/routing_routes?id=eq.${id}`, {
    method: "DELETE",
    headers: sbHeaders,
  });
}

export async function deleteAllRoutes() {
  await fetch(`${SUPABASE_URL}/rest/v1/routing_routes?active=eq.true`, {
    method: "DELETE",
    headers: sbHeaders,
  });
}

// ── Distance Matrix via Supabase Edge Function ───────────────
export async function fetchDriveMatrix(addresses) {
  const results = {};
  const URL = `${SUPABASE_URL}/functions/v1/distance-matrix`;
  results[KITCHEN.address] = {};
  for (let i = 0; i < addresses.length; i += 25) {
    const batch = addresses.slice(i, i + 25);
    try {
      const r = await fetch(URL, {
        method: "POST",
        headers: sbHeaders,
        body: JSON.stringify({ origins: [KITCHEN.address], destinations: batch }),
      });
      const d = await r.json();
      if (d.rows?.[0]) {
        d.rows[0].elements.forEach((el, ci) => {
          if (el.status === "OK") {
            results[KITCHEN.address][batch[ci]] = Math.round(el.duration.value / 60);
          }
        });
      }
    } catch (e) {
      console.warn("Matrix error:", e);
    }
  }
  return results;
}

// ── Shared UI Components ─────────────────────────────────────
export function TAG({ color, children }) {
  return (
    <span style={{
      background: color + "18",
      color,
      border: `1px solid ${color}40`,
      borderRadius: 5,
      padding: "1px 7px",
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

// ── Labor Settings (localStorage) ────────────────────────────
const DEFAULT_LABOR = {
  driverRate: 18,
  serverRate: 15,
  otThreshold: 8,
  otMultiplier: 1.5,
};

export function loadLaborSettings() {
  try {
    const s = localStorage.getItem("n1_labor_settings");
    return s ? { ...DEFAULT_LABOR, ...JSON.parse(s) } : { ...DEFAULT_LABOR };
  } catch {
    return { ...DEFAULT_LABOR };
  }
}

export function saveLaborSettings(settings) {
  localStorage.setItem("n1_labor_settings", JSON.stringify(settings));
}

// ── Resource Pool (localStorage) ─────────────────────────────
const DEFAULT_RESOURCES = {
  maxDrivers: 20,
  maxServersOwnCar: 10,
  maxRideAlongs: 4,
  rideAlongAvailableFrom: "9:00 AM",
  kitchenSplitShift: 2,
  kitchenSplitAvailableFrom: "9:30 AM",
};

export function loadResourcePool() {
  try {
    const s = localStorage.getItem("n1_resource_pool");
    return s ? { ...DEFAULT_RESOURCES, ...JSON.parse(s) } : { ...DEFAULT_RESOURCES };
  } catch {
    return { ...DEFAULT_RESOURCES };
  }
}

export function saveResourcePool(pool) {
  localStorage.setItem("n1_resource_pool", JSON.stringify(pool));
}

// ── Cost Calculation ─────────────────────────────────────────
export function calculateLaborCost(hours, rate, otThreshold, otMultiplier) {
  if (!hours || !rate) return 0;
  const regular = Math.min(hours, otThreshold);
  const overtime = Math.max(0, hours - otThreshold);
  return (regular * rate) + (overtime * rate * otMultiplier);
}