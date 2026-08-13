import { useState, useEffect, useRef, Fragment } from "react";
import {
  C, TAG, fetchEmployees, fetchRoutesFromDB,
  fetchScheduleWeeks, createScheduleWeek, updateScheduleWeek, deleteScheduleWeek,
  fetchScheduleEntries, createScheduleEntries, updateScheduleEntry, deleteScheduleEntry,
} from "./config.jsx";
import {
  WEEKDAYS, DAY_STATUSES, statusInfo, EMPTY_DAY, TimeInput,
  parseTimeStr, fmtHours, dayPaidHours, weekHours, otHours,
  availabilityWarning, fmtWeekLabel, dayDate, nextMonday,
} from "./scheduleShared.jsx";
import SchedulePrintView from "./SchedulePrintView.jsx";

export default function ScheduleBoard({ onNavigate }) {
  const [employees, setEmployees] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [weekId, setWeekId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [selected, setSelected] = useState(null); // { entryId, dayKey }
  const [newWeekOpen, setNewWeekOpen] = useState(false);
  const [newWeekDate, setNewWeekDate] = useState("");
  const [printing, setPrinting] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(null); // fixKey of the issue whose candidate panel is open
  const [convertIdx, setConvertIdx] = useState(null); // index of text chip being converted to a route link
  const saveTimers = useRef(new Map());
  const pendingSaves = useRef(new Map());

  const week = weeks.find(w => w.id === weekId);
  const empById = Object.fromEntries(employees.map(e => [e.id, e]));

  // ── Load ───────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([fetchEmployees(), fetchRoutesFromDB(), fetchScheduleWeeks()])
      .then(([emps, rts, wks]) => {
        setEmployees(emps); setRoutes(rts); setWeeks(wks);
        if (wks.length > 0) setWeekId(wks[0].id);
        setLoading(false);
      })
      .catch(e => { console.error(e); setSaveError(true); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!weekId) { setEntries([]); return; }
    setEntriesLoading(true);
    fetchScheduleEntries(weekId)
      .then(rows => { setEntries(rows); setEntriesLoading(false); })
      .catch(e => { console.error(e); setSaveError(true); setEntriesLoading(false); });
    setSelected(null);
  }, [weekId]);

  // ── Auto-save (per entry, debounced; mirrors RouteBuilder) ─
  function persist(entry) {
    const id = entry.id;
    clearTimeout(saveTimers.current.get(id));
    pendingSaves.current.set(id, () => updateScheduleEntry(id, { days: entry.days, sort_order: entry.sort_order }));
    saveTimers.current.set(id, setTimeout(() => {
      saveTimers.current.delete(id);
      const fn = pendingSaves.current.get(id);
      pendingSaves.current.delete(id);
      if (fn) fn().then(() => setSaveError(false)).catch(e => { console.error("Schedule save failed:", e); setSaveError(true); });
    }, 500));
  }
  function flushSaves() {
    saveTimers.current.forEach(t => clearTimeout(t));
    saveTimers.current.clear();
    const fns = [...pendingSaves.current.values()];
    pendingSaves.current.clear();
    fns.forEach(fn => fn().catch(e => { console.error("Schedule save failed:", e); setSaveError(true); }));
  }
  useEffect(() => () => flushSaves(), []);

  function updateDay(entryId, dayKey, patch) {
    setEntries(prev => {
      const next = prev.map(en => {
        if (en.id !== entryId) return en;
        const days = { ...(en.days || {}) };
        days[dayKey] = { ...EMPTY_DAY, ...(days[dayKey] || {}), ...patch };
        return { ...en, days };
      });
      const en = next.find(x => x.id === entryId);
      if (en) persist(en);
      return next;
    });
  }

  // ── Week creation ──────────────────────────────────────────
  function defaultDays(status) {
    const days = {};
    WEEKDAYS.forEach(d => { days[d.key] = { ...EMPTY_DAY, status: status || "scheduled" }; });
    return days;
  }

  async function makeWeek(source) {
    const week_start = newWeekDate || nextMonday(weeks[0]?.week_start);
    try {
      const created = await createScheduleWeek({ week_start, banner_note: "" });
      const wk = Array.isArray(created) ? created[0] : created;
      const activeEmps = employees.filter(e => e.active);
      let rows = [];

      if (source === "copy" && entries.length > 0) {
        rows = entries.map((en, i) => {
          const days = {};
          WEEKDAYS.forEach(d => {
            const src = en.days?.[d.key] || EMPTY_DAY;
            days[d.key] = { ...EMPTY_DAY, ...src, actual_in: "", actual_out: "", status: src.status === "callout" ? "scheduled" : src.status };
          });
          return { week_id: wk.id, employee_id: en.employee_id, days, sort_order: i };
        });
      } else if (source === "routes") {
        rows = activeEmps.map((emp, i) => {
          const norm = s => (s || "").trim().toLowerCase();
          const drives = routes.filter(r => norm(r.driver_name) === norm(emp.name));
          const serves = routes.filter(r => (r.server_names || "").split(",").some(n => norm(n) === norm(emp.name)));
          const mine = [...drives, ...serves];
          const days = defaultDays();
          if (mine.length > 0) {
            const ins = mine.map(r => parseTimeStr(r.departure_time)).filter(v => v !== null);
            const outs = mine.map(r => parseTimeStr(r.return_time)).filter(v => v !== null);
            const toStr = mins => { let h = Math.floor(mins / 60); const m = String(mins % 60).padStart(2, "0"); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${m} ${ap}`; };
            const inS = ins.length ? toStr(Math.min(...ins)) : "";
            const outS = outs.length ? toStr(Math.max(...outs)) : "";
            const assignments = [
              ...drives.map(r => ({ type: "route", route_id: r.id, label: r.name, role: "driver" })),
              ...serves.map(r => ({ type: "route", route_id: r.id, label: r.name, role: "server" })),
            ];
            WEEKDAYS.forEach(d => { days[d.key] = { ...EMPTY_DAY, in: inS, out: outS, assignments: assignments.map(a => ({ ...a })) }; });
          }
          return { week_id: wk.id, employee_id: emp.id, days, sort_order: i };
        });
      } else {
        rows = activeEmps.map((emp, i) => ({ week_id: wk.id, employee_id: emp.id, days: defaultDays(), sort_order: i }));
      }

      const inserted = rows.length ? await createScheduleEntries(rows) : [];
      setWeeks(prev => [wk, ...prev].sort((a, b) => b.week_start.localeCompare(a.week_start)));
      setWeekId(wk.id);
      setEntries(inserted);
      setNewWeekOpen(false);
      setNewWeekDate("");
    } catch (e) { console.error(e); setSaveError(true); }
  }

  async function removeWeek() {
    if (!week) return;
    if (!confirm(`Delete ${fmtWeekLabel(week.week_start)} entirely? This cannot be undone.`)) return;
    try {
      await deleteScheduleWeek(week.id);
      const rest = weeks.filter(w => w.id !== week.id);
      setWeeks(rest);
      setWeekId(rest[0]?.id || null);
    } catch (e) { console.error(e); setSaveError(true); }
  }

  async function addMissingPeople() {
    const have = new Set(entries.map(en => en.employee_id));
    const missing = employees.filter(e => e.active && !have.has(e.id));
    if (!missing.length || !weekId) return;
    try {
      const inserted = await createScheduleEntries(missing.map((emp, i) => ({ week_id: weekId, employee_id: emp.id, days: defaultDays(), sort_order: entries.length + i })));
      setEntries(prev => [...prev, ...inserted]);
    } catch (e) { console.error(e); setSaveError(true); }
  }

  async function removePerson(entry) {
    const emp = empById[entry.employee_id];
    if (!confirm(`Remove ${emp?.name || "this person"} from this week?`)) return;
    try { await deleteScheduleEntry(entry.id); setEntries(prev => prev.filter(en => en.id !== entry.id)); if (selected?.entryId === entry.id) setSelected(null); }
    catch (e) { console.error(e); setSaveError(true); }
  }

  // ── Derived: warnings, coverage, totals ───────────────────
  const activeRoutes = routes.filter(r => (r.stops?.length || 0) > 0);
  // How many dedicated servers each route needs (from its stops' serve types).
  const routeServerNeed = {};
  activeRoutes.forEach(r => {
    routeServerNeed[r.id] = (r.stops || []).reduce((a, s) =>
      a + (["dedicated_server", "driver_and_server"].includes(s.serveType) ? (parseInt(s.serverCount) || 1) : 0), 0);
  });
  const coverage = WEEKDAYS.map(d => {
    const driversOn = {}; // route_id -> [names] with role driver (or untagged legacy links)
    const serversOn = {}; // route_id -> [names] with role server
    entries.forEach(en => {
      const day = en.days?.[d.key];
      if (!day || day.status === "off" || day.status === "pto" || day.status === "callout") return;
      (day.assignments || []).forEach(a => {
        if (a.type === "route" && a.route_id) {
          const bucket = a.role === "server" ? serversOn : driversOn;
          bucket[a.route_id] = (bucket[a.route_id] || []).concat(empById[en.employee_id]?.name || "?");
        }
      });
    });
    // A route is covered only when a DRIVER is on it; servers don't drive it.
    const uncovered = activeRoutes.filter(r => !driversOn[r.id]);
    const doubles = Object.entries(driversOn).filter(([, names]) => names.length > 1)
      .map(([rid, names]) => ({ route: routes.find(r => r.id === rid), names }));
    // Only warn about missing servers on routes that ARE being driven that day
    // (fully uncovered routes are already reported above).
    // Server counts in Route Builder mean TOTAL people serving including the
    // driver (e.g. Maryvale "Driver + Server" count 2 = Lisa driving+serving
    // plus RV). So a linked driver fills one serving slot on routes where the
    // stop types say the driver serves.
    const serverShort = activeRoutes.filter(r => driversOn[r.id]).map(r => {
      const driverServes = (r.stops || []).some(s => ["driver_serves", "driver_and_server"].includes(s.serveType));
      const have = (serversOn[r.id]?.length || 0) + (driverServes ? driversOn[r.id].length : 0);
      return {
        route: r, need: routeServerNeed[r.id], have,
        schools: (r.stops || []).filter(s => ["dedicated_server", "driver_and_server"].includes(s.serveType)).map(s => s.schoolName),
      };
    }).filter(x => x.need > x.have);
    return { day: d, uncovered, doubles, serverShort };
  });

  const totals = entries.map(en => {
    const total = weekHours(en.days);
    return { entry: en, total, ot: otHours(total) };
  });
  const rosterTotal = totals.reduce((a, t) => a + t.total, 0);
  const rosterOT = totals.reduce((a, t) => a + t.ot, 0);
  const otPeople = totals.filter(t => t.ot > 0);

  // ── "Needs attention" issues: everything that could fall through the cracks
  const issues = [];
  coverage.forEach(cv => {
    if (cv.uncovered.length > 0) issues.push({
      kind: "coverage",
      text: `${cv.day.label}: ${cv.uncovered.length} route${cv.uncovered.length > 1 ? "s" : ""} with no driver — ${cv.uncovered.slice(0, 4).map(r => `${r.name} (${r.stops?.[0]?.schoolName || "no stops"}${(r.stops?.length || 0) > 1 ? "…" : ""})`).join(", ")}${cv.uncovered.length > 4 ? "…" : ""}`,
    });
    cv.serverShort.forEach(ss => issues.push({
      kind: "servers",
      text: `${cv.day.label}: ${ss.route.name} — serving at ${ss.schools.join(", ")} — needs ${ss.need} server${ss.need > 1 ? "s" : ""}, has ${ss.have}`,
      fixKey: `${cv.day.key}|${ss.route.id}`,
      dayKey: cv.day.key,
      routeId: ss.route.id,
    }));
  });
  entries.forEach(en => {
    const emp = empById[en.employee_id];
    if (!emp) return;
    WEEKDAYS.forEach(d => {
      const day = { ...EMPTY_DAY, ...(en.days?.[d.key] || {}) };
      if (day.status !== "scheduled" && day.status !== "on_call") return;
      const target = { entryId: en.id, dayKey: d.key };
      const noTimes = !day.in || !day.out;
      const noAssign = (day.assignments || []).length === 0;
      if (noTimes && noAssign) issues.push({ kind: "empty", text: `${emp.name} — ${d.label}: nothing scheduled yet`, target });
      else if (noAssign) issues.push({ kind: "noassign", text: `${emp.name} — ${d.label}: has times but NO assignment`, target });
      else if (noTimes) issues.push({ kind: "notimes", text: `${emp.name} — ${d.label}: has assignment but missing in/out times`, target });
      const warn = availabilityWarning(day, emp.availability?.[d.key]);
      if (warn) issues.push({ kind: "avail", text: `${emp.name} — ${d.label}: ${warn}`, target });
    });
  });
  const issueCounts = issues.reduce((a, i) => { a[i.kind] = (a[i.kind] || 0) + 1; return a; }, {});
  const ISSUE_LABELS = { coverage: "uncovered routes", servers: "server shortfalls", empty: "empty days", noassign: "missing assignments", notimes: "missing times", avail: "availability conflicts" };

  function printWithCheck() {
    if (issues.length > 0) {
      const summary = Object.entries(issueCounts).map(([k, n]) => `  • ${n} ${ISSUE_LABELS[k]}`).join("\n");
      if (!confirm(`⚠ This schedule still has ${issues.length} open item${issues.length > 1 ? "s" : ""}:\n\n${summary}\n\nPrint anyway?`)) return;
    }
    flushSaves();
    setPrinting(true);
  }

  // Rank routes by how well their stop schools match a free-text assignment.
  function matchRoutes(text, empName) {
    const t = (text || "").toLowerCase();
    const words = t.split(/[^a-z]+/).filter(w => w.length > 3);
    return routes.map(r => {
      let score = 0;
      (r.stops || []).forEach(s => {
        const sn = (s.schoolName || "").toLowerCase();
        if (t.includes(sn) || sn.includes(t)) score += 3;
        words.forEach(w => { if (sn.includes(w)) score += 1; });
      });
      if ((r.driver_name || "").toLowerCase() === (empName || "").toLowerCase()) score += 2;
      return { r, score };
    }).sort((a, b) => b.score - a.score);
  }

  // New route links default to the person's role: server-only people serve,
  // everyone else drives. The chip's 🚚/🍽 icon flips it either way.
  function defaultRole(emp) {
    const roles = emp?.roles || [];
    return roles.includes("server") && !roles.includes("driver") ? "server" : "driver";
  }

  // Schools on a route where the DRIVER also serves (from Route Builder's
  // per-stop serve types) — surfaced as a +🍽 marker on driver chips.
  function driverServeSchools(routeId) {
    const r = routes.find(x => x.id === routeId);
    return (r?.stops || []).filter(s => ["driver_serves", "driver_and_server"].includes(s.serveType)).map(s => s.schoolName);
  }

  // Best-guess people to fill a role on a route that day, ranked by how well
  // their existing text chips match the route's schools. Powers click-to-fix.
  function candidatesFor(dayKey, routeId, role) {
    const r = routes.find(x => x.id === routeId);
    const schoolWords = (r?.stops || []).flatMap(s => (s.schoolName || "").toLowerCase().split(/[^a-z]+/)).filter(w => w.length > 3);
    return entries.map(en => {
      const emp = empById[en.employee_id];
      const day = { ...EMPTY_DAY, ...(en.days?.[dayKey] || {}) };
      if (!emp || ["off", "pto", "callout"].includes(day.status)) return null;
      if ((day.assignments || []).some(a => a.type === "route" && a.route_id === routeId)) return null;
      let score = (emp.roles || []).includes(role) ? 2 : 0;
      let bestChip = -1, bestChipScore = 0;
      (day.assignments || []).forEach((a, idx) => {
        if (a.type !== "text") return;
        const t = a.text.toLowerCase();
        let s = 0;
        schoolWords.forEach(w => { if (t.includes(w)) s += 1; });
        if (role === "server" && /serv/.test(t)) s += 1;
        if (s > bestChipScore) { bestChipScore = s; bestChip = idx; }
      });
      score += bestChipScore * 2;
      return { en, emp, day, score, bestChip: bestChipScore > 0 ? bestChip : -1 };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 5);
  }

  // Link the candidate to the route: replace their matching text chip if one
  // exists (so the duty isn't listed twice), otherwise append the link.
  function applyFix(cand, dayKey, routeId, role) {
    const r = routes.find(x => x.id === routeId);
    const link = { type: "route", route_id: routeId, label: r?.name || "route", role };
    const assignments = (cand.day.assignments || []).map((a, idx) => idx === cand.bestChip ? link : a);
    if (cand.bestChip === -1) assignments.push(link);
    updateDay(cand.en.id, dayKey, { assignments });
  }

  const selEntry = selected ? entries.find(en => en.id === selected.entryId) : null;
  const selDay = selEntry ? { ...EMPTY_DAY, ...(selEntry.days?.[selected.dayKey] || {}) } : null;
  const selEmp = selEntry ? empById[selEntry.employee_id] : null;

  const inp = { border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none" };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: C.muted, fontSize: 15 }}>Loading schedule...</div>;

  if (printing && week) {
    return <SchedulePrintView week={week} entries={entries} employees={employees} routes={routes} onClose={() => setPrinting(false)} />;
  }

  const missingCount = employees.filter(e => e.active && !entries.some(en => en.employee_id === e.id)).length;

  // Day editor panel — rendered as an accordion row directly beneath the
  // clicked employee's row (not below the whole grid, where nobody sees it).
  const dayEditorPanel = selEntry && selDay && (
    <div style={{ background: C.surface, borderTop: `2px solid ${C.teal}`, borderBottom: `2px solid ${C.teal}`, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.navy }}>{selEmp?.name} — {WEEKDAYS.find(d => d.key === selected.dayKey)?.label}</div>
        {availabilityWarning(selDay, selEmp?.availability?.[selected.dayKey]) && (
          <TAG color={C.red}>⚠ {availabilityWarning(selDay, selEmp?.availability?.[selected.dayKey])}</TAG>
        )}
        <button onClick={() => setSelected(null)} style={{ marginLeft: "auto", background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Done</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {DAY_STATUSES.map(s => (
          <button key={s.value} onClick={() => updateDay(selEntry.id, selected.dayKey, { status: s.value })}
            style={{ background: selDay.status === s.value ? s.color : C.light, color: selDay.status === s.value ? "#fff" : C.muted, border: `1px solid ${selDay.status === s.value ? s.color : C.border}`, borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {s.label}
          </button>
        ))}
      </div>

      {selDay.status !== "off" && selDay.status !== "pto" && (
        <>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
            <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Scheduled In</div><TimeInput value={selDay.in} onChange={v => updateDay(selEntry.id, selected.dayKey, { in: v })} /></div>
            <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Scheduled Out</div><TimeInput value={selDay.out} onChange={v => updateDay(selEntry.id, selected.dayKey, { out: v })} /></div>
            <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Break (min)</div>
              <input type="number" min="0" step="5" value={selDay.break_min || 0} onChange={e => updateDay(selEntry.id, selected.dayKey, { break_min: parseInt(e.target.value) || 0 })} style={{ ...inp, width: 70 }} />
              <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{(parseInt(selDay.break_min) || 0) >= 30 ? "unpaid (deducted)" : "paid (not deducted)"}</div>
            </div>
            <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Actual In</div><TimeInput value={selDay.actual_in} onChange={v => updateDay(selEntry.id, selected.dayKey, { actual_in: v })} /></div>
            <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Actual Out</div><TimeInput value={selDay.actual_out} onChange={v => updateDay(selEntry.id, selected.dayKey, { actual_out: v })} /></div>
            <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Day hours</div><div style={{ fontSize: 16, fontWeight: 800, color: C.navy, paddingTop: 3 }}>{fmtHours(dayPaidHours(selDay))}</div></div>
          </div>

          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>Assignments</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {(selDay.assignments || []).map((a, i) => (
              <span key={i} style={(() => { const rc = a.type !== "route" ? null : (a.role === "server" ? C.amber : C.teal); return { display: "inline-flex", alignItems: "center", gap: 5, background: rc ? rc + "15" : C.light, border: `1px solid ${rc ? rc + "50" : C.border}`, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600, color: rc || C.navy }; })()}>
                {a.type === "route" ? (
                  <>
                    <button onClick={() => { const assignments = selDay.assignments.map((x, j) => j === i ? { ...x, role: x.role === "server" ? "driver" : "server" } : x); updateDay(selEntry.id, selected.dayKey, { assignments }); }}
                      title={a.role === "server" ? "Serving on this route — click to switch to Driving" : "Driving this route — click to switch to Serving"}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1 }}>{a.role === "server" ? "🍽" : "🚚"}</button>
                    {a.label || "route"}{a.role === "server" ? " (serve)" : ""}
                    {a.role !== "server" && driverServeSchools(a.route_id).length > 0 && (
                      <span title={`Driver also serves at: ${driverServeSchools(a.route_id).join(", ")}`} style={{ fontSize: 10, cursor: "help" }}>+🍽</span>
                    )}
                  </>
                ) : a.text}
                {a.type === "text" && (
                  <button onClick={() => setConvertIdx(convertIdx === i ? null : i)} title="Convert to a linked route (counts toward coverage)"
                    style={{ background: convertIdx === i ? C.teal : "none", color: convertIdx === i ? "#fff" : C.teal, border: `1px solid ${C.teal}60`, borderRadius: 4, cursor: "pointer", fontWeight: 800, fontSize: 10, padding: "0 4px" }}>⇄</button>
                )}
                <button onClick={() => { setConvertIdx(null); updateDay(selEntry.id, selected.dayKey, { assignments: selDay.assignments.filter((_, j) => j !== i) }); }} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontWeight: 800, fontSize: 11, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
          {convertIdx !== null && selDay.assignments?.[convertIdx]?.type === "text" && (
            <div style={{ background: C.teal + "10", border: `1px solid ${C.teal}40`, borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 5 }}>
                Replace “{selDay.assignments[convertIdx].text}” with a linked route (best matches first):
              </div>
              <select value="" onChange={e => {
                const r = routes.find(x => x.id === e.target.value);
                if (!r) return;
                const assignments = selDay.assignments.map((a, j) => j === convertIdx ? { type: "route", route_id: r.id, label: r.name, role: defaultRole(selEmp) } : a);
                updateDay(selEntry.id, selected.dayKey, { assignments });
                setConvertIdx(null);
              }} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", background: "#fff", width: 340, maxWidth: "100%" }}>
                <option value="">Choose route...</option>
                {matchRoutes(selDay.assignments[convertIdx].text, selEmp?.name).map(({ r, score }) => (
                  <option key={r.id} value={r.id}>
                    {score > 0 ? "★ " : ""}{r.name}{r.driver_name ? ` — ${r.driver_name}` : ""} ({(r.stops || []).map(s => s.schoolName).join(", ").slice(0, 60)})
                  </option>
                ))}
              </select>
              <button onClick={() => setConvertIdx(null)} style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer", marginLeft: 8 }}>Cancel</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value="" onChange={e => {
              const r = routes.find(x => x.id === e.target.value);
              if (r) updateDay(selEntry.id, selected.dayKey, { assignments: [...(selDay.assignments || []), { type: "route", route_id: r.id, label: r.name, role: defaultRole(selEmp) }] });
            }} style={{ ...inp, background: "#fff", width: 200 }}>
              <option value="">+ Link a route...</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}{r.driver_name ? ` (${r.driver_name})` : ""}</option>)}
            </select>
            <AddTextAssignment onAdd={text => updateDay(selEntry.id, selected.dayKey, { assignments: [...(selDay.assignments || []), { type: "text", text }] })} />
            <input value={selDay.note || ""} onChange={e => updateDay(selEntry.id, selected.dayKey, { note: e.target.value })} placeholder="Day note (e.g. AR 12:30-1)..." style={{ ...inp, flex: "1 1 180px" }} />
          </div>
        </>
      )}
    </div>
  );

  return (
    <div>
      {saveError && (
        <div style={{ background: "#fef2f2", border: `1px solid ${C.red}`, color: C.red, borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
          ⚠️ Changes are not saving to the server. Please notify an admin.
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => { flushSaves(); onNavigate("dashboard"); }} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.muted }}>←</button>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>Weekly Schedule</div>
          <div style={{ fontSize: 13, color: C.muted }}>{entries.length} people {week ? `· ${fmtWeekLabel(week.week_start)}` : ""}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={weekId || ""} onChange={e => { flushSaves(); setWeekId(e.target.value); }} style={{ ...inp, background: "#fff", fontWeight: 700 }}>
            {weeks.map(w => <option key={w.id} value={w.id}>{fmtWeekLabel(w.week_start)}</option>)}
            {weeks.length === 0 && <option value="">No weeks yet</option>}
          </select>
          <button onClick={() => { setNewWeekOpen(true); setNewWeekDate(nextMonday(weeks[0]?.week_start)); }} style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ New Week</button>
          {week && <button onClick={printWithCheck} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: C.navy }}>🖨 Print / PDF</button>}
          {week && <button onClick={removeWeek} style={{ background: "#fef2f2", border: `1px solid ${C.red}40`, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: C.red }}>Delete Week</button>}
        </div>
      </div>

      {/* New week modal */}
      {newWeekOpen && (
        <div style={{ background: C.surface, border: `2px solid ${C.teal}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, marginBottom: 10 }}>Create a new week</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: C.muted }}>Week starting (Monday):</span>
            <input type="date" value={newWeekDate} onChange={e => setNewWeekDate(e.target.value)} style={inp} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => makeWeek("copy")} disabled={entries.length === 0} style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: entries.length === 0 ? 0.5 : 1 }}>Copy {week ? fmtWeekLabel(week.week_start) : "current week"}</button>
            <button onClick={() => makeWeek("routes")} style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Generate from routes</button>
            <button onClick={() => makeWeek("blank")} style={{ background: C.light, color: C.navy, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Start blank</button>
            <button onClick={() => setNewWeekOpen(false)} style={{ background: "none", color: C.muted, border: "none", padding: "8px 10px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {week && (
        <>
          {/* Banner note + coverage + OT summary */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <input value={week.banner_note || ""} placeholder="Week note (e.g. END OF YEAR PARTY FRIDAY)..."
              onChange={e => {
                const banner_note = e.target.value;
                setWeeks(prev => prev.map(w => w.id === week.id ? { ...w, banner_note } : w));
                clearTimeout(saveTimers.current.get("banner"));
                saveTimers.current.set("banner", setTimeout(() => updateScheduleWeek(week.id, { banner_note }).catch(() => setSaveError(true)), 600));
              }}
              style={{ ...inp, flex: "1 1 300px", fontWeight: 600, color: C.navy }} />
            {missingCount > 0 && (
              <button onClick={addMissingPeople} style={{ background: C.blue + "15", color: C.blue, border: `1px solid ${C.blue}40`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                + Add {missingCount} missing {missingCount === 1 ? "person" : "people"}
              </button>
            )}
          </div>

          {/* Needs-attention banner */}
          {issues.length === 0 ? (
            <div style={{ background: "#f0fdf4", border: `1px solid ${C.green}`, color: C.green, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
              ✓ Schedule complete — every route covered, everyone has times and an assignment, no availability conflicts.
            </div>
          ) : (
            <div style={{ background: "#fffbeb", border: `1px solid ${C.amber}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
              <div onClick={() => setIssuesOpen(!issuesOpen)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#92400e" }}>⚠ {issues.length} item{issues.length > 1 ? "s" : ""} need attention</span>
                <span style={{ fontSize: 12, color: "#92400e" }}>
                  {Object.entries(issueCounts).map(([k, n]) => `${n} ${ISSUE_LABELS[k]}`).join(" · ")}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#92400e", fontWeight: 700 }}>{issuesOpen ? "▲ hide" : "▼ show"}</span>
              </div>
              {issuesOpen && (
                <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                  {issues.map((iss, i) => (
                    <div key={i}>
                      <div onClick={() => { if (iss.fixKey) setFixOpen(fixOpen === iss.fixKey ? null : iss.fixKey); else if (iss.target) setSelected(iss.target); }}
                        style={{ fontSize: 12, color: "#78350f", padding: "3px 8px", borderRadius: 5, cursor: (iss.target || iss.fixKey) ? "pointer" : "default", background: "#fef3c7" }}
                        onMouseEnter={e => { if (iss.target || iss.fixKey) e.currentTarget.style.background = "#fde68a"; }}
                        onMouseLeave={e => e.currentTarget.style.background = "#fef3c7"}>
                        {iss.text}{iss.fixKey ? <b>{fixOpen === iss.fixKey ? "  ▲" : "  — click to fix ▾"}</b> : iss.target ? " →" : ""}
                      </div>
                      {iss.fixKey && fixOpen === iss.fixKey && (
                        <div style={{ margin: "4px 0 8px 14px", padding: "8px 12px", background: C.surface, border: `1px solid ${C.amber}70`, borderRadius: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 6 }}>Who's serving this route that day? Best guesses first — click Link:</div>
                          {candidatesFor(iss.dayKey, iss.routeId, "server").map(cand => (
                            <div key={cand.en.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0", fontSize: 12 }}>
                              <b style={{ color: C.navy, minWidth: 90 }}>{cand.emp.name}</b>
                              <span style={{ color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {cand.bestChip >= 0
                                  ? `matches their “${cand.day.assignments[cand.bestChip].text}” chip`
                                  : (cand.day.assignments || []).map(a => a.type === "text" ? a.text : a.label).join(", ") || "no assignments yet"}
                              </span>
                              <button onClick={() => applyFix(cand, iss.dayKey, iss.routeId, "server")}
                                style={{ background: C.amber + "20", color: "#92400e", border: `1px solid ${C.amber}`, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>Link 🍽</button>
                            </div>
                          ))}
                          {candidatesFor(iss.dayKey, iss.routeId, "server").length === 0 && (
                            <div style={{ fontSize: 11, color: C.muted }}>Nobody is available that day — everyone is OFF/PTO/called out or already on this route.</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            {/* Coverage per day */}
            <div style={{ flex: "2 1 400px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Route coverage</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {coverage.map(cv => (
                  <div key={cv.day.key} style={{ minWidth: 90 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.navy }}>{cv.day.short}</div>
                    {cv.uncovered.length === 0
                      ? <div style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>✓ covered</div>
                      : <div title={cv.uncovered.map(r => r.name).join(", ")} style={{ fontSize: 11, color: C.red, fontWeight: 700, cursor: "help" }}>{cv.uncovered.length} route{cv.uncovered.length > 1 ? "s" : ""} open</div>}
                    {cv.serverShort.length > 0 && <div title={cv.serverShort.map(s => `${s.route.name} (${s.schools.join(", ")}): needs ${s.need} server(s), has ${s.have}`).join("\n")} style={{ fontSize: 10, color: C.amber, cursor: "help", fontWeight: 700 }}>{cv.serverShort.length} short on servers</div>}
                    {cv.doubles.length > 0 && <div title={cv.doubles.map(x => `${x.route?.name}: ${x.names.join(" + ")}`).join("\n")} style={{ fontSize: 10, color: C.muted, cursor: "help" }}>{cv.doubles.length} dual-driver</div>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>Coverage = a 🚚 driver link on the route. 🍽 server links count toward each route's server needs. Free-text assignments aren't counted.</div>
            </div>
            {/* Roster totals + OT */}
            <div style={{ flex: "1 1 220px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Labor totals (scheduled)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.navy }}>{fmtHours(rosterTotal)} hrs</div>
              <div style={{ fontSize: 12, color: rosterOT > 0 ? C.amber : C.muted, fontWeight: 700 }}>{fmtHours(rosterOT)} OT hrs · {otPeople.length} {otPeople.length === 1 ? "person" : "people"} in OT</div>
              {otPeople.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
                  {otPeople.map(t => <div key={t.entry.id}><b style={{ color: C.navy }}>{empById[t.entry.employee_id]?.name}</b>: 40 reg + <b style={{ color: C.amber }}>{fmtHours(t.ot)} OT</b></div>)}
                </div>
              )}
            </div>
          </div>

          {/* Grid */}
          {entriesLoading ? <div style={{ color: C.muted, padding: 30, textAlign: "center" }}>Loading week...</div> : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
                <thead>
                  <tr style={{ background: C.navy }}>
                    <th style={{ padding: "8px 10px", textAlign: "left", color: "#cbd5e1", fontSize: 10, textTransform: "uppercase", position: "sticky", left: 0, background: C.navy, zIndex: 1 }}>Employee</th>
                    {WEEKDAYS.map((d, i) => <th key={d.key} style={{ padding: "8px 6px", textAlign: "left", color: "#cbd5e1", fontSize: 10, textTransform: "uppercase" }}>{d.short} {dayDate(week.week_start, i)}</th>)}
                    <th style={{ padding: "8px 10px", textAlign: "right", color: "#cbd5e1", fontSize: 10, textTransform: "uppercase" }}>Hrs</th>
                    <th style={{ width: 30 }} />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((en, ri) => {
                    const emp = empById[en.employee_id];
                    if (!emp) return null;
                    const t = totals.find(x => x.entry.id === en.id);
                    return (
                      <Fragment key={en.id}>
                      <tr style={{ borderBottom: `1px solid ${C.border}`, background: ri % 2 === 0 ? C.surface : C.bg }}>
                        <td style={{ padding: "6px 10px", fontWeight: 700, color: C.navy, whiteSpace: "nowrap", position: "sticky", left: 0, background: ri % 2 === 0 ? C.surface : C.bg }}>
                          {emp.name}
                          {emp.title && <div style={{ fontSize: 9, color: C.purple, fontWeight: 600 }}>{emp.title}</div>}
                        </td>
                        {WEEKDAYS.map(d => {
                          const day = { ...EMPTY_DAY, ...(en.days?.[d.key] || {}) };
                          const si = statusInfo(day.status);
                          const warn = availabilityWarning(day, emp.availability?.[d.key]);
                          const isSel = selected?.entryId === en.id && selected?.dayKey === d.key;
                          return (
                            <td key={d.key} onClick={() => { setConvertIdx(null); setSelected(isSel ? null : { entryId: en.id, dayKey: d.key }); }}
                              style={{ padding: "5px 6px", cursor: "pointer", verticalAlign: "top", minWidth: 118, outline: isSel ? `2px solid ${C.teal}` : "none", outlineOffset: -2, borderRadius: isSel ? 6 : 0 }}>
                              {day.status !== "scheduled" ? (
                                <span style={{ fontSize: 10, fontWeight: 800, color: si.color }}>{si.label}</span>
                              ) : (
                                <>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>
                                    {day.in || "—"}–{day.out || "—"}
                                    {warn && <span title={warn} style={{ color: C.red, marginLeft: 3, cursor: "help" }}>⚠</span>}
                                  </div>
                                  {(day.assignments || []).map((a, i) => {
                                    const dss = a.type === "route" && a.role !== "server" ? driverServeSchools(a.route_id) : [];
                                    return (
                                      <div key={i} title={dss.length ? `Driver also serves at: ${dss.join(", ")}` : undefined}
                                        style={{ fontSize: 9, color: a.type === "route" ? (a.role === "server" ? C.amber : C.teal) : C.muted, fontWeight: a.type === "route" ? 700 : 500, lineHeight: 1.4, cursor: dss.length ? "help" : undefined }}>
                                        {a.type === "route" ? `${a.role === "server" ? "🍽 " : ""}${a.label || "route"}${dss.length ? " +🍽" : ""}` : a.text}
                                      </div>
                                    );
                                  })}
                                  {day.actual_in && <div style={{ fontSize: 8, color: C.blue }}>act: {day.actual_in}–{day.actual_out || "?"}</div>}
                                  {day.note && <div style={{ fontSize: 8, color: C.amber }}>• {day.note}</div>}
                                </>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: 800, color: t?.ot > 0 ? C.amber : C.navy }}>{fmtHours(t?.total)}</span>
                          {t?.ot > 0 && <div style={{ fontSize: 9, color: C.amber, fontWeight: 700 }}>{fmtHours(t.ot)} OT</div>}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button onClick={() => removePerson(en)} title="Remove from this week" style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer" }}>✕</button>
                        </td>
                      </tr>
                      {selected?.entryId === en.id && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0 }}>{dayEditorPanel}</td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </>
      )}

      {!week && !newWeekOpen && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 40, textAlign: "center", color: C.muted }}>
          <div style={{ fontSize: 22, marginBottom: 10 }}>No schedule weeks yet</div>
          <div style={{ fontSize: 13 }}>Click <b>+ New Week</b> to create the first one.</div>
        </div>
      )}
    </div>
  );
}

function AddTextAssignment({ onAdd }) {
  const [text, setText] = useState("");
  function add() { const t = text.trim(); if (t) { onAdd(t); setText(""); } }
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="+ Other duty (Kitchen, Garage...)"
        style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", width: 200 }} />
      <button onClick={add} style={{ background: C.light, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: C.navy }}>Add</button>
    </span>
  );
}
