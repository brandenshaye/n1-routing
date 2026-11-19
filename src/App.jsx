import { useState, useEffect } from "react";
import { C, fetchSchoolsFromDB } from "./config.jsx";
import { useHashRoute, useLiveTable, useDebouncedCallback, LiveBadge } from "./live.jsx";
import Dashboard from "./Dashboard.jsx";
import SchoolProfiles from "./SchoolProfiles.jsx";
import RouteBuilder from "./RouteBuilder.jsx";
import EmployeeRoster from "./EmployeeRoster.jsx";
import ScheduleBoard from "./ScheduleBoard.jsx";

export default function App() {
  const { page, param, navigate, setParam } = useHashRoute();
  const [schools, setSchools] = useState([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  async function loadSchools() {
    try {
      setSchools(await fetchSchoolsFromDB());
      setDbLoading(false);
    } catch (e) {
      setDbError(e.message);
      setDbLoading(false);
    }
  }

  useEffect(() => { loadSchools(); }, []);

  // Schools and their service windows are shared by several screens — any
  // change from anyone just triggers a refetch.
  const refreshSchools = useDebouncedCallback(loadSchools, 300);
  useLiveTable("routing_schools", refreshSchools, refreshSchools);
  useLiveTable("routing_service_windows", refreshSchools, refreshSchools);

  if (dbLoading) return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: C.bg, minHeight: "100vh", padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 15, color: C.muted }}>Loading school profiles...</div>
    </div>
  );

  if (dbError) return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: C.bg, minHeight: "100vh", padding: 24 }}>
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 20, color: C.red }}>
        Database error: {dbError}
      </div>
    </div>
  );

  const nav = p => navigate(p);
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: C.bg, minHeight: "100vh", padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <style>{`@media print { .live-badge { display: none !important; } }`}</style>
      {page === "dashboard" && <Dashboard schools={schools} onNavigate={nav} />}
      {page === "profiles" && <SchoolProfiles schools={schools} onRefresh={loadSchools} onNavigate={nav} param={param} setParam={setParam} />}
      {page === "builder" && <RouteBuilder schools={schools} onNavigate={nav} param={param} setParam={setParam} />}
      {page === "roster" && <EmployeeRoster onNavigate={nav} param={param} setParam={setParam} />}
      {page === "schedule" && <ScheduleBoard onNavigate={nav} param={param} setParam={setParam} />}
      <LiveBadge />
    </div>
  );
}
