import { useState } from "react";
import { KITCHEN } from "./config.jsx";

// ── Presentational lookups (kept local so print output is self-contained) ──
const RTYPE = { all_day: "All-Day", bkfst_run: "Breakfast Run", lunch_run: "Lunch Run", combo_run: "Combo Run", drop_run: "Drop Run" };
const SVC = {
  breakfast: { label: "BKFST", color: "#b45309" },
  da_breakfast: { label: "DA BKFST", color: "#7c2d12" },
  lunch: { label: "LUNCH", color: "#1d4ed8" },
};
const SERVE = { drop: "Drop", driver_serves: "Driver Serves", dedicated_server: "Dedicated Server", driver_and_server: "Driver + Server" };
const METHOD = { TT: "Time-Temp", C: "Cambro" };

function parseTime(str) {
  if (!str) return null;
  const m = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]); const mn = parseInt(m[2]); const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + mn;
}
function routeDuration(r) {
  const d = parseTime(r.departure_time), rt = parseTime(r.return_time);
  if (d === null || rt === null) return "—";
  const mins = rt - d; if (mins <= 0) return "—";
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function personnel(r) {
  let n = r.driver_name ? 1 : 0;
  if (r.server_names) n += r.server_names.split(",").filter(s => s.trim()).length;
  return n;
}
function vansLabel(r) {
  const vs = (r.vans || []).filter(v => v.number);
  if (!vs.length) return "—";
  return vs.map(v => `#${v.number} ${v.size === "small" ? "SM" : "LG"}`).join(", ");
}
function svc(s) { return SVC[s] || { label: s, color: "#334155" }; }

// ── Print stylesheet (screen preview + print output) ────────────────────────
const PRINT_CSS = `
.rpv-wrap { color: #0f172a; }
.rpv-sheet { background: #fff; }
.rpv-tag { display: inline-block; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 3px; letter-spacing: .02em; }
.rpv-block { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
.rpv-rname { font-size: 16px; font-weight: 800; }
.rpv-meta { font-size: 11px; color: #334155; margin: 4px 0 8px; line-height: 1.5; }
.rpv-meta b { color: #0f172a; }
.rpv-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.rpv-table th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .03em; color: #64748b; border-bottom: 1.5px solid #94a3b8; padding: 3px 6px; }
.rpv-table td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.rpv-ck { font-size: 10px; color: #475569; font-style: italic; padding: 2px 6px 2px 26px; }
.rpv-notes { font-size: 11px; color: #334155; margin-top: 6px; }
.rpv-rules { margin-top: 8px; }
.rpv-rule { border-bottom: 1px solid #94a3b8; height: 0.4in; }
.rpv-rules-label { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin-bottom: 6px; }

/* Driver dossier */
.rpv-dossier h1 { font-size: 22px; font-weight: 800; margin: 0 0 2px; }
.rpv-dossier .sub { font-size: 12px; color: #475569; margin-bottom: 12px; }
.rpv-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 16px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
.rpv-summary .k { font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
.rpv-summary .v { font-size: 13px; font-weight: 700; }
.rpv-h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 3px; margin: 16px 0 10px; }
.rpv-stop { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; }
.rpv-stop-head { font-size: 15px; font-weight: 800; margin-bottom: 2px; }
.rpv-stop-addr { font-size: 11px; color: #475569; margin-bottom: 8px; }
.rpv-kv { font-size: 11px; margin: 2px 0; }
.rpv-kv b { display: inline-block; min-width: 96px; color: #475569; font-weight: 600; }
.rpv-win { border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; margin-top: 6px; font-size: 11px; }
.rpv-win .wt { font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }

@media screen {
  .rpv-scr-bg { background: #64748b; min-height: 100vh; padding: 24px 0 60px; }
  .rpv-sheet { width: 8in; max-width: 94vw; margin: 0 auto; padding: 0.5in; box-shadow: 0 6px 24px rgba(0,0,0,.25); border-radius: 4px; }
  .rpv-bar { position: sticky; top: 0; z-index: 5; background: #0f2744; color: #fff; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 20px; }
}
@media print {
  html, body { background: #fff !important; }
  #root > div { padding: 0 !important; max-width: none !important; }
  .rpv-no-print { display: none !important; }
  .rpv-scr-bg { background: #fff !important; padding: 0 !important; }
  .rpv-sheet { width: auto !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
  .rpv-dossier { page-break-after: always; }
  .rpv-dossier:last-child { page-break-after: auto; }
  @page { size: portrait; margin: 0.5in; }
}
`;

function RuleLines({ count }) {
  return (
    <div className="rpv-rules">
      <div className="rpv-rules-label">Manager Notes</div>
      {Array.from({ length: count }).map((_, i) => <div key={i} className="rpv-rule" />)}
    </div>
  );
}

// ── All-routes portrait summary ─────────────────────────────────────────────
function AllRoutesSheet({ routes, withNotes }) {
  return (
    <div className={withNotes ? "rpv-notes-mode" : ""}>
      <div style={{ marginBottom: 16, borderBottom: "2px solid #0f172a", paddingBottom: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Route Sheet — All Routes</div>
        <div style={{ fontSize: 11, color: "#475569" }}>{KITCHEN.name} · {KITCHEN.address} · {routes.length} routes</div>
      </div>
      {routes.map(r => (
        <div key={r.id} className="rpv-block">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="rpv-rname">{r.name}</div>
            <span className="rpv-tag" style={{ background: "#0f2744", color: "#fff" }}>{RTYPE[r.type] || r.type}{r.method === "C" ? " · Cambro" : ""}</span>
          </div>
          <div className="rpv-meta">
            <b>Driver:</b> {r.driver_name || "—"} &nbsp;·&nbsp; <b>Servers:</b> {r.server_names || "—"} &nbsp;·&nbsp; <b>Vans:</b> {vansLabel(r)}<br />
            <b>CK Depart:</b> {r.departure_time || "—"} &nbsp;·&nbsp; <b>CK Return:</b> {r.return_time || "—"} &nbsp;·&nbsp; <b>Load:</b> {r.loading_time ? `${r.loading_time} min` : "—"} &nbsp;·&nbsp; <b>Duration:</b> {routeDuration(r)} &nbsp;·&nbsp; <b>Crew:</b> {personnel(r)} &nbsp;·&nbsp; <b>Stops:</b> {r.stops?.length || 0}
          </div>
          {(r.stops?.length || 0) > 0 && (
            <table className="rpv-table">
              <thead>
                <tr><th style={{ width: 22 }}>#</th><th>School</th><th>Services</th><th>Service Type</th><th style={{ width: 70 }}>Arrive</th><th style={{ width: 70 }}>Depart</th></tr>
              </thead>
              <tbody>
                {r.stops.map((s, i) => (
                  <RowWithCk key={i} stop={s} idx={i} />
                ))}
              </tbody>
            </table>
          )}
          {r.notes && <div className="rpv-notes"><b>Notes:</b> {r.notes}</div>}
          {withNotes && <RuleLines count={6} />}
        </div>
      ))}
    </div>
  );
}

function RowWithCk({ stop, idx }) {
  return (
    <>
      <tr>
        <td style={{ fontWeight: 700 }}>{idx + 1}</td>
        <td style={{ fontWeight: 700 }}>{stop.schoolName}</td>
        <td>{(stop.services || []).map(s => <span key={s} className="rpv-tag" style={{ color: svc(s).color, border: `1px solid ${svc(s).color}`, marginRight: 4 }}>{svc(s).label}</span>)}</td>
        <td>{SERVE[stop.serveType] || "Drop"}{stop.serverCount > 0 ? ` (${stop.serverCount})` : ""}</td>
        <td>{stop.arriveTime || "—"}</td>
        <td>{stop.departTime || "—"}</td>
      </tr>
      {stop.returnToCK && (
        <tr><td colSpan={6} className="rpv-ck">↩ Return to CK to reload — arrive {stop.ckReturnTime || "—"}, depart {stop.ckDepartTime || "—"}</td></tr>
      )}
    </>
  );
}

// ── Single-route driver dossier (with full school profiles) ─────────────────
function DriverDossier({ route, schools }) {
  return (
    <div className="rpv-dossier">
      <h1>{route.name}</h1>
      <div className="sub">{KITCHEN.name} · Driver Route Sheet</div>

      <div className="rpv-summary">
        <div><div className="k">Driver</div><div className="v">{route.driver_name || "—"}</div></div>
        <div><div className="k">Servers</div><div className="v">{route.server_names || "—"}</div></div>
        <div><div className="k">Vans</div><div className="v">{vansLabel(route)}</div></div>
        <div><div className="k">Type</div><div className="v">{RTYPE[route.type] || route.type}</div></div>
        <div><div className="k">Method</div><div className="v">{METHOD[route.method] || route.method}</div></div>
        <div><div className="k">CK Depart</div><div className="v">{route.departure_time || "—"}</div></div>
        <div><div className="k">CK Return</div><div className="v">{route.return_time || "—"}</div></div>
        <div><div className="k">Load Time</div><div className="v">{route.loading_time ? `${route.loading_time} min` : "—"}</div></div>
      </div>
      {route.notes && <div className="rpv-kv" style={{ marginBottom: 6 }}><b>Route Notes</b> {route.notes}</div>}

      <div className="rpv-h2">Stops ({route.stops?.length || 0})</div>
      {(route.stops || []).map((stop, i) => {
        const school = schools.find(s => s.name === stop.schoolName);
        const wins = school?.service_windows || [];
        return (
          <div key={i} className="rpv-stop">
            <div className="rpv-stop-head">
              {i + 1}. {stop.schoolName}
              &nbsp;{(stop.services || []).map(s => <span key={s} className="rpv-tag" style={{ color: svc(s).color, border: `1px solid ${svc(s).color}`, marginLeft: 4 }}>{svc(s).label}</span>)}
            </div>
            <div className="rpv-stop-addr">{school?.address || "Address not on file"}</div>
            <div className="rpv-kv"><b>This stop</b> {SERVE[stop.serveType] || "Drop"}{stop.serverCount > 0 ? ` · ${stop.serverCount} server(s)` : ""} · Arrive {stop.arriveTime || "—"} · Depart {stop.departTime || "—"}</div>
            {stop.returnToCK && <div className="rpv-kv"><b>CK reload</b> arrive {stop.ckReturnTime || "—"} · depart {stop.ckDepartTime || "—"}</div>}
            <div className="rpv-kv"><b>Access Time</b> {school?.access_time || "—"}</div>
            <div className="rpv-kv"><b>Temp Control</b> {school?.temp_control_pref || "—"}</div>

            {wins.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div className="rpv-kv" style={{ fontWeight: 700 }}>School Service Windows (full profile)</div>
                {wins.map((w, wi) => (
                  <div key={wi} className="rpv-win">
                    <span className="wt" style={{ color: w.meal_type === "lunch" ? "#1d4ed8" : "#b45309" }}>
                      {w.meal_type}{w.service_number ? ` ${w.service_number}` : ""}{w.meal_type === "breakfast" ? (w.is_same_day ? " · Same Day" : " · Day Ahead") : ""}
                    </span>
                    <div>Window {w.window_start || "—"}–{w.window_end || "—"} · {w.delivery_type === "served" ? "Served" : "Drop"}{w.servers_needed > 0 ? ` · ${w.servers_needed} server(s)` : ""}</div>
                    <div style={{ color: "#475569" }}>Setup {w.setup_time_min || 0}m · Unload {w.delivery_time_min || 0}m · Cleanup {w.cleanup_time_min || 0}m</div>
                    {w.er_schedule && <div style={{ color: "#475569" }}>Early Release: {w.er_schedule} · {w.er_window_start || "—"}–{w.er_window_end || "—"}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Container: toolbar + sheet ──────────────────────────────────────────────
export default function RoutePrintView({ routes, schools, mode, routeId, onClose }) {
  const [withNotes, setWithNotes] = useState(false);
  const single = mode === "single";
  const route = single ? routes.find(r => r.id === routeId) : null;

  const btn = { background: "#ffffff20", color: "#fff", border: "1px solid #ffffff40", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" };

  return (
    <div className="rpv-wrap">
      <style>{PRINT_CSS}</style>
      <div className="rpv-scr-bg">
        <div className="rpv-bar rpv-no-print">
          <button onClick={onClose} style={{ ...btn, background: "none" }}>← Back</button>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{single ? `Driver Sheet — ${route?.name || ""}` : "Print / Export — All Routes"}</div>
          {!single && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={withNotes} onChange={e => setWithNotes(e.target.checked)} />
              Add handwritten notes lines (fewer routes per page)
            </label>
          )}
          <button onClick={() => window.print()} style={{ ...btn, background: "#0d9488", border: "none", marginLeft: "auto" }}>🖨 Print</button>
        </div>

        <div className="rpv-sheet">
          {single
            ? (route ? <DriverDossier route={route} schools={schools} /> : <div>Route not found.</div>)
            : (routes.length ? <AllRoutesSheet routes={routes} withNotes={withNotes} /> : <div>No routes to print.</div>)}
        </div>
      </div>
    </div>
  );
}
