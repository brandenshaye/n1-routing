import { useState, useEffect, useRef } from "react";
import { C, TAG, KITCHEN, fetchRoutesFromDB, createRoute, updateRouteDB, deleteRouteDB, deleteAllRoutes } from "./config.jsx";

// ── Constants ────────────────────────────────────────────────
const ROUTE_TYPES = [
  { value: "all_day", label: "All-Day", color: "#7c3aed" },
  { value: "bkfst_run", label: "Breakfast Run", color: C.amber },
  { value: "lunch_run", label: "Lunch Run", color: "#2563eb" },
  { value: "combo_run", label: "Combo Run", color: C.teal },
  { value: "drop_run", label: "Drop Run", color: C.muted },
];
const METHODS = [{ value: "TT", label: "Time-Temp" }, { value: "C", label: "Cambro" }];
const SERVICE_TAGS = [
  { value: "lunch", label: "LUNCH", color: "#2563eb" },
  { value: "breakfast", label: "BKFST", color: C.amber },
  { value: "da_breakfast", label: "DA BKFST", color: "#92400e" },
];
const SERVE_TYPES = [
  { value: "drop", label: "Drop" },
  { value: "driver_serves", label: "Driver Serves" },
  { value: "dedicated_server", label: "Dedicated Server" },
  { value: "driver_and_server", label: "Driver + Server" },
];

function getTypeInfo(t) { return ROUTE_TYPES.find(x => x.value === t) || ROUTE_TYPES[2]; }
function getSvcTag(s) { return SERVICE_TAGS.find(x => x.value === s) || SERVICE_TAGS[0]; }
function serveLabel(t) { return SERVE_TYPES.find(x => x.value === t)?.label || "Drop"; }
function serveColor(t) { return t === "driver_serves" ? "#7c3aed" : t === "dedicated_server" ? C.teal : t === "driver_and_server" ? C.navy : C.muted; }

// Parse "7:30 AM" to minutes since midnight
function parseTime(str) {
  if (!str) return null;
  const m = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hrs = parseInt(m[1]); const mins = parseInt(m[2]); const ap = m[3].toUpperCase();
  if (ap === "PM" && hrs !== 12) hrs += 12;
  if (ap === "AM" && hrs === 12) hrs = 0;
  return hrs * 60 + mins;
}

