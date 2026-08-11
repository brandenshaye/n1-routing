import { useState, useEffect } from "react";
import { C } from "./config.jsx";

// ── Constants ────────────────────────────────────────────────
export const WEEKDAYS = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
];

export const DAY_STATUSES = [
  { value: "scheduled", label: "Scheduled", color: C.teal },
  { value: "off", label: "OFF", color: C.muted },
  { value: "on_call", label: "ON CALL", color: C.amber },
  { value: "pto", label: "PTO", color: C.blue },
  { value: "callout", label: "Call-out", color: C.red },
];

export function statusInfo(s) { return DAY_STATUSES.find(x => x.value === s) || DAY_STATUSES[0]; }

export const EMPTY_DAY = {
  status: "scheduled", in: "", out: "", actual_in: "", actual_out: "",
  break_min: 0, assignments: [], note: "",
};

export const ROLE_OPTIONS = ["driver", "server"];

// ── Time helpers ─────────────────────────────────────────────
export function parseTimeStr(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]); const mn = parseInt(m[2]); const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + mn;
}

export function fmtHours(h) {
  if (h === null || h === undefined || isNaN(h)) return "—";
  const r = Math.round(h * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, "");
}

// Paid hours for one day. Breaks of 30+ minutes are unpaid (company rule);
// shorter breaks stay paid, so they are not deducted.
export function dayPaidHours(day) {
  if (!day) return 0;
  if (day.status === "off" || day.status === "pto" || day.status === "callout") return 0;
  const start = parseTimeStr(day.in), end = parseTimeStr(day.out);
  if (start === null || end === null || end <= start) return 0;
  let mins = end - start;
  const br = parseInt(day.break_min) || 0;
  if (br >= 30) mins -= br;
  return Math.max(0, mins) / 60;
}

export function weekHours(days) {
  let total = 0;
  for (const d of WEEKDAYS) total += dayPaidHours(days?.[d.key]);
  return total;
}

export function otHours(total) { return Math.max(0, total - 40); }

// Availability check: returns a warning string or null.
export function availabilityWarning(day, avail) {
  if (!day || day.status !== "scheduled") return null;
  const a = avail || {};
  if (a.available === false) return "scheduled on an unavailable day";
  const start = parseTimeStr(day.in), end = parseTimeStr(day.out);
  const lo = parseTimeStr(a.earliest), hi = parseTimeStr(a.latest);
  if (start !== null && lo !== null && start < lo) return `starts before availability (${a.earliest})`;
  if (end !== null && hi !== null && end > hi) return `ends after availability (${a.latest})`;
  return null;
}

// ── Week date helpers ────────────────────────────────────────
export function fmtWeekLabel(weekStart) {
  // weekStart: "2026-08-10" -> "Week of Aug 10, 2026"
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `Week of ${dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function dayDate(weekStart, idx) {
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(y, m - 1, d + idx);
  return dt.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

export function nextMonday(fromDateStr) {
  // next Monday strictly after the given week_start (or today if none)
  let base;
  if (fromDateStr) {
    const [y, m, d] = fromDateStr.split("-").map(Number);
    base = new Date(y, m - 1, d + 7);
  } else {
    base = new Date();
    const dow = base.getDay();
    const add = dow === 1 ? 0 : (8 - dow) % 7;
    base.setDate(base.getDate() + add);
  }
  const y = base.getFullYear(), mo = String(base.getMonth() + 1).padStart(2, "0"), da = String(base.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

// ── Shared TimeInput (H:MM AM/PM, typo-proof) ────────────────
export function TimeInput({ value, onChange, compact }) {
  const parts = (value || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i) || [];
  const [hrs, setHrs] = useState(parts[1] || "");
  const [mins, setMins] = useState(parts[2] || "");
  const [ampm, setAmpm] = useState((parts[3] || "AM").toUpperCase());

  useEffect(() => {
    const p = (value || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (p) { setHrs(p[1]); setMins(p[2]); setAmpm(p[3].toUpperCase()); }
    else if (!value) { setHrs(""); setMins(""); }
  }, [value]);

  function emit(h, m, ap) { if (h && m) onChange(`${h}:${m} ${ap}`); else if (h) onChange(`${h}:00 ${ap}`); else onChange(""); }
  function handleHrs(e) { let v = e.target.value.replace(/\D/g, "").slice(0, 2); if (parseInt(v) > 12) v = "12"; setHrs(v); emit(v, mins, ampm); }
  function handleMins(e) { let v = e.target.value.replace(/\D/g, "").slice(0, 2); if (parseInt(v) > 59) v = "59"; setMins(v); emit(hrs, v, ampm); }
  function toggleAmPm() { const n = ampm === "AM" ? "PM" : "AM"; setAmpm(n); emit(hrs, mins, n); }

  const w = compact ? 24 : 28;
  const tBox = { border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 4px", fontSize: compact ? 11 : 12, outline: "none", textAlign: "center", width: w };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      <input value={hrs} onChange={handleHrs} style={tBox} placeholder="H" maxLength={2} />
      <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>:</span>
      <input value={mins} onChange={handleMins} style={tBox} placeholder="MM" maxLength={2} />
      <button onClick={toggleAmPm} type="button" style={{ background: ampm === "AM" ? C.amber + "20" : "#2563eb20", color: ampm === "AM" ? C.amber : "#2563eb", border: `1px solid ${ampm === "AM" ? C.amber : "#2563eb"}40`, borderRadius: 4, padding: "3px 5px", fontSize: 9, fontWeight: 800, cursor: "pointer" }}>{ampm}</button>
    </div>
  );
}
