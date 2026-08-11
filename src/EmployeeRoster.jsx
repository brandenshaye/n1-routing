import { useState, useEffect, useRef } from "react";
import { C, TAG, fetchEmployees, createEmployee, updateEmployee, deleteEmployee } from "./config.jsx";
import { WEEKDAYS, ROLE_OPTIONS, TimeInput } from "./scheduleShared.jsx";

export default function EmployeeRoster({ onNavigate }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const saveTimers = useRef(new Map());
  const pendingSaves = useRef(new Map());

  useEffect(() => {
    fetchEmployees().then(data => { setEmployees(data); setLoading(false); })
      .catch(() => { setSaveError(true); setLoading(false); });
  }, []);

  function persist(emp) {
    const id = emp.id;
    clearTimeout(saveTimers.current.get(id));
    pendingSaves.current.set(id, () => updateEmployee(id, {
      name: emp.name, title: emp.title, roles: emp.roles, availability: emp.availability,
      notes: emp.notes, contact: emp.contact, active: emp.active, sort_order: emp.sort_order,
    }));
    saveTimers.current.set(id, setTimeout(() => {
      saveTimers.current.delete(id);
      const fn = pendingSaves.current.get(id);
      pendingSaves.current.delete(id);
      if (fn) fn().then(() => setSaveError(false)).catch(e => { console.error("Employee save failed:", e); setSaveError(true); });
    }, 500));
  }

  function flushSaves() {
    saveTimers.current.forEach(t => clearTimeout(t));
    saveTimers.current.clear();
    const fns = [...pendingSaves.current.values()];
    pendingSaves.current.clear();
    fns.forEach(fn => fn().catch(e => { console.error("Employee save failed:", e); setSaveError(true); }));
  }
  useEffect(() => () => flushSaves(), []);

  function updateLocal(id, updates) {
    setEmployees(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...updates } : e);
      const emp = next.find(e => e.id === id);
      if (emp) persist(emp);
      return next;
    });
  }

  async function addEmployee() {
    try {
      const rows = await createEmployee({ name: "New Employee", title: "", roles: ["driver"], availability: {}, notes: "", contact: "", active: true, sort_order: employees.length });
      const emp = Array.isArray(rows) ? rows[0] : rows;
      setEmployees(prev => [...prev, emp]);
      setExpanded(emp.id);
    } catch (e) { console.error(e); setSaveError(true); }
  }

  async function removeEmployee(emp) {
    if (!confirm(`Permanently delete ${emp.name}? Their past schedule rows are removed too.\n\nTip: use Deactivate instead to keep history.`)) return;
    try { await deleteEmployee(emp.id); setEmployees(prev => prev.filter(e => e.id !== emp.id)); }
    catch (e) { console.error(e); setSaveError(true); }
  }

  function toggleRole(emp, role) {
    const roles = (emp.roles || []).includes(role) ? emp.roles.filter(r => r !== role) : [...(emp.roles || []), role];
    updateLocal(emp.id, { roles });
  }

  function setAvail(emp, dayKey, patch) {
    const availability = { ...(emp.availability || {}) };
    availability[dayKey] = { available: true, earliest: "", latest: "", ...(availability[dayKey] || {}), ...patch };
    updateLocal(emp.id, { availability });
  }

  const active = employees.filter(e => e.active && (!search || e.name.toLowerCase().includes(search.toLowerCase())));
  const inactive = employees.filter(e => !e.active);
  const inp = { border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none" };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: C.muted, fontSize: 15 }}>Loading roster...</div>;

  return (
    <div>
      {saveError && (
        <div style={{ background: "#fef2f2", border: `1px solid ${C.red}`, color: C.red, borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
          ⚠️ Changes are not saving to the server. Please notify an admin.
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => { flushSaves(); onNavigate("dashboard"); }} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.muted }}>←</button>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>Employee Roster</div>
          <div style={{ fontSize: 13, color: C.muted }}>{active.length} active · availability, roles & notes</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, width: 170 }} />
          <button onClick={addEmployee} style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add Employee</button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {active.map(emp => {
          const open = expanded === emp.id;
          const offDays = WEEKDAYS.filter(d => emp.availability?.[d.key]?.available === false).map(d => d.short);
          return (
            <div key={emp.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div onClick={() => setExpanded(open ? null : emp.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer" }}>
                <span style={{ fontWeight: 800, color: C.navy, fontSize: 14, minWidth: 140 }}>{emp.name}</span>
                {emp.title && <TAG color={C.purple}>{emp.title}</TAG>}
                {(emp.roles || []).map(r => <TAG key={r} color={r === "driver" ? C.teal : C.blue}>{r === "driver" ? "Driver" : "Server"}</TAG>)}
                {offDays.length > 0 && <span style={{ fontSize: 11, color: C.muted }}>Off: {offDays.join(", ")}</span>}
                {emp.notes && <span title={emp.notes} style={{ fontSize: 12 }}>📝</span>}
                <span style={{ marginLeft: "auto", color: C.muted, fontSize: 12 }}>{open ? "▲" : "▼"}</span>
              </div>
              {open && (
                <div style={{ padding: "4px 16px 16px", borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, margin: "12px 0" }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Name</div>
                      <input value={emp.name} onChange={e => updateLocal(emp.id, { name: e.target.value })} style={{ ...inp, width: "100%" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Title (optional)</div>
                      <input value={emp.title || ""} onChange={e => updateLocal(emp.id, { title: e.target.value })} style={{ ...inp, width: "100%" }} placeholder="e.g. Logistics Lead" />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Roles</div>
                      <div style={{ display: "flex", gap: 6, paddingTop: 4 }}>
                        {ROLE_OPTIONS.map(r => {
                          const on = (emp.roles || []).includes(r);
                          return <button key={r} onClick={() => toggleRole(emp, r)} style={{ background: on ? (r === "driver" ? C.teal : C.blue) : C.light, color: on ? "#fff" : C.muted, border: `1px solid ${on ? "transparent" : C.border}`, borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{r === "driver" ? "Driver" : "Server"}</button>;
                        })}
                      </div>
                    </div>
                    <div style={{ gridColumn: "1/3" }}>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Notes</div>
                      <input value={emp.notes || ""} onChange={e => updateLocal(emp.id, { notes: e.target.value })} style={{ ...inp, width: "100%" }} placeholder="Anything schedulers should know..." />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>Contact <span style={{ color: C.amber }}>(leadership only — never printed)</span></div>
                      <input value={emp.contact || ""} onChange={e => updateLocal(emp.id, { contact: e.target.value })} style={{ ...inp, width: "100%" }} placeholder="Phone / Slack" />
                    </div>
                  </div>

                  <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Availability (uncheck a day, or set earliest start / latest end)</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {WEEKDAYS.map(d => {
                      const a = emp.availability?.[d.key] || { available: true, earliest: "", latest: "" };
                      return (
                        <div key={d.key} style={{ background: a.available === false ? "#fef2f2" : C.light, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", minWidth: 150 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: C.navy, cursor: "pointer", marginBottom: 6 }}>
                            <input type="checkbox" checked={a.available !== false} onChange={e => setAvail(emp, d.key, { available: e.target.checked })} />
                            {d.label}
                          </label>
                          {a.available !== false && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: C.muted, width: 44 }}>Earliest</span><TimeInput compact value={a.earliest} onChange={v => setAvail(emp, d.key, { earliest: v })} /></div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: C.muted, width: 44 }}>Latest</span><TimeInput compact value={a.latest} onChange={v => setAvail(emp, d.key, { latest: v })} /></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button onClick={() => updateLocal(emp.id, { active: false })} style={{ background: C.light, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: C.muted }}>Deactivate</button>
                    <button onClick={() => removeEmployee(emp)} style={{ background: "#fef2f2", border: `1px solid ${C.red}40`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: C.red }}>Delete permanently</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {inactive.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button onClick={() => setShowInactive(!showInactive)} style={{ background: "none", border: "none", color: C.muted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {showInactive ? "▲" : "▼"} Inactive ({inactive.length})
          </button>
          {showInactive && inactive.map(emp => (
            <div key={emp.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 6, opacity: 0.7 }}>
              <span style={{ fontWeight: 700, color: C.navy, fontSize: 13 }}>{emp.name}</span>
              {emp.title && <TAG color={C.muted}>{emp.title}</TAG>}
              <button onClick={() => updateLocal(emp.id, { active: true })} style={{ marginLeft: "auto", background: C.teal + "18", color: C.teal, border: `1px solid ${C.teal}40`, borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Reactivate</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