function formatDuration(mins) {
  if (!mins || mins <= 0) return "—";
  const h = Math.floor(mins / 60); const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getRoutePersonnel(r) {
  let count = r.driver_name ? 1 : 0;
  if (r.server_names) count += r.server_names.split(",").filter(s => s.trim()).length;
  return count;
}

function getRouteDuration(r) {
  const dep = parseTime(r.departure_time);
  const ret = parseTime(r.return_time);
  if (dep === null || ret === null) return null;
  return ret - dep;
}

// ── Time Input ───────────────────────────────────────────────
function TimeInput({ value, onChange }) {
  const parts = (value || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i) || [];
  const [hrs, setHrs] = useState(parts[1] || "");
  const [mins, setMins] = useState(parts[2] || "");
  const [ampm, setAmpm] = useState((parts[3] || "AM").toUpperCase());

  useEffect(() => {
    const p = (value || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (p) { setHrs(p[1]); setMins(p[2]); setAmpm(p[3].toUpperCase()); }
  }, [value]);

  function emit(h, m, ap) { if (h && m) onChange(`${h}:${m} ${ap}`); else if (h) onChange(`${h}:00 ${ap}`); else onChange(""); }
  function handleHrs(e) { let v = e.target.value.replace(/\D/g, "").slice(0, 2); if (parseInt(v) > 12) v = "12"; setHrs(v); emit(v, mins, ampm); }
  function handleMins(e) { let v = e.target.value.replace(/\D/g, "").slice(0, 2); if (parseInt(v) > 59) v = "59"; setMins(v); emit(hrs, v, ampm); }
  function toggleAmPm() { const n = ampm === "AM" ? "PM" : "AM"; setAmpm(n); emit(hrs, mins, n); }

  const tBox = { border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 4px", fontSize: 12, outline: "none", textAlign: "center", width: 28 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <input value={hrs} onChange={handleHrs} style={tBox} placeholder="H" maxLength={2} />
      <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>:</span>
      <input value={mins} onChange={handleMins} style={tBox} placeholder="MM" maxLength={2} />
      <button onClick={toggleAmPm} type="button" style={{ background: ampm === "AM" ? C.amber + "20" : "#2563eb20", color: ampm === "AM" ? C.amber : "#2563eb", border: `1px solid ${ampm === "AM" ? C.amber : "#2563eb"}40`, borderRadius: 4, padding: "3px 6px", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>{ampm}</button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────
export default function RouteBuilder({ schools, onNavigate }) {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("all");
  const [searchText, setSearchText] = useState("");
  const saveTimer = useRef(null);

  // Load routes from Supabase on mount, fallback to localStorage
  useEffect(() => {
    fetchRoutesFromDB().then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setRoutes(data.map(r => ({ ...r, stops: r.stops || [] })));
      } else {
        // Fallback to localStorage
        try { const local = JSON.parse(localStorage.getItem("n1_routes_backup") || "[]"); setRoutes(local); } catch {}
      }
      setLoading(false);
    }).catch(e => {
      console.warn("Supabase not ready — using localStorage backup");
      try { const local = JSON.parse(localStorage.getItem("n1_routes_backup") || "[]"); setRoutes(local); } catch {}
      setLoading(false);
    });
  }, []);

  // Always backup to localStorage
  useEffect(() => {
    if (routes.length > 0) localStorage.setItem("n1_routes_backup", JSON.stringify(routes));
  }, [routes]);

  // Auto-save: debounce writes to Supabase
  function saveRoute(route) {
    if (route._local) return; // Skip Supabase for local-only routes
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateRouteDB(route.id, {
        name: route.name, type: route.type, method: route.method,
        driver_name: route.driver_name, departure_time: route.departure_time,
        return_time: route.return_time, notes: route.notes,
        stops: route.stops, sort_order: route.sort_order,
      }).catch(e => console.warn("Auto-save skipped:", e));
    }, 500);
  }

  // Coverage
  const assignedKeys = new Set();
  routes.forEach(r => r.stops?.forEach(s => (s.services || []).forEach(svc => assignedKeys.add(`${s.schoolName}|${svc}`))));
  const allServices = [];
  schools.forEach(s => {
    const bk = s.service_windows?.filter(w => w.meal_type === "breakfast") || [];
    const ln = s.service_windows?.filter(w => w.meal_type === "lunch") || [];
    bk.forEach(b => allServices.push({ schoolName: s.name, svc: b.is_same_day ? "breakfast" : "da_breakfast", win: b, school: s }));
    ln.forEach(l => allServices.push({ schoolName: s.name, svc: "lunch", win: l, school: s }));
  });
  const unassignedSvcs = allServices.filter(a => !assignedKeys.has(`${a.schoolName}|${a.svc}`));
  const filteredSvcs = unassignedSvcs.filter(i => {
    if (searchText && !i.schoolName.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (search !== "all" && i.svc !== search) return false;
    return true;
  });

  // CRUD
  async function addNewRoute() {
    const localRoute = { id: String(Date.now()), name: `Route ${routes.length + 1}`, type: "lunch_run", method: "TT", driver_name: "", server_names: "", departure_time: "", return_time: "", loading_time: "", stops: [], notes: "", sort_order: routes.length, vans: [{ number: "", size: "large" }], _local: true };
    try {
      const result = await createRoute({ name: localRoute.name, type: "lunch_run", method: "TT", driver_name: "", departure_time: "", return_time: "", stops: [], notes: "", sort_order: routes.length });
      const newRoute = Array.isArray(result) ? result[0] : result;
      if (newRoute?.id) {
        setRoutes(prev => [...prev, { ...newRoute, stops: newRoute.stops || [] }]);
        setEditing(newRoute.id);
        return;
      }
    } catch (e) { console.warn("Supabase not ready, using local route"); }
    // Fallback: local-only route
    setRoutes(prev => [...prev, localRoute]);
    setEditing(localRoute.id);
  }

  async function removeRoute(id) {
    try { if (!routes.find(r => r.id === id)?._local) await deleteRouteDB(id); } catch {}
    setRoutes(prev => prev.filter(r => r.id !== id));
    if (editing === id) setEditing(null);
  }

  async function clearAll() {
    if (!confirm("Clear ALL routes?") || !confirm("Are you sure? This cannot be undone.")) return;
    try { await deleteAllRoutes(); } catch {}
    setRoutes([]);
    setEditing(null);
    localStorage.removeItem("n1_routes_backup");
  }

  function updateLocal(id, updates) {
    setRoutes(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...updates } : r);
      const route = updated.find(r => r.id === id);
      if (route) saveRoute(route);
      return updated;
    });
  }

  function addServiceToRoute(routeId, schoolName, svc) {
    setRoutes(prev => {
      const updated = prev.map(r => {
        if (r.id !== routeId) return r;
        // Always create a new stop from the pool — never merge
        return { ...r, stops: [...r.stops, { schoolName, arriveTime: "", departTime: "", services: [svc], serveType: "drop", serverCount: 0, returnToCK: false, ckReturnTime: "", ckDepartTime: "" }] };
      });
      const route = updated.find(r => r.id === routeId);
      if (route) saveRoute(route);
      return updated;
    });
  }

  // Add service to an EXISTING stop (used by + buttons within a stop card)
  function addServiceToExistingStop(routeId, stopIdx, svc) {
    setRoutes(prev => {
      const updated = prev.map(r => {
        if (r.id !== routeId) return r;
        const stops = r.stops.map((s, i) => i !== stopIdx || (s.services || []).includes(svc) ? s : { ...s, services: [...(s.services || []), svc] });
        return { ...r, stops };
      });
      const route = updated.find(r => r.id === routeId);
      if (route) saveRoute(route);
      return updated;
    });
  }

  function removeServiceFromStop(routeId, stopIdx, svc) {
    setRoutes(prev => {
      const updated = prev.map(r => r.id !== routeId ? r : { ...r, stops: r.stops.map((s, i) => i !== stopIdx ? s : { ...s, services: (s.services || []).filter(v => v !== svc) }) });
      const route = updated.find(r => r.id === routeId);
      if (route) saveRoute(route);
      return updated;
    });
  }

  function removeStop(routeId, idx) {
    setRoutes(prev => {
      const updated = prev.map(r => r.id !== routeId ? r : { ...r, stops: r.stops.filter((_, i) => i !== idx) });
      const route = updated.find(r => r.id === routeId);
      if (route) saveRoute(route);
      return updated;
    });
  }

  function updateStop(routeId, idx, u) {
    setRoutes(prev => {
      const updated = prev.map(r => r.id !== routeId ? r : { ...r, stops: r.stops.map((s, i) => i === idx ? { ...s, ...u } : s) });
      const route = updated.find(r => r.id === routeId);
      if (route) saveRoute(route);
      return updated;
    });
  }

  function moveStop(routeId, idx, dir) {
    setRoutes(prev => {
      const updated = prev.map(r => {
        if (r.id !== routeId) return r;
        const stops = [...r.stops]; const ni = idx + dir;
        if (ni < 0 || ni >= stops.length) return r;
        [stops[idx], stops[ni]] = [stops[ni], stops[idx]];
        return { ...r, stops };
      });
      const route = updated.find(r => r.id === routeId);
      if (route) saveRoute(route);
      return updated;
    });
  }

  const editRoute = routes.find(r => r.id === editing);
  const inp = { border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none", width: "100%" };
  const selStyle = { ...inp, background: "#fff" };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: C.muted, fontSize: 15 }}>Loading routes...</div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => onNavigate("dashboard")} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.muted }}>←</button>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>Route Builder</div>
          <div style={{ fontSize: 13, color: C.muted }}>{routes.length} routes · {unassignedSvcs.length} unassigned</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {routes.length > 0 && <button onClick={clearAll} style={{ background: "#fef2f2", border: `1px solid ${C.red}40`, borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: C.red }}>Clear All</button>}
          <button onClick={addNewRoute} style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ New Route</button>
        </div>
      </div>

      {/* Coverage */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}><div style={{ height: 6, background: C.light, borderRadius: 3 }}><div style={{ height: "100%", background: unassignedSvcs.length === 0 ? C.green : C.teal, borderRadius: 3, width: `${(assignedKeys.size / Math.max(allServices.length, 1)) * 100}%` }} /></div></div>
        <span style={{ fontSize: 12, fontWeight: 700, color: unassignedSvcs.length === 0 ? C.green : C.navy }}>{assignedKeys.size}/{allServices.length}</span>
        <TAG color={C.amber}>{unassignedSvcs.filter(i => i.svc === "breakfast").length} bkfst</TAG>
        <TAG color={"#2563eb"}>{unassignedSvcs.filter(i => i.svc === "lunch").length} lunch</TAG>
        <TAG color={"#92400e"}>{unassignedSvcs.filter(i => i.svc === "da_breakfast").length} DA</TAG>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Left panel */}
        {editing && (
          <div style={{ width: 300, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Add Service to Route</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {[{ v: "all", l: "All" }, { v: "breakfast", l: "Bkfst" }, { v: "lunch", l: "Lunch" }, { v: "da_breakfast", l: "DA" }].map(f => (
                <button key={f.v} onClick={() => setSearch(f.v)} style={{ background: search === f.v ? C.navy : C.surface, color: search === f.v ? "#fff" : C.muted, border: `1px solid ${search === f.v ? C.navy : C.border}`, borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>{f.l}</button>
              ))}
            </div>
            <input placeholder="Search..." value={searchText} onChange={e => setSearchText(e.target.value)} style={{ ...inp, marginBottom: 8 }} />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, maxHeight: 500, overflowY: "auto" }}>
              {filteredSvcs.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, color: C.muted, textAlign: "center" }}>{unassignedSvcs.length === 0 ? "✓ All assigned" : "No matches"}</div>
              ) : filteredSvcs.map((item, i) => {
                const t = getSvcTag(item.svc);
                return (
                  <div key={`${item.schoolName}-${item.svc}-${i}`} style={{ padding: "5px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background = C.light} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: t.color, background: t.color + "15", padding: "1px 5px", borderRadius: 3 }}>{t.label}</span>
                        <span style={{ fontWeight: 600, color: C.navy, fontSize: 11 }}>{item.schoolName}</span>
                      </div>
                      <div style={{ fontSize: 9, color: C.muted }}>{item.win?.window_start}–{item.win?.window_end} · {item.win?.delivery_type === "served" ? "Served" : "Drop"}{item.win?.servers_needed > 0 ? ` · ${item.win.servers_needed} srv` : ""}</div>
                    </div>
                    <button onClick={() => addServiceToRoute(editing, item.schoolName, item.svc)} style={{ background: t.color, color: "#fff", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 700, cursor: "pointer" }}>+</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main */}
        <div style={{ flex: 1 }}>
          {editing && editRoute ? (
            // ── EDIT MODE ──
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <input value={editRoute.name} onChange={e => updateLocal(editing, { name: e.target.value })} style={{ border: "none", fontSize: 20, fontWeight: 800, color: C.navy, outline: "none", background: "transparent", width: "40%" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => removeRoute(editing)} style={{ background: "#fef2f2", border: `1px solid ${C.red}40`, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: C.red }}>🗑️ Delete</button>
                  <button onClick={() => setEditing(null)} style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Done</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Type</div><select value={editRoute.type} onChange={e => updateLocal(editing, { type: e.target.value })} style={selStyle}>{ROUTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Method</div><select value={editRoute.method} onChange={e => updateLocal(editing, { method: e.target.value })} style={selStyle}>{METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Load Time (min)</div><input value={editRoute.loading_time || ""} onChange={e => updateLocal(editing, { loading_time: e.target.value })} style={inp} placeholder="e.g. 30" /></div>
                <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>CK Depart</div><TimeInput value={editRoute.departure_time} onChange={v => updateLocal(editing, { departure_time: v })} /></div>
                <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>CK Return</div><TimeInput value={editRoute.return_time} onChange={v => updateLocal(editing, { return_time: v })} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Driver</div><input value={editRoute.driver_name || ""} onChange={e => updateLocal(editing, { driver_name: e.target.value })} style={inp} placeholder="Driver name" /></div>
                <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Notes</div><input value={editRoute.notes || ""} onChange={e => updateLocal(editing, { notes: e.target.value })} style={inp} placeholder="Notes..." /></div>
              </div>

              {/* Stops */}
              <div style={{ fontSize: 14, fontWeight: 800, color: C.navy, marginBottom: 10 }}>Stops ({editRoute.stops.length})</div>
              {editRoute.stops.length === 0 ? (
                <div style={{ background: C.light, borderRadius: 10, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>Add services from the panel on the left.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {editRoute.stops.map((stop, idx) => {
                    const school = schools.find(s => s.name === stop.schoolName);
                    const bk = school?.service_windows?.filter(w => w.meal_type === "breakfast") || [];
                    const ln = school?.service_windows?.filter(w => w.meal_type === "lunch") || [];
                    const availSvcs = [];
                    if (bk.length > 0) availSvcs.push(bk[0].is_same_day ? "breakfast" : "da_breakfast");
                    if (ln.length > 0) availSvcs.push("lunch");
                    const untagged = availSvcs.filter(s => !(stop.services || []).includes(s));

                    return (
                      <div key={idx} style={{ background: C.light, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 2 }}>
                            <button onClick={() => moveStop(editing, idx, -1)} disabled={idx === 0} style={{ background: "none", border: "none", fontSize: 10, cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? C.border : C.muted }}>▲</button>
                            <div style={{ fontSize: 16, fontWeight: 800, color: C.navy, textAlign: "center" }}>{idx + 1}</div>
                            <button onClick={() => moveStop(editing, idx, 1)} disabled={idx === editRoute.stops.length - 1} style={{ background: "none", border: "none", fontSize: 10, cursor: idx === editRoute.stops.length - 1 ? "default" : "pointer", color: idx === editRoute.stops.length - 1 ? C.border : C.muted }}>▼</button>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: C.navy, fontSize: 15, marginBottom: 4 }}>{stop.schoolName}</div>
                            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{school?.address}</div>
                            {(stop.services || []).map(svc => {
                              const t = getSvcTag(svc); const win = svc === "lunch" ? ln[0] : bk[0];
                              return (
                                <div key={svc} style={{ display: "flex", alignItems: "center", gap: 8, background: t.color + "10", padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.color}25`, marginBottom: 4 }}>
                                  <TAG color={t.color}>{t.label}</TAG>
                                  {win && <span style={{ fontSize: 11, color: C.navy }}>{win.window_start}–{win.window_end}</span>}
                                  <button onClick={() => removeServiceFromStop(editing, idx, svc)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.red, fontSize: 12, cursor: "pointer", fontWeight: 800 }}>×</button>
                                </div>
                              );
                            })}
                            {untagged.length > 0 && (
                              <div style={{ display: "flex", gap: 4, marginTop: 4, marginBottom: 6 }}>
                                {untagged.map(svc => { const t = getSvcTag(svc); return <button key={svc} onClick={() => addServiceToExistingStop(editing, idx, svc)} style={{ background: t.color + "15", color: t.color, border: `1px solid ${t.color}30`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>+ {t.label}</button>; })}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6, marginBottom: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 10, color: C.muted }}>Service:</span>
                                <select value={stop.serveType || "drop"} onChange={e => updateStop(editing, idx, { serveType: e.target.value })} style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 11, background: "#fff" }}>
                                  {SERVE_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                                </select>
                              </div>
                              {(stop.serveType && stop.serveType !== "drop") && (
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 10, color: C.muted }}>Servers:</span>
                                  <input type="number" min="0" value={stop.serverCount || 0} onChange={e => updateStop(editing, idx, { serverCount: parseInt(e.target.value) || 0 })} style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 4px", fontSize: 11, width: 35, textAlign: "center" }} />
                                </div>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 10, color: C.muted }}>Arrive:</span><TimeInput value={stop.arriveTime} onChange={v => updateStop(editing, idx, { arriveTime: v })} /></div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 10, color: C.muted }}>Depart:</span><TimeInput value={stop.departTime} onChange={v => updateStop(editing, idx, { departTime: v })} /></div>
                            </div>
                            {idx < editRoute.stops.length - 1 && (
                              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, padding: "6px 10px", background: stop.returnToCK ? C.navy + "08" : "transparent", borderRadius: 6, border: stop.returnToCK ? `1px solid ${C.navy}20` : "1px solid transparent" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: C.navy }}>
                                  <input type="checkbox" checked={stop.returnToCK || false} onChange={e => updateStop(editing, idx, { returnToCK: e.target.checked })} />
                                  Return to CK before next stop
                                </label>
                                {stop.returnToCK && (
                                  <>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 10, color: C.muted }}>CK Arrive:</span><TimeInput value={stop.ckReturnTime} onChange={v => updateStop(editing, idx, { ckReturnTime: v })} /></div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 10, color: C.muted }}>CK Depart:</span><TimeInput value={stop.ckDepartTime} onChange={v => updateStop(editing, idx, { ckDepartTime: v })} /></div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <button onClick={() => removeStop(editing, idx)} style={{ background: "none", border: "none", color: C.red, fontSize: 16, cursor: "pointer", fontWeight: 800 }}>🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            // ── GRID VIEW ──
            <div>
              {routes.length === 0 ? (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 40, textAlign: "center", color: C.muted }}>
                  <div style={{ fontSize: 24, marginBottom: 12 }}>No routes yet</div>
                  <div style={{ fontSize: 13 }}>Click <strong>+ New Route</strong> to get started.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {routes.map(r => {
                    const ti = getTypeInfo(r.type);
                    return (
                      <div key={r.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ background: C.navy, padding: "8px 16px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <input value={r.name} onChange={e => updateLocal(r.id, { name: e.target.value })}
                            style={{ background: "transparent", border: "none", borderBottom: "1px solid #ffffff30", padding: "2px 4px", fontSize: 14, fontWeight: 800, color: "#fff", outline: "none", width: 100 }}
                            onClick={e => e.stopPropagation()} />
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", opacity: 0.4 }}>:</span>
                          <input value={r.driver_name || ""} onChange={e => updateLocal(r.id, { driver_name: e.target.value })} placeholder="driver..."
                            style={{ background: "transparent", border: "none", borderBottom: "1px solid #ffffff30", padding: "2px 4px", fontSize: 14, fontWeight: 800, color: "#5eead4", outline: "none", width: 120 }}
                            onClick={e => e.stopPropagation()} />
                          {/* Server names */}
                          <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4 }}>Servers:</span>
                          <input value={r.server_names || ""} onChange={e => updateLocal(r.id, { server_names: e.target.value })} placeholder="add servers..."
                            style={{ background: "transparent", border: "none", borderBottom: "1px solid #ffffff30", padding: "2px 4px", fontSize: 11, fontWeight: 600, color: "#a78bfa", outline: "none", width: 140 }}
                            onClick={e => e.stopPropagation()} />
                          {/* Vans */}
                          {(r.vans || [{ number: "", size: "large" }]).map((van, vi) => (
                            <div key={vi} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              <span style={{ fontSize: 10, color: "#94a3b8" }}>{vi === 0 ? "Van:" : "+"}</span>
                              <input value={van.number || ""} onChange={e => { const vans = [...(r.vans || [{ number: "", size: "large" }])]; vans[vi] = { ...vans[vi], number: e.target.value }; updateLocal(r.id, { vans }); }} placeholder="#"
                                style={{ background: "transparent", border: "none", borderBottom: "1px solid #ffffff30", padding: "2px 2px", fontSize: 11, fontWeight: 700, color: "#fbbf24", outline: "none", width: 30, textAlign: "center" }}
                                onClick={e => e.stopPropagation()} />
                              <select value={van.size || "large"} onChange={e => { const vans = [...(r.vans || [{ number: "", size: "large" }])]; vans[vi] = { ...vans[vi], size: e.target.value }; updateLocal(r.id, { vans }); }}
                                style={{ background: "#ffffff15", border: "none", borderRadius: 3, padding: "1px 4px", fontSize: 9, color: "#94a3b8", cursor: "pointer" }}
                                onClick={e => e.stopPropagation()}>
                                <option value="large">LG</option>
                                <option value="small">SM</option>
                              </select>
                            </div>
                          ))}
                          <button onClick={e => { e.stopPropagation(); const vans = [...(r.vans || [{ number: "", size: "large" }])]; if (vans.length < 3) { vans.push({ number: "", size: "large" }); updateLocal(r.id, { vans }); } }}
                            style={{ background: "#ffffff15", border: "none", borderRadius: 4, padding: "1px 6px", fontSize: 10, color: "#94a3b8", cursor: "pointer" }}>+van</button>
                          <TAG color={ti.color}>{ti.label}</TAG>
                          {r.method === "C" && <TAG color={C.amber}>Cambro</TAG>}
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>{r.stops?.length || 0} stops</span>
                          {/* Calculated metrics */}
                          {getRouteDuration(r) !== null && <TAG color={C.teal}>{formatDuration(getRouteDuration(r))}</TAG>}
                          <TAG color={getRoutePersonnel(r) > 0 ? "#a78bfa" : C.muted}>{getRoutePersonnel(r)} ppl</TAG>
                          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                            <button onClick={() => setEditing(r.id)} style={{ background: "#ffffff20", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 11, color: "#fff", fontWeight: 600, cursor: "pointer" }}>Edit</button>
                            <button onClick={() => removeRoute(r.id)} style={{ background: "#dc262620", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "#fca5a5", cursor: "pointer" }}>🗑️</button>
                          </div>
                        </div>
                        <div style={{ padding: "10px 16px" }}>
                          {(!r.stops || r.stops.length === 0) ? (
                            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>No stops — click Edit</div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", rowGap: 8 }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 6px", minWidth: 50 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: C.navy }}>CK</div>
                                <div style={{ fontSize: 9, color: C.teal, fontWeight: 700 }}>{r.departure_time || "—"}</div>
                              </div>
                              <div style={{ width: 14, height: 2, background: ti.color }}><div style={{ position: "relative", right: -11, top: -3, width: 0, height: 0, borderLeft: `4px solid ${ti.color}`, borderTop: "3px solid transparent", borderBottom: "3px solid transparent" }} /></div>
                              {r.stops.map((stop, si) => {
                                const sc = serveColor(stop.serveType);
                                return (
                                  <div key={si} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                                    <div style={{ background: C.light, border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 8px", minWidth: 80 }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 1 }}>{stop.schoolName}</div>
                                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 1 }}>
                                        {(stop.services || []).map(svc => { const t = getSvcTag(svc); return <span key={svc} style={{ fontSize: 8, fontWeight: 700, color: t.color, background: t.color + "15", padding: "0 4px", borderRadius: 3 }}>{t.label}</span>; })}
                                      </div>
                                      <div style={{ fontSize: 8, color: sc, fontWeight: 600 }}>{serveLabel(stop.serveType)}{stop.serverCount > 0 ? ` (${stop.serverCount})` : ""}</div>
                                      {stop.arriveTime && <div style={{ fontSize: 8, color: C.teal, fontWeight: 600 }}>Arr: {stop.arriveTime}</div>}
                                      {stop.departTime && <div style={{ fontSize: 8, color: C.muted }}>Dep: {stop.departTime}</div>}
                                    </div>
                                    {/* CK return or arrow to next */}
                                    {stop.returnToCK && si < r.stops.length - 1 ? (
                                      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                                        <div style={{ width: 10, height: 2, background: C.border }} />
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 4px", minWidth: 45 }}>
                                          <div style={{ fontSize: 9, fontWeight: 800, color: C.navy }}>CK</div>
                                          <div style={{ fontSize: 8, color: C.teal, fontWeight: 600 }}>{stop.ckReturnTime || "—"}</div>
                                          <div style={{ fontSize: 7, color: C.green, fontWeight: 700 }}>RELOAD</div>
                                          <div style={{ fontSize: 8, color: C.teal, fontWeight: 600 }}>{stop.ckDepartTime || "—"}</div>
                                        </div>
                                        <div style={{ width: 10, height: 2, background: C.border }}><div style={{ position: "relative", right: -7, top: -3, width: 0, height: 0, borderLeft: `4px solid ${C.border}`, borderTop: "3px solid transparent", borderBottom: "3px solid transparent" }} /></div>
                                      </div>
                                    ) : (
                                      <div style={{ width: 10, height: 2, background: C.border }} />
                                    )}
                                  </div>
                                );
                              })}
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 6px", minWidth: 50 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: C.navy }}>CK</div>
                                <div style={{ fontSize: 9, color: C.teal, fontWeight: 700 }}>{r.return_time || "—"}</div>
                              </div>
                            </div>
                          )}
                        </div>
                        {r.notes && <div style={{ padding: "0 16px 8px", fontSize: 11, color: C.muted }}>{r.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
