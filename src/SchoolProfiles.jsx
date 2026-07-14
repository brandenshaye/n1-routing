import { useState } from "react";
import { C, TAG, updateSchool, updateServiceWindow, createServiceWindow, deleteServiceWindow, createSchool, deleteSchool } from "./config.jsx";

export default function SchoolProfiles({ schools, onRefresh, onNavigate }) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editSchool, setEditSchool] = useState(null);
  const [editWindows, setEditWindows] = useState([]);

  function openSchool(school) {
    setSelected(school.id);
    setEditSchool({ ...school });
    setEditWindows(school.service_windows?.map(w => ({ ...w })) || []);
  }

  function updateField(f, v) { setEditSchool(prev => ({ ...prev, [f]: v })); }
  function updateWindow(idx, f, v) { setEditWindows(prev => prev.map((w, i) => i === idx ? { ...w, [f]: v } : w)); }
  function addWindow(mt) {
    setEditWindows(prev => [...prev, { _isNew: true, school_id: editSchool.id, meal_type: mt, service_number: prev.filter(w => w.meal_type === mt).length + 1, window_start: "", window_end: "", delivery_type: "drop", servers_needed: 0, setup_time_min: 0, delivery_time_min: 20, cleanup_time_min: 0, is_same_day: false, er_schedule: null, er_window_start: null, er_window_end: null }]);
  }
  function removeWindow(idx) { setEditWindows(prev => prev.filter((_, i) => i !== idx)); }

  async function addNewSchool() {
    try { await createSchool({ name: "New School", address: "", region: "phoenix", access_time: "", temp_control_pref: "auto", active: true }); await onRefresh(); } catch (e) { alert("Failed: " + e.message); }
  }
  async function removeSchool(id, name) {
    if (!confirm(`Delete "${name}" and all its service windows?`)) return;
    try { await deleteSchool(id); setSelected(null); setEditSchool(null); await onRefresh(); } catch (e) { alert("Failed: " + e.message); }
  }
  async function saveSchool() {
    setSaving(true);
    try {
      await updateSchool(editSchool.id, { name: editSchool.name, address: editSchool.address, access_time: editSchool.access_time, temp_control_pref: editSchool.temp_control_pref });
      const orig = schools.find(s => s.id === editSchool.id);
      const editIds = new Set(editWindows.filter(w => !w._isNew).map(w => w.id));
      for (const ow of orig.service_windows) { if (!editIds.has(ow.id)) await deleteServiceWindow(ow.id); }
      for (const w of editWindows) { const { _isNew, id, created_at, ...data } = w; if (_isNew) await createServiceWindow(data); else await updateServiceWindow(id, data); }
      await onRefresh(); setSelected(null);
    } catch (e) { alert("Save failed: " + e.message); } finally { setSaving(false); }
  }

  const filtered = schools.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()));
  const school = editSchool;
  const inp = { border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none", width: "100%" };
  const sel = { ...inp, background: "#fff" };
  const lbl = { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" };

  // Grid view (no school selected)
  if (!selected) return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => onNavigate("dashboard")} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.muted }}>←</button>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>School Profiles</div>
          <div style={{ fontSize: 13, color: C.muted }}>{schools.length} schools · Click any row to edit</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, width: 180 }} />
          <button onClick={addNewSchool} style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add School</button>
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.navy }}>
                {["School", "Address", "Bkfst Type", "Bkfst Start", "Bkfst End", "Bkfst Svc", "Bkfst Servers", "Lunch Start", "Lunch End", "Lunch Svc", "Lunch Servers", "Temp"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#cbd5e1", fontWeight: 600, fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => {
                const bk = s.service_windows?.find(w => w.meal_type === "breakfast");
                const ln = s.service_windows?.find(w => w.meal_type === "lunch");
                return (
                  <tr key={s.id} onClick={() => openSchool(s)} style={{ borderBottom: `1px solid ${C.border}`, background: idx % 2 === 0 ? C.surface : C.bg, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.light} onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? C.surface : C.bg}>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: C.navy, whiteSpace: "nowrap" }}>{s.name}</td>
                    <td style={{ padding: "8px 10px", color: C.muted, fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.address}</td>
                    <td style={{ padding: "8px 10px" }}>{bk ? <TAG color={bk.is_same_day ? C.amber : C.muted}>{bk.is_same_day ? "Same Day" : "Day Ahead"}</TAG> : <span style={{ color: C.muted }}>—</span>}</td>
                    <td style={{ padding: "8px 10px", color: C.navy, fontWeight: 600 }}>{bk?.window_start || "—"}</td>
                    <td style={{ padding: "8px 10px", color: C.navy }}>{bk?.window_end || "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{bk ? <TAG color={bk.delivery_type === "served" ? C.amber : C.muted}>{bk.delivery_type === "served" ? "Served" : "Drop"}</TAG> : "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 600, color: bk?.servers_needed > 0 ? C.navy : C.muted }}>{bk?.servers_needed || "—"}</td>
                    <td style={{ padding: "8px 10px", color: C.navy, fontWeight: 600 }}>{ln?.window_start || "—"}</td>
                    <td style={{ padding: "8px 10px", color: C.navy }}>{ln?.window_end || "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{ln ? <TAG color={ln.delivery_type === "served" ? "#2563eb" : C.muted}>{ln.delivery_type === "served" ? "Served" : "Drop"}</TAG> : "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 600, color: ln?.servers_needed > 0 ? C.navy : C.muted }}>{ln?.servers_needed || "—"}</td>
                    <td style={{ padding: "8px 10px" }}><TAG color={s.temp_control_pref === "cambro" ? C.amber : s.temp_control_pref === "time-temp" ? C.teal : C.muted}>{s.temp_control_pref}</TAG></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Edit view (school selected)
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.muted }}>←</button>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>{school.name}</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => removeSchool(school.id, school.name)} style={{ background: "#fef2f2", border: `1px solid ${C.red}40`, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: C.red }}>Delete</button>
          <button onClick={() => setSelected(null)} style={{ background: C.light, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: C.muted }}>Cancel</button>
          <button onClick={saveSchool} disabled={saving} style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 28 }}>
          <div><label style={lbl}>Name</label><input value={school.name} onChange={e => updateField("name", e.target.value)} style={inp} /></div>
          <div style={{ gridColumn: "2/4" }}><label style={lbl}>Address</label><input value={school.address} onChange={e => updateField("address", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Access Time</label><input value={school.access_time || ""} onChange={e => updateField("access_time", e.target.value)} style={inp} placeholder="7:00 AM" /></div>
          <div><label style={lbl}>Temp Control</label><select value={school.temp_control_pref} onChange={e => updateField("temp_control_pref", e.target.value)} style={sel}><option value="auto">Auto</option><option value="time-temp">Time-Temp</option><option value="cambro">Cambro</option></select></div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>Service Windows</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => addWindow("breakfast")} style={{ background: C.amber + "18", color: C.amber, border: `1px solid ${C.amber}40`, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Breakfast</button>
            <button onClick={() => addWindow("lunch")} style={{ background: "#2563eb18", color: "#2563eb", border: "1px solid #2563eb40", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Lunch</button>
          </div>
        </div>

        {["breakfast", "lunch"].map(mt => {
          const wins = editWindows.map((w, i) => ({ ...w, _idx: i })).filter(w => w.meal_type === mt);
          if (!wins.length) return null;
          const mealColor = mt === "breakfast" ? C.amber : "#2563eb";
          return (
            <div key={mt} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: mealColor, textTransform: "uppercase", marginBottom: 10 }}>{mt === "breakfast" ? "🌅" : "🍽️"} {mt}</div>
              {wins.map(w => (
                <div key={w._idx} style={{ background: C.light, borderRadius: 10, padding: 16, marginBottom: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{mt} {w.service_number} {w._isNew && <span style={{ color: C.teal, fontSize: 10 }}>NEW</span>}</div>
                    <button onClick={() => removeWindow(w._idx)} style={{ background: "none", border: "none", color: C.red, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Remove</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                    <div><label style={lbl}>Service Start</label><input value={w.window_start || ""} onChange={e => updateWindow(w._idx, "window_start", e.target.value)} style={inp} /></div>
                    <div><label style={lbl}>Service End</label><input value={w.window_end || ""} onChange={e => updateWindow(w._idx, "window_end", e.target.value)} style={inp} /></div>
                    <div><label style={lbl}>Delivery Type</label><select value={w.delivery_type} onChange={e => updateWindow(w._idx, "delivery_type", e.target.value)} style={sel}><option value="drop">Drop</option><option value="served">Served</option></select></div>
                    <div><label style={lbl}>Servers</label><input type="number" min="0" value={w.servers_needed} onChange={e => updateWindow(w._idx, "servers_needed", parseInt(e.target.value) || 0)} style={inp} /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                    <div><label style={lbl}>Setup (min)</label><input type="number" min="0" value={w.setup_time_min} onChange={e => updateWindow(w._idx, "setup_time_min", parseInt(e.target.value) || 0)} style={inp} /></div>
                    <div><label style={lbl}>Unload (min)</label><input type="number" min="0" value={w.delivery_time_min} onChange={e => updateWindow(w._idx, "delivery_time_min", parseInt(e.target.value) || 0)} style={inp} /></div>
                    <div><label style={lbl}>Cleanup (min)</label><input type="number" min="0" value={w.cleanup_time_min} onChange={e => updateWindow(w._idx, "cleanup_time_min", parseInt(e.target.value) || 0)} style={inp} /></div>
                    {mt === "breakfast" && <div><label style={lbl}>Same Day?</label><select value={w.is_same_day ? "true" : "false"} onChange={e => updateWindow(w._idx, "is_same_day", e.target.value === "true")} style={sel}><option value="false">Day Ahead</option><option value="true">Same Day</option></select></div>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                    <div><label style={lbl}>ER Schedule</label><input value={w.er_schedule || ""} onChange={e => updateWindow(w._idx, "er_schedule", e.target.value || null)} style={inp} placeholder="Wednesdays" /></div>
                    <div><label style={lbl}>ER Start</label><input value={w.er_window_start || ""} onChange={e => updateWindow(w._idx, "er_window_start", e.target.value || null)} style={inp} /></div>
                    <div><label style={lbl}>ER End</label><input value={w.er_window_end || ""} onChange={e => updateWindow(w._idx, "er_window_end", e.target.value || null)} style={inp} /></div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}