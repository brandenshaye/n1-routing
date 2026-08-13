import { KITCHEN } from "./config.jsx";
import { WEEKDAYS, statusInfo, EMPTY_DAY, fmtWeekLabel, dayDate } from "./scheduleShared.jsx";

// Deliberately minimal per leadership: the distributed schedule is just the
// roster and each person's times per day — no assignments, no hour totals.
const CSS = `
.spv-wrap { color: #0f172a; overflow-wrap: break-word; }
.spv-wrap, .spv-wrap * { box-sizing: border-box; }
.spv-sheet { background: #fff; }
.spv-title { font-size: 18px; font-weight: 800; }
.spv-sub { font-size: 10px; color: #475569; margin-bottom: 2px; }
.spv-banner { font-size: 11px; font-weight: 700; color: #b45309; border: 1px solid #f59e0b; background: #fffbeb; border-radius: 6px; padding: 4px 10px; display: inline-block; margin: 4px 0 8px; }
.spv-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.spv-table th { background: #0f2744; color: #e2e8f0; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .03em; padding: 5px 8px; }
.spv-table td { border-bottom: 1px solid #e2e8f0; padding: 5px 8px; vertical-align: top; }
.spv-table tr { break-inside: avoid; page-break-inside: avoid; }
.spv-name { font-weight: 800; font-size: 11px; white-space: nowrap; }
.spv-title-sm { font-size: 8px; color: #7c3aed; font-weight: 700; }
.spv-time { font-weight: 700; white-space: nowrap; }
.spv-status { font-weight: 800; }
.spv-note { color: #b45309; font-size: 9px; }

@media screen {
  .spv-scr-bg { background: #64748b; min-height: 100vh; padding: 24px 0 60px; }
  .spv-sheet { width: 11in; max-width: 96vw; margin: 0 auto; padding: 0.45in; box-shadow: 0 6px 24px rgba(0,0,0,.25); border-radius: 4px; }
  .spv-bar { position: sticky; top: 0; z-index: 5; background: #0f2744; color: #fff; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 20px; }
}
@media print {
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  #root > div { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  .spv-no-print { display: none !important; }
  .spv-scr-bg { background: #fff !important; padding: 0 !important; margin: 0 !important; }
  .spv-sheet { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0.45in !important; box-shadow: none !important; border-radius: 0 !important; }
  .spv-table thead { display: table-header-group; }
  @page { size: letter landscape; margin: 0; }
}
`;

export default function SchedulePrintView({ week, entries, employees, onClose }) {
  const empById = Object.fromEntries(employees.map(e => [e.id, e]));
  const rows = entries.map(en => ({ en, emp: empById[en.employee_id] })).filter(r => r.emp);
  const btn = { background: "#ffffff20", color: "#fff", border: "1px solid #ffffff40", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" };

  return (
    <div className="spv-wrap">
      <style>{CSS}</style>
      <div className="spv-scr-bg">
        <div className="spv-bar spv-no-print">
          <button onClick={onClose} style={{ ...btn, background: "none" }}>← Back</button>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Print — {fmtWeekLabel(week.week_start)}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Choose "Save as PDF" as the printer for the Slack copy.</div>
          <button onClick={() => window.print()} style={{ ...btn, background: "#0d9488", border: "none", marginLeft: "auto" }}>🖨 Print / Save PDF</button>
        </div>

        <div className="spv-sheet">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="spv-title">Logistics Schedule — {fmtWeekLabel(week.week_start)}</div>
            <div className="spv-sub">{KITCHEN.name}</div>
          </div>
          {week.banner_note && <div className="spv-banner">📣 {week.banner_note}</div>}

          <table className="spv-table">
            <thead>
              <tr>
                <th style={{ width: "15%" }}>Employee</th>
                {WEEKDAYS.map((d, i) => <th key={d.key} style={{ width: "17%" }}>{d.label} {dayDate(week.week_start, i)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ en, emp }, i) => (
                <tr key={en.id} style={{ background: i % 2 === 1 ? "#f8fafc" : "#fff" }}>
                  <td>
                    <div className="spv-name">{emp.name}</div>
                    {emp.title && <div className="spv-title-sm">{emp.title}</div>}
                  </td>
                  {WEEKDAYS.map(d => {
                    const day = { ...EMPTY_DAY, ...(en.days?.[d.key] || {}) };
                    const si = statusInfo(day.status);
                    if (day.status !== "scheduled") {
                      return <td key={d.key}><span className="spv-status" style={{ color: si.color }}>{si.label}</span></td>;
                    }
                    return (
                      <td key={d.key}>
                        <div className="spv-time">{day.in || "—"} – {day.out || "—"}</div>
                        {day.note && <div className="spv-note">• {day.note}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
