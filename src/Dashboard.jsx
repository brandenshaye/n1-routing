import { useState, useEffect } from "react";
import { C, KITCHEN, fetchRoutesFromDB } from "./config.jsx";

export default function Dashboard({ schools, onNavigate }) {
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    fetchRoutesFromDB().then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setRoutes(data);
      } else {
        try { setRoutes(JSON.parse(localStorage.getItem("n1_routes_backup") || "[]")); } catch { setRoutes([]); }
      }
    }).catch(() => {
      try { setRoutes(JSON.parse(localStorage.getItem("n1_routes_backup") || "[]")); } catch { setRoutes([]); }
    });
  }, []);

  const served = schools.filter(s => s.service_windows?.some(w => w.delivery_type === "served")).length;
  const drop = schools.filter(s => s.service_windows?.every(w => w.delivery_type === "drop")).length;
  const totalW = schools.reduce((a, s) => a + (s.service_windows?.length || 0), 0);

  const totalRoutes = routes.length;
  const totalStops = routes.reduce((a, r) => a + (r.stops?.length || 0), 0);

  const drivers = routes.filter(r => r.driver_name).length;
  const serverNames = new Set();
  routes.forEach(r => {
    if (r.server_names) r.server_names.split(",").forEach(s => { if (s.trim()) serverNames.add(s.trim()); });
  });
  const totalPersonnel = drivers + serverNames.size;

  const vanSet = new Set();
  routes.forEach(r => (r.vans || []).forEach(v => { if (v.number) vanSet.add(v.number); }));
  const totalVans = vanSet.size;

  const assignedSchools = new Set();
  routes.forEach(r => r.stops?.forEach(s => assignedSchools.add(s.schoolName)));
  const coveredCount = assignedSchools.size;

  const allServices = [];
  schools.forEach(s => {
    const bk = s.service_windows?.filter(w => w.meal_type === "breakfast") || [];
    const ln = s.service_windows?.filter(w => w.meal_type === "lunch") || [];
    bk.forEach(b => allServices.push(`${s.name}|${b.is_same_day ? "breakfast" : "da_breakfast"}`));
    ln.forEach(() => allServices.push(`${s.name}|lunch`));
  });
  const assignedSvcs = new Set();
  routes.forEach(r => r.stops?.forEach(s => (s.services || []).forEach(svc => assignedSvcs.add(`${s.schoolName}|${svc}`))));

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.navy, marginBottom: 4 }}>N1 Route Optimizer</div>
        <div style={{ fontSize: 14, color: C.muted }}>Phoenix Region · {KITCHEN.address}</div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { l: "Schools", v: schools.length, c: C.navy },
          { l: "Service Windows", v: totalW, c: C.teal },
          { l: "Served Sites", v: served, c: C.amber },
          { l: "Drop Sites", v: drop, c: C.muted },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 22px", minWidth: 120 }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {totalRoutes > 0 && (
        <div style={{ display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
          {[
            { l: "Routes", v: totalRoutes, c: C.navy },
            { l: "Total Stops", v: totalStops, c: C.teal },
            { l: "Drivers", v: drivers, c: "#2563eb" },
            { l: "Servers", v: serverNames.size, c: "#a78bfa" },
            { l: "Total Personnel", v: totalPersonnel, c: "#7c3aed" },
            { l: "Vans", v: totalVans || "—", c: C.amber },
            { l: "Schools Covered", v: coveredCount, c: coveredCount === schools.length ? C.green : C.amber },
            { l: "Services Assigned", v: `${assignedSvcs.size}/${allServices.length}`, c: assignedSvcs.size === allServices.length ? C.green : C.amber },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 22px", minWidth: 120 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          { icon: "🏫", title: "School Profiles", desc: "Edit service windows, setup times, delivery types", page: "profiles" },
          { icon: "🗺️", title: "Route Builder", desc: `Create and manage delivery routes${totalRoutes > 0 ? ` · ${totalRoutes} routes · ${totalPersonnel} personnel` : ""}`, page: "builder" },
        ].map(({ icon, title, desc, page }) => (
          <div key={page} onClick={() => onNavigate(page)} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: "28px 24px", cursor: "pointer", flex: "1 1 300px", minWidth: 280,
          }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.navy, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
