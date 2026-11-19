// ── Live sync, safe saves, and URL-based navigation ─────────
// Shared by every screen so two people can work in the tool at once:
//  - useLiveTable: pushes other people's database changes onto open screens.
//  - useSaver: debounced auto-save that sends ONLY the fields that changed,
//    and remembers which fields are still unsaved so incoming changes never
//    clobber what someone is typing.
//  - useHashRoute: keeps the current screen in the URL so refresh stays put.
import { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from "react";
import { RealtimeClient } from "@supabase/realtime-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.jsx";

// Only Supabase's realtime piece is needed (all reads/writes go through the
// plain fetch calls in config.jsx), which keeps the app bundle small.
const realtime = SUPABASE_URL && SUPABASE_ANON_KEY
  ? new RealtimeClient(`${SUPABASE_URL.replace(/^http/, "ws")}/realtime/v1`, { params: { apikey: SUPABASE_ANON_KEY } })
  : null;
realtime?.setAuth(SUPABASE_ANON_KEY).catch(e => console.warn("Realtime auth failed:", e));

// ── Connection status (for the Live badge) ──────────────────
const channelStatus = new Map(); // channel name -> "ok" | "down"
const statusListeners = new Set();
function setChannelStatus(name, s) {
  if (s === null) channelStatus.delete(name); else channelStatus.set(name, s);
  statusListeners.forEach(fn => fn());
}
function liveSnapshot() {
  if (!realtime) return "off";
  if (channelStatus.size === 0) return "idle";
  return [...channelStatus.values()].every(s => s === "ok") ? "live" : "reconnecting";
}
export function useLiveStatus() {
  return useSyncExternalStore(fn => { statusListeners.add(fn); return () => statusListeners.delete(fn); }, liveSnapshot);
}

export function LiveBadge() {
  const status = useLiveStatus();
  if (status === "off" || status === "idle") return null;
  const live = status === "live";
  return (
    <div className="live-badge" title={live ? "Changes from other people appear automatically" : "Lost connection — reconnecting. Changes still save."}
      style={{ position: "fixed", right: 14, bottom: 14, zIndex: 50, display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${live ? "#16a34a50" : "#f59e0b80"}`, borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: live ? "#16a34a" : "#b45309", boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: live ? "#16a34a" : "#f59e0b" }} />
      {live ? "Live" : "Reconnecting…"}
    </div>
  );
}

// ── Realtime subscription ───────────────────────────────────
// onChange({ eventType: "INSERT"|"UPDATE"|"DELETE", new, old }) for every change
// to `table`. onResync() runs after a dropped connection comes back (laptop
// sleep, wifi blip) so the screen can refetch anything it missed.
let channelSeq = 0;
export function useLiveTable(table, onChange, onResync) {
  const changeRef = useRef(onChange);
  const resyncRef = useRef(onResync);
  changeRef.current = onChange;
  resyncRef.current = onResync;

  useEffect(() => {
    if (!realtime) return;
    const name = `live-${table}-${++channelSeq}`;
    let subscribedOnce = false;
    let closed = false; // ignore the CLOSED status our own cleanup triggers
    const channel = realtime.channel(name)
      .on("postgres_changes", { event: "*", schema: "public", table }, payload => { if (!closed) changeRef.current?.(payload); })
      .subscribe(status => {
        if (closed) return;
        if (status === "SUBSCRIBED") {
          setChannelStatus(name, "ok");
          if (subscribedOnce) resyncRef.current?.();
          subscribedOnce = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setChannelStatus(name, "down");
        }
      });
    return () => { closed = true; setChannelStatus(name, null); realtime.removeChannel(channel); };
  }, [table]);
}

// Calls fn at most once per `ms` burst — for "something changed, refetch".
export function useDebouncedCallback(fn, ms = 300) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(), ms);
  }, [ms]);
}

// ── Path helpers ("days.tue.in" style) ──────────────────────
function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  const root = { ...(obj || {}) };
  let cur = root;
  keys.slice(0, -1).forEach(k => { cur[k] = { ...(cur[k] || {}) }; cur = cur[k]; });
  cur[keys[keys.length - 1]] = value;
  return root;
}

// Take the incoming row, but keep this screen's value for every field that
// still has an unsaved (pending or in-flight) local edit.
export function mergeRemote(local, remote, dirtyPaths) {
  if (!local || !dirtyPaths || dirtyPaths.size === 0) return remote;
  let out = remote;
  dirtyPaths.forEach(p => { out = setPath(out, p, getPath(local, p)); });
  return out;
}

// Insert-or-merge rows by id (dedupes our own inserts echoed back by realtime).
export function upsertRows(prev, rows, dirtyFor) {
  const byId = new Map(prev.map(r => [r.id, r]));
  const out = [...prev];
  rows.forEach(row => {
    if (byId.has(row.id)) {
      const i = out.findIndex(r => r.id === row.id);
      out[i] = mergeRemote(out[i], row, dirtyFor?.(row.id));
    } else out.push(row);
  });
  return out;
}

// ── Debounced field-level saver ─────────────────────────────
// queue(key, { "field": value, "days.tue.in": value }) collects changes per
// record; after `delay` ms of quiet, save(key, patch) is called with just the
// changed paths. dirty(key) lists paths not yet confirmed saved.
export function useSaver(save, { delay = 500, onSuccess, onError } = {}) {
  const saveRef = useRef(save);
  const okRef = useRef(onSuccess);
  const errRef = useRef(onError);
  saveRef.current = save; okRef.current = onSuccess; errRef.current = onError;
  const st = useRef({ pending: new Map(), timers: new Map(), inflight: new Map() });

  const saver = useMemo(() => {
    const { pending, timers, inflight } = st.current;
    function fire(key) {
      clearTimeout(timers.get(key));
      timers.delete(key);
      const patch = pending.get(key);
      pending.delete(key);
      if (!patch) return;
      const paths = new Set(Object.keys(patch));
      if (!inflight.has(key)) inflight.set(key, []);
      inflight.get(key).push(paths);
      Promise.resolve()
        .then(() => saveRef.current(key, patch))
        .then(() => okRef.current?.(), e => { console.error("Save failed — NOT persisted to database:", e); errRef.current?.(e); })
        .finally(() => {
          const list = inflight.get(key) || [];
          const i = list.indexOf(paths);
          if (i >= 0) list.splice(i, 1);
          if (!list.length) inflight.delete(key);
        });
    }
    return {
      queue(key, patch) {
        pending.set(key, { ...(pending.get(key) || {}), ...patch });
        clearTimeout(timers.get(key));
        timers.set(key, setTimeout(() => fire(key), delay));
      },
      flush() { [...pending.keys()].forEach(fire); },
      cancel(key) { clearTimeout(timers.get(key)); timers.delete(key); pending.delete(key); },
      cancelAll() { timers.forEach(t => clearTimeout(t)); timers.clear(); pending.clear(); },
      dirty(key) {
        const out = new Set(Object.keys(pending.get(key) || {}));
        (inflight.get(key) || []).forEach(s => s.forEach(p => out.add(p)));
        return out;
      },
    };
  }, [delay]);

  // Save anything still queued when the screen closes.
  useEffect(() => () => saver.flush(), [saver]);
  return saver;
}

// Turn a flat path patch ({"days.tue.in": v}) into a nested object ({tue: {in: v}})
// under `prefix`.
export function nestPatch(patch, prefix) {
  let out = {};
  Object.entries(patch).forEach(([p, v]) => {
    if (p.startsWith(prefix + ".")) out = setPath(out, p.slice(prefix.length + 1), v);
  });
  return out;
}

// ── URL-based navigation ────────────────────────────────────
// #/schedule/2026-11-16 → { page: "schedule", param: "2026-11-16" }
export const PAGES = ["dashboard", "profiles", "builder", "roster", "schedule"];
function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [page, ...rest] = raw.split("/");
  return PAGES.includes(page)
    ? { page, param: decodeURIComponent(rest.join("/")) }
    : { page: "dashboard", param: "" };
}
function hashFor(page, param) {
  return `#/${page}${param ? "/" + encodeURIComponent(param) : ""}`;
}
export function useHashRoute() {
  const [loc, setLoc] = useState(parseHash);
  useEffect(() => {
    const on = () => setLoc(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // Switching screens adds a history entry (Back button works).
  const navigate = useCallback((page, param = "") => {
    const h = hashFor(page, param);
    if (window.location.hash !== h) window.location.hash = h;
  }, []);
  // What's open within a screen (week, route, school) just updates the URL.
  const setParam = useCallback(param => {
    const { page } = parseHash();
    window.history.replaceState(null, "", hashFor(page, param || ""));
    setLoc({ page, param: param || "" });
  }, []);
  return { ...loc, navigate, setParam };
}
