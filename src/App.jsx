import { useState, useEffect } from "react";
import { C, fetchSchoolsFromDB } from "./config.jsx";
import Dashboard from "./Dashboard.jsx";
import SchoolProfiles from "./SchoolProfiles.jsx";
import RouteBuilder from "./RouteBuilder.jsx";

export default function App() {
  const [page, setPage] = useState("dashboard");
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

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: C.bg, minHeight: "100vh", padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {page === "dashboard" && <Dashboard schools={schools} onNavigate={setPage} />}
      {page === "profiles" && <SchoolProfiles schools={schools} onRefresh={loadSchools} onNavigate={setPage} />}
      {page === "builder" && <RouteBuilder schools={schools} onNavigate={setPage} />}
    </div>
  );
}