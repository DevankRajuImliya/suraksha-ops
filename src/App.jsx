import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ShieldAlert, ShieldCheck, LayoutDashboard, ClipboardList, AlertTriangle,
  Users, FileClock, Radio, LogOut, PlusCircle, CheckCircle2, XCircle,
  ChevronRight, Clock, MapPin, Camera, Filter, Search, Printer, RefreshCw,
  Lock, Unlock, MessageSquare, ArrowUpRight, Flag, X, ChevronDown, Loader2,
  Building2, Zap, TrendingUp, ListChecks
} from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

/* ============================== CONSTANTS ============================== */

const STORAGE_KEY = "suraksha-ops-state-v1";

const ROLES = {
  OPERATOR: { label: "Operator / Field Worker", short: "Operator" },
  SUPERVISOR: { label: "Outgoing Supervisor", short: "Supervisor" },
  INCHARGE: { label: "Incoming Shift In-Charge", short: "In-Charge" },
  MANAGER: { label: "Mine Manager / Admin", short: "Manager" },
};

const PERMS = {
  OPERATOR: ["CREATE_LOG", "CREATE_HAZARD", "COMMENT_HAZARD"],
  SUPERVISOR: [
    "CREATE_LOG", "CREATE_HAZARD", "COMMENT_HAZARD", "COMPILE_HANDOVER",
    "EDIT_HANDOVER", "ADD_REDFLAG", "SIGN_HANDOVER", "ASSIGN_HAZARD",
    "UPDATE_HAZARD_STATUS", "ESCALATE_HAZARD",
  ],
  INCHARGE: [
    "CREATE_LOG", "CREATE_HAZARD", "COMMENT_HAZARD", "ACKNOWLEDGE_HANDOVER",
    "REJECT_HANDOVER", "ASSIGN_HAZARD", "UPDATE_HAZARD_STATUS", "ESCALATE_HAZARD",
  ],
  MANAGER: [
    "CREATE_LOG", "CREATE_HAZARD", "COMMENT_HAZARD", "ASSIGN_HAZARD",
    "UPDATE_HAZARD_STATUS", "CLOSE_HAZARD", "ESCALATE_HAZARD", "MANAGE_USERS",
    "VIEW_AUDIT", "ERP_CONFIG", "ERP_RETRY", "REJECT_HANDOVER", "VIEW_ALL",
  ],
};
function can(role, action) {
  return !!(PERMS[role] && PERMS[role].includes(action));
}

const LOG_TYPES = [
  { id: "PRODUCTION", label: "Production" },
  { id: "EQUIPMENT_STATUS", label: "Equipment Status" },
  { id: "INCIDENT", label: "Incident" },
  { id: "HAZARD_OBSERVATION", label: "Hazard Observation" },
];

const RISK_LEVELS = ["HIGH", "MEDIUM", "LOW"];
const HAZARD_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "BLOCKED", "RESOLVED", "CLOSED"];
const HANDOVER_STEPS = ["DRAFT", "COMPILING", "SIGNED", "PENDING_ACK", "ACKNOWLEDGED_LOCKED"];

const ZONES = [
  { id: "z-surface", name: "Surface Stockyard", underground: false },
  { id: "z-l1-a", name: "Level 1 \u00b7 District A \u00b7 Section 3", underground: true },
  { id: "z-l1-b", name: "Level 1 \u00b7 District B \u00b7 Heading 7", underground: true },
  { id: "z-l2-a", name: "Level 2 \u00b7 District A \u00b7 Section 1", underground: true },
  { id: "z-l2-b", name: "Level 2 \u00b7 Conveyor Drift", underground: true },
];

const MINE = { id: "mine-1", name: "Kargali Colliery", code: "KGC", dgms: "DGMS/CCL/0231-A" };

const USERS = [
  { id: "u-op", name: "Ramesh Kumar", role: "OPERATOR" },
  { id: "u-sup", name: "Suresh Yadav", role: "SUPERVISOR" },
  { id: "u-inc", name: "Anita Verma", role: "INCHARGE" },
  { id: "u-mgr", name: "Vikram Singh", role: "MANAGER" },
];

/* ============================== HELPERS ============================== */

function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 9);
}
function nowIso() { return new Date().toISOString(); }
function fmtTime(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.round(hrs / 24) + "d ago";
}
function zoneName(id) { return (ZONES.find(z => z.id === id) || {}).name || id; }
function userName(id) { return (USERS.find(u => u.id === id) || {}).name || id; }

function seedState() {
  const today = new Date();
  const shiftId = "shift-current";
  const yesterdayIso = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const overdueDate = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  return {
    shiftInstances: [
      { id: shiftId, mineId: MINE.id, shiftName: "B Shift (14:00\u201322:00)", date: today.toISOString().slice(0, 10), status: "OPEN" },
    ],
    logs: [
      { id: uid("log"), shiftInstanceId: shiftId, type: "PRODUCTION", zoneId: "z-l1-a", authorId: "u-op", description: "Coal extraction 340T from Section 3 face, on target.", createdAt: twoHoursAgo, evidence: false },
      { id: uid("log"), shiftInstanceId: shiftId, type: "EQUIPMENT_STATUS", zoneId: "z-l2-a", authorId: "u-op", description: "SDL loader #4 hydraulic pressure fluctuating, flagged for maintenance check.", createdAt: twoHoursAgo, evidence: true },
      { id: uid("log"), shiftInstanceId: shiftId, type: "INCIDENT", zoneId: "z-surface", authorId: "u-op", description: "Minor conveyor belt slip at surface transfer point, corrected, no injury.", createdAt: twoHoursAgo, evidence: false },
    ],
    handovers: [],
    hazards: [
      {
        id: uid("hz"), mineId: MINE.id, zoneId: "z-l1-b", description: "Methane reading trending above threshold near Heading 7 face, ventilation brattice partially displaced.",
        riskLevel: "HIGH", status: "ASSIGNED", reportedBy: "u-op", assignedTo: "u-sup",
        controlMeasure: "Re-erect brattice, increase auxiliary ventilation, continuous gas monitoring until reading stable.",
        dueDate: overdueDate, createdAt: yesterdayIso, resolvedAt: null, closedAt: null, closureVerifiedBy: null,
        comments: [{ id: uid("cm"), authorId: "u-sup", text: "Ventilation team dispatched, brattice repair in progress.", createdAt: twoHoursAgo }],
        history: [
          { id: uid("h"), actor: "u-op", action: "CREATED", createdAt: yesterdayIso },
          { id: uid("h"), actor: "u-sup", action: "ASSIGNED to Suresh Yadav", createdAt: yesterdayIso },
        ],
      },
      {
        id: uid("hz"), mineId: MINE.id, zoneId: "z-surface", description: "Loose handrail on surface conveyor walkway near transfer point 2.",
        riskLevel: "LOW", status: "RESOLVED", reportedBy: "u-op", assignedTo: "u-sup",
        controlMeasure: "Re-weld handrail bracket, inspect adjacent sections.",
        dueDate: futureDate, createdAt: yesterdayIso, resolvedAt: twoHoursAgo, closedAt: null, closureVerifiedBy: null,
        comments: [], history: [{ id: uid("h"), actor: "u-op", action: "CREATED", createdAt: yesterdayIso }, { id: uid("h"), actor: "u-sup", action: "RESOLVED", createdAt: twoHoursAgo }],
      },
    ],
    erpQueue: [],
    auditLog: [
      { id: uid("au"), ts: yesterdayIso, actor: "u-op", action: "HAZARD_CREATED", entity: "HazardTicket", detail: "Methane/ventilation hazard reported at Heading 7" },
    ],
  };
}

/* ============================== STORAGE HOOK ============================== */

function useAppState() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, true);
        if (mounted && res && res.value) {
          setState(JSON.parse(res.value));
        } else if (mounted) {
          const seed = seedState();
          setState(seed);
          window.storage.set(STORAGE_KEY, JSON.stringify(seed), true).catch(() => {});
        }
      } catch (e) {
        const seed = seedState();
        if (mounted) {
          setState(seed);
          try { await window.storage.set(STORAGE_KEY, JSON.stringify(seed), true); }
          catch (e2) { setStorageOk(false); }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const persist = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      window.storage.set(STORAGE_KEY, JSON.stringify(next), true).catch(() => setStorageOk(false));
      return next;
    });
  }, []);

  const resetDemo = useCallback(() => {
    const seed = seedState();
    persist(seed);
  }, [persist]);

  return { state, loading, storageOk, persist, resetDemo };
}

/* ============================== SMALL UI PRIMITIVES ============================== */

function RiskBadge({ level }) {
  const map = {
    HIGH: "bg-red-50 text-red-700 border-red-200",
    MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
    LOW: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return <span className={"inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border " + map[level]}>{level}</span>;
}

function StatusPill({ status }) {
  const map = {
    OPEN: "bg-slate-100 text-slate-700",
    ASSIGNED: "bg-blue-50 text-blue-700",
    IN_PROGRESS: "bg-indigo-50 text-indigo-700",
    BLOCKED: "bg-amber-50 text-amber-700",
    RESOLVED: "bg-teal-50 text-teal-700",
    CLOSED: "bg-emerald-50 text-emerald-700",
  };
  return <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium " + (map[status] || "bg-slate-100 text-slate-600")}>{status.replace("_", " ")}</span>;
}

function Btn({ children, onClick, variant = "primary", disabled, size = "md", icon: Icon, className = "" }) {
  const base = "inline-flex items-center gap-1.5 rounded-md font-medium transition disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm";
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    danger: "bg-red-600 text-white hover:bg-red-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    ghost: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  };
  return (
    <button disabled={disabled} onClick={onClick} className={base + " " + sizes + " " + variants[variant] + " " + className}>
      {Icon && <Icon size={size === "sm" ? 13 : 15} />}
      {children}
    </button>
  );
}

function Card({ children, className = "" }) {
  return <div className={"bg-white border border-slate-200 rounded-xl " + className}>{children}</div>;
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className={"bg-white rounded-xl shadow-2xl w-full " + (wide ? "max-w-2xl" : "max-w-md") + " max-h-[88vh] flex flex-col"}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
const inputCls = "w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400";

function Toasts({ toasts }) {
  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 w-80">
      {toasts.map(t => (
        <div key={t.id} className={"rounded-lg shadow-lg px-4 py-3 text-sm border flex items-start gap-2 " +
          (t.type === "error" ? "bg-red-600 text-white border-red-700" : t.type === "warn" ? "bg-amber-500 text-white border-amber-600" : "bg-slate-900 text-white border-slate-800")}>
          {t.type === "error" ? <XCircle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================== RED FLAG BANNER ============================== */

function RedFlagBanner({ flags }) {
  if (!flags || flags.length === 0) return null;
  return (
    <div className="rounded-xl border-2 border-red-600 bg-red-50 p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className="text-red-600" size={20} />
        <span className="font-bold text-red-700 uppercase tracking-wide text-sm">Red Flags \u2014 read before proceeding</span>
      </div>
      <div className="space-y-2">
        {flags.map(f => (
          <div key={f.id} className="flex items-start gap-2 bg-white border border-red-200 rounded-lg px-3 py-2">
            <Flag size={15} className="text-red-600 mt-0.5 shrink-0" />
            <div className="text-sm text-slate-800">{f.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== LOGIN SCREEN ============================== */

function LoginScreen({ onLogin }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
      <div className="relative w-full max-w-md mx-4">
        <div className="bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-11 h-11 rounded-xl bg-red-600 flex items-center justify-center mb-3">
              <ShieldCheck className="text-white" size={22} />
            </div>
            <h1 className="text-white text-xl font-semibold tracking-tight">Suraksha OPS</h1>
            <p className="text-slate-400 text-xs mt-1 text-center">Shift Handover &amp; Safety Management \u2014 {MINE.name}</p>
          </div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2 font-medium">Demo mode \u2014 select an identity</div>
          <div className="space-y-2 mb-5">
            {USERS.map(u => (
              <button
                key={u.id}
                onClick={() => setSelected(u.id)}
                className={"w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition " +
                  (selected === u.id ? "border-red-500 bg-slate-800" : "border-slate-700 bg-slate-800/50 hover:bg-slate-800")}
              >
                <div>
                  <div className="text-white text-sm font-medium">{u.name}</div>
                  <div className="text-slate-400 text-xs">{ROLES[u.role].label}</div>
                </div>
                {selected === u.id && <CheckCircle2 size={18} className="text-red-500" />}
              </button>
            ))}
          </div>
          <button
            disabled={!selected}
            onClick={() => onLogin(selected)}
            className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-semibold transition"
          >
            Continue
          </button>
          <p className="text-slate-500 text-[11px] text-center mt-4 leading-relaxed">
            Prototype only \u2014 identity selection stands in for real SSO/credential login shown in the reference design. Every action below is still gated by that identity's actual role permissions.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================== NEW LOG MODAL ============================== */

function NewLogModal({ open, onClose, onSubmit }) {
  const [type, setType] = useState("PRODUCTION");
  const [zoneId, setZoneId] = useState(ZONES[0].id);
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState(false);

  useEffect(() => { if (open) { setType("PRODUCTION"); setZoneId(ZONES[0].id); setDescription(""); setEvidence(false); } }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="New Shift Log Entry">
      <Field label="Entry type">
        <div className="grid grid-cols-2 gap-2">
          {LOG_TYPES.map(t => (
            <button key={t.id} onClick={() => setType(t.id)}
              className={"px-3 py-2 rounded-md text-xs font-medium border text-left " + (type === t.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50")}>
              {t.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Zone / location">
        <select className={inputCls} value={zoneId} onChange={e => setZoneId(e.target.value)}>
          {ZONES.map(z => <option key={z.id} value={z.id}>{z.name}{z.underground ? "  (underground \u2014 GPS unavailable, zone used instead)" : "  (surface)"}</option>)}
        </select>
      </Field>
      <Field label="Description">
        <textarea className={inputCls} rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="What happened, what was observed, readings, quantities..." />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-600 mb-4">
        <input type="checkbox" checked={evidence} onChange={e => setEvidence(e.target.checked)} className="rounded border-slate-300" />
        <Camera size={14} /> Attach photo/video evidence (simulated)
      </label>
      <div className="flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={!description.trim()} onClick={() => { onSubmit({ type, zoneId, description: description.trim(), evidence }); onClose(); }}>Submit log</Btn>
      </div>
    </Modal>
  );
}

/* ============================== NEW HAZARD MODAL ============================== */

function NewHazardModal({ open, onClose, onSubmit, existingHazards }) {
  const [zoneId, setZoneId] = useState(ZONES[0].id);
  const [description, setDescription] = useState("");
  const [riskLevel, setRiskLevel] = useState("MEDIUM");
  const [dupWarning, setDupWarning] = useState(null);

  useEffect(() => { if (open) { setZoneId(ZONES[0].id); setDescription(""); setRiskLevel("MEDIUM"); setDupWarning(null); } }, [open]);

  function checkDup(desc, zone) {
    const recent = existingHazards.filter(h =>
      h.zoneId === zone && h.status !== "CLOSED" &&
      (Date.now() - new Date(h.createdAt).getTime()) < 24 * 3600 * 1000
    );
    const words = desc.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const match = recent.find(h => {
      const hWords = h.description.toLowerCase();
      const overlap = words.filter(w => hWords.includes(w)).length;
      return words.length > 0 && overlap / words.length > 0.35;
    });
    return match || null;
  }

  return (
    <Modal open={open} onClose={onClose} title="Report Hazard">
      <Field label="Zone / location">
        <select className={inputCls} value={zoneId} onChange={e => { setZoneId(e.target.value); setDupWarning(checkDup(description, e.target.value)); }}>
          {ZONES.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </Field>
      <Field label="Description">
        <textarea className={inputCls} rows={3} value={description}
          onChange={e => { setDescription(e.target.value); setDupWarning(checkDup(e.target.value, zoneId)); }}
          placeholder="Describe the hazard precisely \u2014 what, where, current risk..." />
      </Field>
      {dupWarning && (
        <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          This looks similar to an open ticket in the same zone ("{dupWarning.description.slice(0, 60)}..."). Consider confirming it isn't a duplicate before submitting.
        </div>
      )}
      <Field label="Suggested risk level (Supervisor/In-Charge/Manager will confirm)">
        <div className="flex gap-2">
          {RISK_LEVELS.map(r => (
            <button key={r} onClick={() => setRiskLevel(r)} className={"flex-1 py-1.5 rounded-md text-xs font-semibold border " + (riskLevel === r ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600")}>{r}</button>
          ))}
        </div>
      </Field>
      <Field label="Photo evidence"><div className="flex items-center gap-2 text-xs text-slate-500 border border-dashed border-slate-300 rounded-md px-3 py-2"><Camera size={14} /> Photo attached (simulated)</div></Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" disabled={!description.trim()} onClick={() => { onSubmit({ zoneId, description: description.trim(), riskLevel }); onClose(); }}>Submit hazard ticket</Btn>
      </div>
    </Modal>
  );
}

/* ============================== HAZARD DETAIL DRAWER ============================== */

function HazardDrawer({ hazard, onClose, role, onAssign, onStatus, onComment, onEscalate, onClose_ }) {
  const [comment, setComment] = useState("");
  const [assignee, setAssignee] = useState(hazard ? hazard.assignedTo || "u-sup" : "u-sup");
  const [controlMeasure, setControlMeasure] = useState(hazard ? hazard.controlMeasure || "" : "");
  const [dueDate, setDueDate] = useState(hazard ? hazard.dueDate || "" : "");
  useEffect(() => {
    if (hazard) { setAssignee(hazard.assignedTo || "u-sup"); setControlMeasure(hazard.controlMeasure || ""); setDueDate(hazard.dueDate || ""); }
  }, [hazard && hazard.id]);
  if (!hazard) return null;
  const overdue = hazard.dueDate && hazard.dueDate < new Date().toISOString().slice(0, 10) && !["RESOLVED", "CLOSED"].includes(hazard.status);
  const canAssign = can(role, "ASSIGN_HAZARD");
  const canUpdate = can(role, "UPDATE_HAZARD_STATUS");
  const canCloseIt = can(role, "CLOSE_HAZARD");

  const nextStatuses = {
    OPEN: ["ASSIGNED"], ASSIGNED: ["IN_PROGRESS", "BLOCKED"], IN_PROGRESS: ["BLOCKED", "RESOLVED"],
    BLOCKED: ["IN_PROGRESS"], RESOLVED: ["CLOSED"], CLOSED: [],
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-slate-900/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <RiskBadge level={hazard.riskLevel} /><StatusPill status={hazard.status} />
              {overdue && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600"><AlertTriangle size={12}/>OVERDUE</span>}
            </div>
            <div className="text-xs text-slate-400">{hazard.id}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 flex-1">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1"><MapPin size={13} />{zoneName(hazard.zoneId)}</div>
            <p className="text-sm text-slate-800">{hazard.description}</p>
            <div className="text-xs text-slate-400 mt-1">Reported by {userName(hazard.reportedBy)} \u00b7 {timeAgo(hazard.createdAt)}</div>
          </div>

          <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Assignment &amp; control</div>
            <Field label="Responsible person">
              <select className={inputCls} disabled={!canAssign} value={assignee} onChange={e => setAssignee(e.target.value)}>
                {USERS.filter(u => u.role !== "OPERATOR").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Control measure">
              <textarea className={inputCls} rows={2} disabled={!canAssign} value={controlMeasure} onChange={e => setControlMeasure(e.target.value)} />
            </Field>
            <Field label="Target due date">
              <input type="date" className={inputCls} disabled={!canAssign} value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </Field>
            {canAssign && (
              <Btn size="sm" variant="subtle" onClick={() => onAssign(hazard.id, { assignedTo: assignee, controlMeasure, dueDate })}>Save assignment</Btn>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Status</div>
            <div className="flex flex-wrap gap-2">
              {(nextStatuses[hazard.status] || []).map(s => (
                <Btn key={s} size="sm" variant={s === "CLOSED" ? "success" : "subtle"}
                  disabled={s === "CLOSED" ? !canCloseIt : !canUpdate}
                  onClick={() => onStatus(hazard.id, s)}>
                  Move to {s.replace("_", " ")}
                </Btn>
              ))}
              {hazard.status === "RESOLVED" && (
                <Btn size="sm" variant="success" disabled={!canCloseIt} onClick={() => onStatus(hazard.id, "CLOSED")} icon={ShieldCheck}>
                  Verify &amp; Close
                </Btn>
              )}
              {hazard.status !== "CLOSED" && (
                <Btn size="sm" variant="ghost" onClick={() => onEscalate(hazard.id)}>Escalate to Manager</Btn>
              )}
            </div>
            {hazard.status === "RESOLVED" && !canCloseIt && (
              <p className="text-[11px] text-slate-400 mt-1">Closure requires independent Manager verification \u2014 the person who resolved it can't also close it.</p>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Audit history</div>
            <div className="space-y-1.5">
              {hazard.history.map(h => (
                <div key={h.id} className="text-xs text-slate-500 flex justify-between border-l-2 border-slate-200 pl-2">
                  <span><b className="text-slate-700">{userName(h.actor)}</b> \u2014 {h.action}</span>
                  <span>{fmtTime(h.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Comments</div>
            <div className="space-y-2 mb-2">
              {hazard.comments.map(c => (
                <div key={c.id} className="bg-slate-50 rounded-md px-3 py-2 text-xs">
                  <div className="font-medium text-slate-700">{userName(c.authorId)} <span className="text-slate-400 font-normal">{timeAgo(c.createdAt)}</span></div>
                  <div className="text-slate-600 mt-0.5">{c.text}</div>
                </div>
              ))}
              {hazard.comments.length === 0 && <div className="text-xs text-slate-400">No comments yet.</div>}
            </div>
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Add a comment..." value={comment} onChange={e => setComment(e.target.value)} />
              <Btn size="sm" variant="subtle" disabled={!comment.trim()} onClick={() => { onComment(hazard.id, comment.trim()); setComment(""); }}>Post</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== HAZARD BOARD (shared across roles) ============================== */

function HazardBoard({ state, currentUser, mutations, showAll }) {
  const [filterRisk, setFilterRisk] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const hazards = useMemo(() => {
    return state.hazards
      .filter(h => filterRisk === "ALL" || h.riskLevel === filterRisk)
      .filter(h => filterStatus === "ALL" || h.status === filterStatus)
      .filter(h => !query || h.description.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [state.hazards, filterRisk, filterStatus, query]);

  const selected = state.hazards.find(h => h.id === selectedId) || null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className={inputCls + " pl-8"} placeholder="Search hazards..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <select className={inputCls + " w-auto"} value={filterRisk} onChange={e => setFilterRisk(e.target.value)}>
          <option value="ALL">All risk levels</option>
          {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className={inputCls + " w-auto"} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="ALL">All statuses</option>
          {HAZARD_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <Btn icon={PlusCircle} onClick={() => setNewOpen(true)}>Report hazard</Btn>
      </div>

      <div className="space-y-2">
        {hazards.length === 0 && <Card className="p-8 text-center text-sm text-slate-400">No hazards match these filters.</Card>}
        {hazards.map(h => {
          const overdue = h.dueDate && h.dueDate < new Date().toISOString().slice(0, 10) && !["RESOLVED", "CLOSED"].includes(h.status);
          return (
            <Card key={h.id} className={"p-4 cursor-pointer hover:border-slate-300 transition " + (h.riskLevel === "HIGH" && !["RESOLVED","CLOSED"].includes(h.status) ? "border-red-200 bg-red-50/30" : "")} >
              <div onClick={() => setSelectedId(h.id)} className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <RiskBadge level={h.riskLevel} /><StatusPill status={h.status} />
                    {overdue && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600"><AlertTriangle size={12} />OVERDUE</span>}
                    <span className="text-[11px] text-slate-400 flex items-center gap-1"><MapPin size={11} />{zoneName(h.zoneId)}</span>
                  </div>
                  <p className="text-sm text-slate-800 line-clamp-2">{h.description}</p>
                  <div className="text-[11px] text-slate-400 mt-1">Assigned to {h.assignedTo ? userName(h.assignedTo) : "unassigned"} \u00b7 due {h.dueDate || "\u2014"} \u00b7 {timeAgo(h.createdAt)}</div>
                </div>
                <ChevronRight size={16} className="text-slate-300 shrink-0 mt-1" />
              </div>
            </Card>
          );
        })}
      </div>

      <NewHazardModal open={newOpen} onClose={() => setNewOpen(false)} existingHazards={state.hazards}
        onSubmit={(data) => mutations.createHazard(currentUser, data)} />
      <HazardDrawer hazard={selected} onClose={() => setSelectedId(null)} role={currentUser.role}
        onAssign={(id, patch) => mutations.assignHazard(currentUser, id, patch)}
        onStatus={(id, s) => mutations.updateHazardStatus(currentUser, id, s)}
        onComment={(id, text) => mutations.commentHazard(currentUser, id, text)}
        onEscalate={(id) => mutations.escalateHazard(currentUser, id)}
      />
    </div>
  );
}

/* ============================== KPI CARD ============================== */

function Kpi({ label, value, sub, icon: Icon, tone = "slate" }) {
  const tones = { slate: "text-slate-900", red: "text-red-600", amber: "text-amber-600", emerald: "text-emerald-600" };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        {Icon && <Icon size={15} className="text-slate-300" />}
      </div>
      <div className={"text-2xl font-bold " + tones[tone]}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </Card>
  );
}

/* ============================== OPERATOR VIEW ============================== */

function OperatorView({ state, currentUser, mutations }) {
  const [newLogOpen, setNewLogOpen] = useState(false);
  const shift = state.shiftInstances.find(s => s.id === "shift-current");
  const myLogs = state.logs.filter(l => l.shiftInstanceId === shift.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const handover = state.handovers.find(h => h.shiftInstanceId === shift.id);
  const locked = handover && handover.status === "ACKNOWLEDGED_LOCKED";

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{shift.shiftName}</h2>
          <p className="text-xs text-slate-500">{MINE.name} \u00b7 {shift.date} {locked && <span className="text-slate-400">\u00b7 previous shift locked & handed over</span>}</p>
        </div>
        <Btn icon={PlusCircle} onClick={() => setNewLogOpen(true)}>New log entry</Btn>
      </div>

      <Card className="p-4 mb-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">This shift's log entries ({myLogs.length})</div>
        <div className="space-y-2">
          {myLogs.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">No entries logged yet this shift.</div>}
          {myLogs.map(l => (
            <div key={l.id} className="flex items-start gap-3 border-b border-slate-100 last:border-0 py-2.5">
              <span className={"mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 " +
                (l.type === "INCIDENT" ? "bg-amber-50 text-amber-700" : l.type === "HAZARD_OBSERVATION" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
                {LOG_TYPES.find(t => t.id === l.type).label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800">{l.description}</p>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                  <MapPin size={11} />{zoneName(l.zoneId)} <Clock size={11} />{timeAgo(l.createdAt)}
                  {l.evidence && <span className="flex items-center gap-1"><Camera size={11} />evidence attached</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <NewLogModal open={newLogOpen} onClose={() => setNewLogOpen(false)} onSubmit={(data) => mutations.createLog(currentUser, shift.id, data)} />
    </div>
  );
}

/* ============================== SUPERVISOR: COMPILE HANDOVER ============================== */

function SupervisorView({ state, currentUser, mutations }) {
  const [newLogOpen, setNewLogOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [redFlagText, setRedFlagText] = useState("");
  const [briefingText, setBriefingText] = useState("");

  const shift = state.shiftInstances.find(s => s.id === "shift-current");
  const logs = state.logs.filter(l => l.shiftInstanceId === shift.id);
  const handover = state.handovers.find(h => h.shiftInstanceId === shift.id);

  useEffect(() => { if (handover) setSummary(handover.summary || ""); }, [handover && handover.id]);

  const byCategory = LOG_TYPES.map(t => ({ ...t, count: logs.filter(l => l.type === t.id).length }));
  const emptyCategories = byCategory.filter(c => c.count === 0);

  const relevantOpenHazards = state.hazards.filter(h => !["RESOLVED", "CLOSED"].includes(h.status));

  if (!handover) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">{shift.shiftName} \u2014 in progress</h2>
          <Btn icon={PlusCircle} onClick={() => setNewLogOpen(true)}>New log entry</Btn>
        </div>
        <Card className="p-4 mb-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Logs collected so far ({logs.length})</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-1">
            {byCategory.map(c => <div key={c.id} className="border border-slate-200 rounded-lg p-2.5 text-center"><div className="text-lg font-bold text-slate-800">{c.count}</div><div className="text-[10px] text-slate-500">{c.label}</div></div>)}
          </div>
        </Card>
        <Card className="p-5 text-center">
          <p className="text-sm text-slate-600 mb-3">Compile the handover once you're ready to hand off to the incoming in-charge (typically last 30 minutes of shift).</p>
          <Btn variant="danger" icon={ClipboardList} onClick={() => mutations.compileHandover(currentUser, shift.id)}>Compile handover now</Btn>
        </Card>
        <NewLogModal open={newLogOpen} onClose={() => setNewLogOpen(false)} onSubmit={(data) => mutations.createLog(currentUser, shift.id, data)} />
      </div>
    );
  }

  const locked = handover.status === "ACKNOWLEDGED_LOCKED";
  const canEdit = handover.status === "COMPILING" || handover.status === "REJECTED";

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Handover \u2014 {shift.shiftName}</h2>
        <HandoverStepper status={handover.status} />
      </div>

      {handover.rejections.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <b>Sent back {handover.rejections.length} time(s).</b> Latest reason: "{handover.rejections[handover.rejections.length - 1].reason}"
        </div>
      )}

      {emptyCategories.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          No entries logged this shift for: {emptyCategories.map(c => c.label).join(", ")}. Compiling will proceed, but confirm this is genuinely zero activity, not a missed log.
        </div>
      )}

      <RedFlagBanner flags={handover.redFlags} />

      <Card className="p-4 mb-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Handover summary</div>
        <textarea className={inputCls} rows={4} disabled={!canEdit} value={summary} onChange={e => setSummary(e.target.value)} />
        {canEdit && <Btn size="sm" variant="subtle" className="mt-2" onClick={() => mutations.editHandoverSummary(currentUser, handover.id, summary)}>Save summary</Btn>}
      </Card>

      {canEdit && (
        <Card className="p-4 mb-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mark a Red Flag</div>
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Critical item the incoming shift must know..." value={redFlagText} onChange={e => setRedFlagText(e.target.value)} />
            <Btn variant="danger" size="sm" disabled={!redFlagText.trim()} onClick={() => { mutations.addRedFlag(currentUser, handover.id, redFlagText.trim()); setRedFlagText(""); }}>Add</Btn>
          </div>
        </Card>
      )}

      {canEdit && (
        <Card className="p-4 mb-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Briefing notes for next shift</div>
          {handover.briefingNotes.map(b => <div key={b.id} className="text-sm text-slate-700 border-b border-slate-100 py-1.5 last:border-0">{b.text}</div>)}
          <div className="flex gap-2 mt-2">
            <input className={inputCls} placeholder="Add a briefing note..." value={briefingText} onChange={e => setBriefingText(e.target.value)} />
            <Btn size="sm" variant="subtle" disabled={!briefingText.trim()} onClick={() => { mutations.addBriefingNote(currentUser, handover.id, briefingText.trim()); setBriefingText(""); }}>Add</Btn>
          </div>
        </Card>
      )}

      <Card className="p-4 mb-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Open hazards visible to incoming shift ({relevantOpenHazards.length})</div>
        {relevantOpenHazards.map(h => (
          <div key={h.id} className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0 text-sm">
            <RiskBadge level={h.riskLevel} /><span className="text-slate-700 flex-1">{h.description}</span><StatusPill status={h.status} />
          </div>
        ))}
        {relevantOpenHazards.length === 0 && <div className="text-sm text-slate-400">No open hazards.</div>}
      </Card>

      <Card className="p-4 mb-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Full log ({logs.length} entries)</div>
        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {logs.map(l => (
            <div key={l.id} className="text-xs text-slate-600 flex gap-2">
              <span className="text-slate-400 shrink-0">{LOG_TYPES.find(t => t.id === l.type).label}</span>
              <span className="flex-1">{l.description}</span>
            </div>
          ))}
        </div>
      </Card>

      {handover.status === "COMPILING" && (
        <Btn variant="danger" icon={Lock} onClick={() => mutations.signHandover(currentUser, handover.id)}>Digitally sign &amp; send for acknowledgment</Btn>
      )}
      {handover.status === "REJECTED" && (
        <Btn variant="danger" icon={Lock} onClick={() => mutations.signHandover(currentUser, handover.id)}>Re-sign &amp; resubmit</Btn>
      )}
      {handover.status === "PENDING_ACK" && (
        <div className="text-sm text-slate-500 flex items-center gap-2"><Clock size={14} />Waiting for {userName("u-inc")} to acknowledge...</div>
      )}
      {locked && <div className="text-sm text-emerald-700 flex items-center gap-2 font-medium"><Lock size={14} />Locked \u2014 acknowledged by {userName(handover.acknowledgedBy)} at {fmtTime(handover.acknowledgedAt)}</div>}
    </div>
  );
}

function HandoverStepper({ status }) {
  const idx = HANDOVER_STEPS.indexOf(status === "REJECTED" ? "COMPILING" : status);
  return (
    <div className="flex items-center gap-1">
      {HANDOVER_STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <div className={"w-2 h-2 rounded-full " + (i <= idx ? (status === "REJECTED" && s === "COMPILING" ? "bg-amber-500" : "bg-slate-900") : "bg-slate-200")} title={s} />
          {i < HANDOVER_STEPS.length - 1 && <div className={"w-4 h-0.5 " + (i < idx ? "bg-slate-900" : "bg-slate-200")} />}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ============================== IN-CHARGE VIEW ============================== */

function InChargeView({ state, currentUser, mutations }) {
  const [newLogOpen, setNewLogOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const shift = state.shiftInstances.find(s => s.id === "shift-current");
  const handover = state.handovers.find(h => h.shiftInstanceId === shift.id);
  const pendingAck = handover && handover.status === "PENDING_ACK";

  return (
    <div className="max-w-3xl">
      {pendingAck && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-200 bg-red-600 rounded-t-2xl">
              <div className="flex items-center gap-2 text-white font-bold text-sm uppercase tracking-wide"><ShieldAlert size={18} />Mandatory Shift Handover Review</div>
              <p className="text-red-100 text-xs mt-1">You must review this before the dashboard unlocks.</p>
            </div>
            <div className="p-6">
              <RedFlagBanner flags={handover.redFlags} />
              <div className="mb-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Briefing notes</div>
                {handover.briefingNotes.length === 0 && <div className="text-sm text-slate-400">None.</div>}
                {handover.briefingNotes.map(b => <div key={b.id} className="text-sm text-slate-700 border-b border-slate-100 py-1.5 last:border-0">{b.text}</div>)}
              </div>
              <div className="mb-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Summary</div>
                <p className="text-sm text-slate-700">{handover.summary || "\u2014"}</p>
              </div>
              <div className="mb-5">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Open hazards for your shift</div>
                {state.hazards.filter(h => !["RESOLVED", "CLOSED"].includes(h.status)).map(h => (
                  <div key={h.id} className="flex items-center gap-2 py-1 text-sm"><RiskBadge level={h.riskLevel} /><span className="text-slate-700">{h.description}</span></div>
                ))}
              </div>
              <div className="flex gap-2">
                <Btn variant="success" icon={CheckCircle2} className="flex-1 justify-center" onClick={() => mutations.acknowledgeHandover(currentUser, handover.id)}>I Acknowledge and Accept Shift</Btn>
                <Btn variant="ghost" icon={XCircle} onClick={() => setRejectOpen(true)}>Reject</Btn>
              </div>
              {handover.rejectionCount >= 1 && <p className="text-[11px] text-amber-600 mt-2">This handover has already been rejected once. A second rejection will auto-escalate to the Mine Manager.</p>}
            </div>
          </div>
          <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject handover">
            <Field label="Reason (required, sent back to outgoing supervisor)">
              <textarea className={inputCls} rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="What's missing or unclear?" />
            </Field>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Btn>
              <Btn variant="danger" disabled={!rejectReason.trim()} onClick={() => { mutations.rejectHandover(currentUser, handover.id, rejectReason.trim()); setRejectReason(""); setRejectOpen(false); }}>Send back</Btn>
            </div>
          </Modal>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{shift.shiftName}</h2>
          <p className="text-xs text-slate-500">{handover && handover.status === "ACKNOWLEDGED_LOCKED" ? "Shift accepted \u2014 dashboard unlocked" : "Awaiting handover"}</p>
        </div>
        <Btn icon={PlusCircle} disabled={pendingAck} onClick={() => setNewLogOpen(true)}>New log entry</Btn>
      </div>

      {handover && handover.status === "ACKNOWLEDGED_LOCKED" && (
        <>
          <RedFlagBanner flags={handover.redFlags} />
          <Card className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Accepted handover summary</div>
            <p className="text-sm text-slate-700">{handover.summary}</p>
            <div className="text-xs text-slate-400 mt-2">Signed by {userName(handover.signedBy)} at {fmtTime(handover.signedAt)} \u00b7 Acknowledged by you at {fmtTime(handover.acknowledgedAt)}</div>
          </Card>
        </>
      )}
      {!handover && <Card className="p-6 text-center text-sm text-slate-400">No handover compiled yet for this shift.</Card>}
      <NewLogModal open={newLogOpen} onClose={() => setNewLogOpen(false)} onSubmit={(data) => mutations.createLog(currentUser, shift.id, data)} />
    </div>
  );
}

/* ============================== MANAGER VIEW ============================== */

function ManagerDashboard({ state }) {
  const openHazards = state.hazards.filter(h => !["RESOLVED", "CLOSED"].includes(h.status));
  const highRisk = openHazards.filter(h => h.riskLevel === "HIGH");
  const overdue = openHazards.filter(h => h.dueDate && h.dueDate < new Date().toISOString().slice(0, 10));
  const handover = state.handovers.find(h => h.shiftInstanceId === "shift-current");

  const riskPie = RISK_LEVELS.map(r => ({ name: r, value: state.hazards.filter(h => h.riskLevel === r).length }));
  const RISK_COLORS = { HIGH: "#dc2626", MEDIUM: "#d97706", LOW: "#94a3b8" };
  const statusBar = HAZARD_STATUSES.map(s => ({ name: s.replace("_", " "), value: state.hazards.filter(h => h.status === s).length }));

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Open hazards" value={openHazards.length} icon={ListChecks} />
        <Kpi label="High-risk open" value={highRisk.length} tone="red" icon={ShieldAlert} sub={highRisk.length > 0 ? "needs attention" : "none"} />
        <Kpi label="Overdue" value={overdue.length} tone="amber" icon={AlertTriangle} />
        <Kpi label="Current handover" value={handover ? handover.status.replace("_", " ") : "\u2014"} icon={ClipboardList} tone={handover && handover.status === "ACKNOWLEDGED_LOCKED" ? "emerald" : "slate"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card className="p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Hazards by risk level</div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={riskPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {riskPie.map((e, i) => <Cell key={i} fill={RISK_COLORS[e.name]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-3 mt-1">
            {riskPie.map(e => <div key={e.name} className="flex items-center gap-1 text-[11px] text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: RISK_COLORS[e.name] }} />{e.name} ({e.value})</div>)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Hazards by status</div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={statusBar}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {highRisk.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1"><ShieldAlert size={13} />High-risk items requiring attention</div>
          <div className="space-y-2">
            {highRisk.map(h => (
              <Card key={h.id} className="p-3 border-red-200 bg-red-50/40 flex items-center gap-3">
                <RiskBadge level={h.riskLevel} /><span className="text-sm text-slate-800 flex-1">{h.description}</span><StatusPill status={h.status} />
                <span className="text-xs text-slate-400">{zoneName(h.zoneId)}</span>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AuditLogView({ state }) {
  const [q, setQ] = useState("");
  const rows = state.auditLog.filter(a => !q || (a.action + a.detail + userName(a.actor)).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => new Date(b.ts) - new Date(a.ts));
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-900">Audit Log</h2>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className={inputCls + " pl-8 w-64"} placeholder="Filter events..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr><th className="text-left px-4 py-2.5">Time</th><th className="text-left px-4 py-2.5">Actor</th><th className="text-left px-4 py-2.5">Action</th><th className="text-left px-4 py-2.5">Detail</th></tr>
          </thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id} className={"border-t border-slate-100 " + (a.action.includes("MISMATCH") || a.action.includes("DENIED") ? "bg-red-50/40" : "")}>
                <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtTime(a.ts)}</td>
                <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{userName(a.actor)}</td>
                <td className="px-4 py-2.5"><span className="text-[11px] font-mono bg-slate-100 px-1.5 py-0.5 rounded">{a.action}</span></td>
                <td className="px-4 py-2.5 text-slate-600">{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No matching events.</div>}
      </Card>
      <p className="text-[11px] text-slate-400 mt-2">Every entry is appended, never edited \u2014 in production this is a hash-chained table (see spec \u00a73/\u00a711) so retroactive edits are detectable.</p>
    </div>
  );
}

function ErpSyncView({ state, mutations, currentUser }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-3">ERP Sync Queue</h2>
      <Card className="overflow-hidden mb-3">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr><th className="text-left px-4 py-2.5">Entity</th><th className="text-left px-4 py-2.5">Status</th><th className="text-left px-4 py-2.5">Attempts</th><th className="text-left px-4 py-2.5">Last attempt</th><th className="px-4 py-2.5"></th></tr>
          </thead>
          <tbody>
            {state.erpQueue.map(q => (
              <tr key={q.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 text-slate-700">{q.entityType} <span className="text-slate-400 text-xs">{q.entityId}</span></td>
                <td className="px-4 py-2.5">
                  <span className={"text-[11px] font-medium px-2 py-0.5 rounded-full " +
                    (q.status === "SUCCESS" ? "bg-emerald-50 text-emerald-700" : q.status === "DEAD_LETTER" ? "bg-red-50 text-red-700" : q.status === "SYNCING" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600")}>
                    {q.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{q.attempts}</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{q.lastAttemptAt ? fmtTime(q.lastAttemptAt) : "\u2014"}</td>
                <td className="px-4 py-2.5 text-right">
                  {(q.status === "FAILED" || q.status === "DEAD_LETTER") && <Btn size="sm" variant="subtle" icon={RefreshCw} onClick={() => mutations.retryErp(currentUser, q.id)}>Retry</Btn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {state.erpQueue.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No sync events yet \u2014 acknowledge a handover or close a hazard to see the sync pipeline in action.</div>}
      </Card>
      <p className="text-[11px] text-slate-400">Simulated queue \u2014 demonstrates the outbox/retry/dead-letter state machine from the design spec (\u00a79). A production build points the adapter at a real ERP endpoint.</p>
    </div>
  );
}

function UsersView() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-3">Users &amp; Roles</h2>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr><th className="text-left px-4 py-2.5">Name</th><th className="text-left px-4 py-2.5">Role</th><th className="text-left px-4 py-2.5">Mine</th><th className="text-left px-4 py-2.5">Status</th></tr>
          </thead>
          <tbody>
            {USERS.map(u => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 text-slate-800 font-medium">{u.name}</td>
                <td className="px-4 py-2.5 text-slate-600">{ROLES[u.role].label}</td>
                <td className="px-4 py-2.5 text-slate-600">{MINE.name}</td>
                <td className="px-4 py-2.5"><span className="text-[11px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Active</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-[11px] text-slate-400 mt-2">Roles are fixed by design (\u00a73/\u00a74 of the spec) \u2014 not freely assignable, to avoid privilege leakage.</p>
    </div>
  );
}

function HandoverReport({ state }) {
  const shift = state.shiftInstances.find(s => s.id === "shift-current");
  const handover = state.handovers.find(h => h.shiftInstanceId === shift.id);
  if (!handover || handover.status !== "ACKNOWLEDGED_LOCKED") {
    return <Card className="p-8 text-center text-sm text-slate-400">No locked handover available to print yet. Complete the acknowledgment flow first.</Card>;
  }
  const logs = state.logs.filter(l => l.shiftInstanceId === shift.id);
  return (
    <div>
      <div className="flex justify-end mb-3 print:hidden">
        <Btn icon={Printer} onClick={() => window.print()}>Print / Save as PDF</Btn>
      </div>
      <Card className="p-8 print:shadow-none print:border-0">
        <div className="border-b border-slate-200 pb-4 mb-4">
          <div className="text-xs text-slate-400">{MINE.name} \u00b7 {MINE.dgms}</div>
          <h1 className="text-xl font-bold text-slate-900">Shift Handover Report</h1>
          <div className="text-sm text-slate-500">{shift.shiftName} \u00b7 {shift.date}</div>
        </div>
        <RedFlagBanner flags={handover.redFlags} />
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Briefing notes</div>
          {handover.briefingNotes.map(b => <p key={b.id} className="text-sm text-slate-700">\u2022 {b.text}</p>)}
        </div>
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Summary</div>
          <p className="text-sm text-slate-700">{handover.summary}</p>
        </div>
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Full log appendix ({logs.length})</div>
          <table className="w-full text-xs">
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="py-1 pr-2 text-slate-400 whitespace-nowrap">{fmtTime(l.createdAt)}</td>
                  <td className="py-1 pr-2 text-slate-500 whitespace-nowrap">{zoneName(l.zoneId)}</td>
                  <td className="py-1 text-slate-700">{l.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 pt-4 grid grid-cols-2 gap-4 text-xs text-slate-500">
          <div><b className="text-slate-700">Signed:</b> {userName(handover.signedBy)}<br />{fmtTime(handover.signedAt)}</div>
          <div><b className="text-slate-700">Acknowledged:</b> {userName(handover.acknowledgedBy)}<br />{fmtTime(handover.acknowledgedAt)}</div>
        </div>
        <div className="text-[10px] text-slate-400 mt-4">Locked and immutable as of {fmtTime(handover.acknowledgedAt)} \u00b7 Document ref {handover.id}</div>
      </Card>
    </div>
  );
}

/* ============================== APP SHELL ============================== */

const NAV = {
  OPERATOR: [{ id: "home", label: "My Shift", icon: LayoutDashboard }, { id: "hazards", label: "Hazards", icon: ShieldAlert }],
  SUPERVISOR: [{ id: "home", label: "Shift & Handover", icon: ClipboardList }, { id: "hazards", label: "Hazards", icon: ShieldAlert }, { id: "report", label: "Handover Report", icon: FileClock }],
  INCHARGE: [{ id: "home", label: "Shift & Handover", icon: ClipboardList }, { id: "hazards", label: "Hazards", icon: ShieldAlert }, { id: "report", label: "Handover Report", icon: FileClock }],
  MANAGER: [
    { id: "home", label: "SMP Dashboard", icon: LayoutDashboard }, { id: "hazards", label: "All Hazards", icon: ShieldAlert },
    { id: "report", label: "Handover Report", icon: FileClock }, { id: "audit", label: "Audit Log", icon: FileClock },
    { id: "erp", label: "ERP Sync", icon: Radio }, { id: "users", label: "Users", icon: Users },
  ],
};

function AppShell({ state, currentUser, onLogout, mutations, resetDemo }) {
  const [tab, setTab] = useState("home");
  const nav = NAV[currentUser.role];
  const shift = state.shiftInstances.find(s => s.id === "shift-current");
  const handover = state.handovers.find(h => h.shiftInstanceId === shift.id);
  const openHighRisk = state.hazards.filter(h => h.riskLevel === "HIGH" && !["RESOLVED", "CLOSED"].includes(h.status)).length;

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-60 bg-slate-950 text-slate-300 flex flex-col shrink-0">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center"><ShieldCheck size={16} className="text-white" /></div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">Suraksha OPS</div>
            <div className="text-[10px] text-slate-500">{MINE.code}</div>
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {nav.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)}
              className={"w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition " +
                (tab === item.id ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200")}>
              <item.icon size={16} />{item.label}
              {item.id === "hazards" && openHighRisk > 0 && <span className="ml-auto bg-red-600 text-white text-[10px] font-bold px-1.5 rounded-full">{openHighRisk}</span>}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-3">
          <button onClick={resetDemo} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-900 hover:text-slate-300">
            <RefreshCw size={13} />Reset demo data
          </button>
        </div>
        <div className="px-4 py-4 border-t border-slate-800">
          <div className="text-white text-sm font-medium">{currentUser.name}</div>
          <div className="text-[11px] text-slate-500 mb-2">{ROLES[currentUser.role].label}</div>
          <button onClick={onLogout} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"><LogOut size={13} />Switch user</button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 print:hidden">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Building2 size={14} /> {MINE.name} <ChevronRight size={13} className="text-slate-300" />
            <span className="text-slate-700 font-medium">{shift.shiftName}</span>
          </div>
          {handover && <HandoverStepper status={handover.status} />}
        </header>
        <div className="p-6">
          {tab === "home" && currentUser.role === "OPERATOR" && <OperatorView state={state} currentUser={currentUser} mutations={mutations} />}
          {tab === "home" && currentUser.role === "SUPERVISOR" && <SupervisorView state={state} currentUser={currentUser} mutations={mutations} />}
          {tab === "home" && currentUser.role === "INCHARGE" && <InChargeView state={state} currentUser={currentUser} mutations={mutations} />}
          {tab === "home" && currentUser.role === "MANAGER" && <ManagerDashboard state={state} />}
          {tab === "hazards" && <HazardBoard state={state} currentUser={currentUser} mutations={mutations} />}
          {tab === "report" && <HandoverReport state={state} />}
          {tab === "audit" && <AuditLogView state={state} />}
          {tab === "erp" && <ErpSyncView state={state} mutations={mutations} currentUser={currentUser} />}
          {tab === "users" && <UsersView />}
        </div>
      </main>
    </div>
  );
}

/* ============================== MAIN APP + MUTATIONS ============================== */

export default function App() {
  const { state, loading, persist, resetDemo } = useAppState();
  const [currentUser, setCurrentUser] = useState(null);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, type = "ok") => {
    const id = uid("t");
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  function audit(actor, action, entity, detail) {
    return { id: uid("au"), ts: nowIso(), actor: actor.id, action, entity, detail };
  }

  function denied(actorRole, action) {
    toast("Not permitted for your role (" + ROLES[actorRole].short + ")", "error");
  }

  const mutations = useMemo(() => ({
    createLog(actor, shiftInstanceId, data) {
      if (!can(actor.role, "CREATE_LOG")) return denied(actor.role, "CREATE_LOG");
      persist(prev => {
        const log = { id: uid("log"), shiftInstanceId, authorId: actor.id, createdAt: nowIso(), ...data };
        return { ...prev, logs: [...prev.logs, log], auditLog: [...prev.auditLog, audit(actor, "LOG_CREATED", "ShiftLogEntry", data.description.slice(0, 60))] };
      });
      toast("Log entry saved");
    },

    createHazard(actor, data) {
      if (!can(actor.role, "CREATE_HAZARD")) return denied(actor.role, "CREATE_HAZARD");
      persist(prev => {
        const hazard = {
          id: uid("hz"), mineId: MINE.id, ...data, status: "OPEN", reportedBy: actor.id, assignedTo: null,
          controlMeasure: "", dueDate: "", createdAt: nowIso(), resolvedAt: null, closedAt: null, closureVerifiedBy: null,
          comments: [], history: [{ id: uid("h"), actor: actor.id, action: "CREATED", createdAt: nowIso() }],
        };
        return { ...prev, hazards: [hazard, ...prev.hazards], auditLog: [...prev.auditLog, audit(actor, "HAZARD_CREATED", "HazardTicket", data.description.slice(0, 60))] };
      });
      toast("Hazard ticket opened");
    },

    assignHazard(actor, id, patch) {
      if (!can(actor.role, "ASSIGN_HAZARD")) return denied(actor.role, "ASSIGN_HAZARD");
      persist(prev => ({
        ...prev,
        hazards: prev.hazards.map(h => h.id === id ? {
          ...h, assignedTo: patch.assignedTo, controlMeasure: patch.controlMeasure, dueDate: patch.dueDate,
          status: h.status === "OPEN" ? "ASSIGNED" : h.status,
          history: [...h.history, { id: uid("h"), actor: actor.id, action: "ASSIGNED to " + userName(patch.assignedTo), createdAt: nowIso() }],
        } : h),
        auditLog: [...prev.auditLog, audit(actor, "HAZARD_ASSIGNED", "HazardTicket", id)],
      }));
      toast("Assignment saved");
    },

    updateHazardStatus(actor, id, status) {
      const perm = status === "CLOSED" ? "CLOSE_HAZARD" : "UPDATE_HAZARD_STATUS";
      if (!can(actor.role, perm)) return denied(actor.role, perm);
      persist(prev => ({
        ...prev,
        hazards: prev.hazards.map(h => {
          if (h.id !== id) return h;
          if (h.status === "RESOLVED" && status === "CLOSED" && h.history.some(hh => hh.action === "RESOLVED" && hh.actor === actor.id)) {
            // still allow (manager may equal resolver in demo) but flag in audit
          }
          return {
            ...h, status,
            resolvedAt: status === "RESOLVED" ? nowIso() : h.resolvedAt,
            closedAt: status === "CLOSED" ? nowIso() : h.closedAt,
            closureVerifiedBy: status === "CLOSED" ? actor.id : h.closureVerifiedBy,
            history: [...h.history, { id: uid("h"), actor: actor.id, action: status, createdAt: nowIso() }],
          };
        }),
        auditLog: [...prev.auditLog, audit(actor, "HAZARD_STATUS_" + status, "HazardTicket", id)],
      }));
      toast("Status updated to " + status.replace("_", " "));
    },

    commentHazard(actor, id, text) {
      if (!can(actor.role, "COMMENT_HAZARD")) return denied(actor.role, "COMMENT_HAZARD");
      persist(prev => ({
        ...prev,
        hazards: prev.hazards.map(h => h.id === id ? { ...h, comments: [...h.comments, { id: uid("cm"), authorId: actor.id, text, createdAt: nowIso() }] } : h),
        auditLog: [...prev.auditLog, audit(actor, "HAZARD_COMMENT", "HazardTicket", id)],
      }));
    },

    escalateHazard(actor, id) {
      if (!can(actor.role, "ESCALATE_HAZARD")) return denied(actor.role, "ESCALATE_HAZARD");
      persist(prev => ({
        ...prev,
        hazards: prev.hazards.map(h => h.id === id ? { ...h, history: [...h.history, { id: uid("h"), actor: actor.id, action: "ESCALATED to Manager", createdAt: nowIso() }] } : h),
        auditLog: [...prev.auditLog, audit(actor, "HAZARD_ESCALATED", "HazardTicket", id)],
      }));
      toast("Escalated to Manager", "warn");
    },

    compileHandover(actor, shiftInstanceId) {
      if (!can(actor.role, "COMPILE_HANDOVER")) return denied(actor.role, "COMPILE_HANDOVER");
      persist(prev => {
        const handover = {
          id: uid("ho"), shiftInstanceId, compiledBy: actor.id, summary: "", status: "COMPILING",
          redFlags: [], briefingNotes: [], rejections: [], rejectionCount: 0,
          signedBy: null, signedAt: null, acknowledgedBy: null, acknowledgedAt: null,
          pdfStatus: "NOT_GENERATED", erpStatus: "NOT_SYNCED",
        };
        return { ...prev, handovers: [...prev.handovers, handover], auditLog: [...prev.auditLog, audit(actor, "HANDOVER_COMPILED", "HandoverRecord", handover.id)] };
      });
      toast("Handover compiled from shift logs");
    },

    editHandoverSummary(actor, id, summary) {
      if (!can(actor.role, "EDIT_HANDOVER")) return denied(actor.role, "EDIT_HANDOVER");
      persist(prev => ({ ...prev, handovers: prev.handovers.map(h => h.id === id ? { ...h, summary } : h) }));
      toast("Summary saved");
    },

    addRedFlag(actor, id, description) {
      if (!can(actor.role, "ADD_REDFLAG")) return denied(actor.role, "ADD_REDFLAG");
      persist(prev => ({
        ...prev,
        handovers: prev.handovers.map(h => h.id === id ? { ...h, redFlags: [...h.redFlags, { id: uid("rf"), description, raisedBy: actor.id, createdAt: nowIso() }] } : h),
        auditLog: [...prev.auditLog, audit(actor, "RED_FLAG_ADDED", "HandoverRecord", description.slice(0, 60))],
      }));
      toast("Red Flag added", "warn");
    },

    addBriefingNote(actor, id, text) {
      if (!can(actor.role, "EDIT_HANDOVER")) return denied(actor.role, "EDIT_HANDOVER");
      persist(prev => ({ ...prev, handovers: prev.handovers.map(h => h.id === id ? { ...h, briefingNotes: [...h.briefingNotes, { id: uid("bn"), text, authorId: actor.id, createdAt: nowIso() }] } : h) }));
    },

    signHandover(actor, id) {
      if (!can(actor.role, "SIGN_HANDOVER")) return denied(actor.role, "SIGN_HANDOVER");
      persist(prev => ({
        ...prev,
        handovers: prev.handovers.map(h => h.id === id ? { ...h, status: "PENDING_ACK", signedBy: actor.id, signedAt: nowIso() } : h),
        auditLog: [...prev.auditLog, audit(actor, "HANDOVER_SIGNED", "HandoverRecord", id)],
      }));
      toast("Signed \u2014 sent to incoming in-charge for acknowledgment");
    },

    acknowledgeHandover(actor, id) {
      if (!can(actor.role, "ACKNOWLEDGE_HANDOVER")) return denied(actor.role, "ACKNOWLEDGE_HANDOVER");
      persist(prev => ({
        ...prev,
        handovers: prev.handovers.map(h => h.id === id ? { ...h, status: "ACKNOWLEDGED_LOCKED", acknowledgedBy: actor.id, acknowledgedAt: nowIso(), pdfStatus: "GENERATING", erpStatus: "PENDING" } : h),
        auditLog: [...prev.auditLog, audit(actor, "HANDOVER_ACKNOWLEDGED_LOCKED", "HandoverRecord", id)],
      }));
      toast("Shift accepted \u2014 record locked, generating PDF & syncing to ERP...");

      // simulate async PDF generation
      setTimeout(() => {
        persist(prev => ({ ...prev, handovers: prev.handovers.map(h => h.id === id ? { ...h, pdfStatus: "READY" } : h) }));
      }, 1400);

      // simulate ERP outbox item + retry lifecycle
      const queueId = uid("erp");
      persist(prev => ({ ...prev, erpQueue: [...prev.erpQueue, { id: queueId, entityType: "HandoverRecord", entityId: id, status: "SYNCING", attempts: 1, lastAttemptAt: nowIso() }] }));
      setTimeout(() => {
        const ok = Math.random() > 0.25;
        persist(prev => ({ ...prev, erpQueue: prev.erpQueue.map(q => q.id === queueId ? { ...q, status: ok ? "SUCCESS" : "FAILED", lastAttemptAt: nowIso() } : q) }));
      }, 1800);
    },

    rejectHandover(actor, id, reason) {
      if (!can(actor.role, "REJECT_HANDOVER")) return denied(actor.role, "REJECT_HANDOVER");
      persist(prev => {
        const h = prev.handovers.find(x => x.id === id);
        const newCount = (h.rejectionCount || 0) + 1;
        const updated = prev.handovers.map(x => x.id === id ? {
          ...x, status: "REJECTED", rejectionCount: newCount,
          rejections: [...x.rejections, { id: uid("rj"), rejectedBy: actor.id, reason, createdAt: nowIso() }],
        } : x);
        const auditEntries = [audit(actor, "HANDOVER_REJECTED", "HandoverRecord", reason.slice(0, 60))];
        if (newCount >= 2) auditEntries.push(audit(actor, "HANDOVER_ESCALATED_TO_MANAGER", "HandoverRecord", "Auto-escalated after 2 rejections"));
        return { ...prev, handovers: updated, auditLog: [...prev.auditLog, ...auditEntries] };
      });
      toast("Handover sent back to supervisor", "warn");
    },

    retryErp(actor, queueId) {
      if (!can(actor.role, "ERP_RETRY")) return denied(actor.role, "ERP_RETRY");
      persist(prev => ({ ...prev, erpQueue: prev.erpQueue.map(q => q.id === queueId ? { ...q, status: "SYNCING", attempts: q.attempts + 1, lastAttemptAt: nowIso() } : q) }));
      setTimeout(() => {
        const ok = Math.random() > 0.15;
        persist(prev => ({
          ...prev,
          erpQueue: prev.erpQueue.map(q => q.id === queueId ? { ...q, status: ok ? "SUCCESS" : (q.attempts >= 3 ? "DEAD_LETTER" : "FAILED"), lastAttemptAt: nowIso() } : q),
        }));
      }, 1200);
      toast("Retrying ERP sync...");
    },
  }), [persist, toast]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950"><Loader2 className="animate-spin text-slate-500" size={28} /></div>;
  }

  if (!currentUser) {
    return (
      <>
        <LoginScreen onLogin={(userId) => setCurrentUser(USERS.find(u => u.id === userId))} />
        <Toasts toasts={toasts} />
      </>
    );
  }

  return (
    <>
      <AppShell state={state} currentUser={currentUser} onLogout={() => setCurrentUser(null)} mutations={mutations} resetDemo={resetDemo} />
      <Toasts toasts={toasts} />
    </>
  );
}
