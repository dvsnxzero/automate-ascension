import { useState, useEffect } from "react";
import { getAuthStatus, reconnect } from "../services/api";
import { logout, startRegistration, checkSetup } from "../services/passkey";
import { useTheme } from "../hooks/useTheme";
import { getTimeoutMinutes, setTimeoutMinutes } from "../hooks/useSessionTimeout";
import {
  RefreshCw,
  LogOut,
  Fingerprint,
  Smartphone,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  Timer,
} from "lucide-react";

/* ─── Theme Toggle ───────────────────────── */
function ThemeSection() {
  const { preference, resolved, setTheme } = useTheme();

  const options = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "auto", icon: Monitor, label: "Auto" },
  ];

  return (
    <section className="card p-6 mb-4">
      <h2 className="text-base font-bold mb-1">Appearance</h2>
      <p className="text-xs text-muted mb-4">
        {preference === "auto"
          ? `Auto mode — currently ${resolved} (light 6 AM–6 PM, dark 6 PM–6 AM)`
          : `${resolved.charAt(0).toUpperCase() + resolved.slice(1)} mode active`}
      </p>
      <div className="flex gap-2">
        {options.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              preference === value
                ? "bg-accent-bg text-accent border border-accent/30"
                : "bg-surface border border-border text-muted hover:text-theme-text hover:border-border-light"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ─── Session Timeout ────────────────────── */
function TimeoutSection() {
  const [minutes, setMinutes] = useState(() => getTimeoutMinutes());

  const presets = [15, 30, 60, 120];

  const handleChange = (mins) => {
    setMinutes(mins);
    setTimeoutMinutes(mins);
  };

  return (
    <section className="card p-6 mb-4">
      <h2 className="text-base font-bold mb-1">Session Timeout</h2>
      <p className="text-xs text-muted mb-4">
        Auto-logout after {minutes} minutes of inactivity
      </p>
      <div className="flex gap-2 flex-wrap">
        {presets.map((mins) => (
          <button
            key={mins}
            onClick={() => handleChange(mins)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              minutes === mins
                ? "bg-accent-bg text-accent border border-accent/30"
                : "bg-surface border border-border text-muted hover:text-theme-text hover:border-border-light"
            }`}
          >
            <Timer size={14} />
            {mins < 60 ? `${mins}m` : `${mins / 60}h`}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ─── Security Section ───────────────────── */
function SecuritySection() {
  const [setupInfo, setSetupInfo] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [regResult, setRegResult] = useState(null);
  const [regError, setRegError] = useState(null);

  useEffect(() => {
    checkSetup().then(setSetupInfo).catch(() => {});
  }, []);

  const handleRegisterDevice = async () => {
    setRegistering(true);
    setRegError(null);
    setRegResult(null);
    try {
      const result = await startRegistration();
      setRegResult(result);
      checkSetup().then(setSetupInfo).catch(() => {});
    } catch (err) {
      setRegError(err?.response?.data?.detail || err.message || "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <section className="card p-6 mb-4">
      <h2 className="text-base font-bold mb-4">Security</h2>
      <div className="flex flex-col gap-4">
        {/* Status */}
        <div className="flex items-center gap-3">
          <Fingerprint size={16} className="text-accent" />
          <span className="text-sm text-muted">
            {setupInfo
              ? `${setupInfo.has_passkeys} passkey${setupInfo.has_passkeys !== 1 ? "s" : ""} registered · ${setupInfo.has_backup_codes} backup codes remaining`
              : "Passkey authentication active"}
          </span>
        </div>

        {/* Register new device */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleRegisterDevice}
            disabled={registering}
            className="accent-btn text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {registering ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Smartphone size={14} />
            )}
            {registering ? "Registering..." : "Add This Device"}
          </button>

          <button
            onClick={async () => {
              await logout();
              window.location.reload();
            }}
            className="ghost-btn text-sm flex items-center gap-2 text-bear border-bear/30 hover:border-bear hover:text-bear"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>

        {/* Success message */}
        {regResult && (
          <div className="bg-accent-bg border border-accent/20 rounded-xl p-3 flex items-center gap-2 text-accent text-sm">
            <ShieldCheck size={16} />
            Passkey registered for this device!
          </div>
        )}

        {/* Error message */}
        {regError && (
          <div className="bg-bear/10 border border-bear/20 rounded-xl p-3 text-bear text-sm">
            {regError}
          </div>
        )}

        <p className="text-xs text-muted">
          Add passkeys on each device you use. Sign in with a backup code on new devices, then register here.
        </p>
      </div>
    </section>
  );
}

/* ─── Main Settings Page ─────────────────── */
export default function SettingsPage() {
  const [authStatus, setAuthStatus] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);

  const fetchStatus = () => {
    getAuthStatus()
      .then((r) => setAuthStatus(r.data))
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await reconnect();
      await fetchStatus();
    } catch (e) {
      console.error("Reconnect failed:", e);
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-28 md:pb-8">
      <h1 className="text-3xl font-black tracking-tight mb-6">Settings</h1>

      {/* Appearance */}
      <ThemeSection />

      {/* Session Timeout */}
      <TimeoutSection />

      {/* Webull Connection */}
      <section className="card p-6 mb-4">
        <h2 className="text-base font-bold mb-4">Webull Connection</h2>
        <div className="flex items-center gap-3 mb-4">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              authStatus?.authenticated ? "bg-accent animate-pulse" : "bg-bear"
            }`}
          />
          <span className="text-sm text-muted">
            {authStatus?.authenticated
              ? `Connected — Account ${authStatus.account_id?.slice(-6) || ""}`
              : authStatus?.message || "Not connected"}
          </span>
        </div>
        <button
          onClick={handleReconnect}
          disabled={reconnecting}
          className="accent-btn text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={reconnecting ? "animate-spin" : ""} />
          {reconnecting ? "Connecting..." : authStatus?.authenticated ? "Reconnect" : "Connect Webull"}
        </button>
        <p className="text-xs text-muted mt-3">
          Uses your API key and secret from .env — credentials never leave the server.
        </p>
      </section>

      {/* Trading Mode */}
      <section className="card p-6 mb-4">
        <h2 className="text-base font-bold mb-4">Trading Mode</h2>
        <div className="flex gap-3">
          <button className="bg-accent-bg text-accent border border-accent/30 px-4 py-2.5 rounded-xl text-sm font-semibold">
            Paper Trading
          </button>
          <button className="bg-surface border border-border text-muted px-4 py-2.5 rounded-xl text-sm font-semibold cursor-not-allowed opacity-40">
            Live Trading (Phase 5)
          </button>
        </div>
        <p className="text-xs text-muted mt-3">
          Paper trading uses the same Webull API with virtual money. No risk.
        </p>
      </section>

      {/* Default Order Settings */}
      <section className="card p-6 mb-4">
        <h2 className="text-base font-bold mb-4">Default Order Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted block mb-2 font-medium">
              Max Position Size (% of account)
            </label>
            <input
              type="number"
              defaultValue={5}
              className="bg-surface-light border border-border rounded-xl px-4 py-2.5 text-sm w-full focus:outline-none focus:border-accent/50 transition-colors text-theme-text"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-2 font-medium">
              Default Stop Loss %
            </label>
            <input
              type="number"
              defaultValue={5}
              className="bg-surface-light border border-border rounded-xl px-4 py-2.5 text-sm w-full focus:outline-none focus:border-accent/50 transition-colors text-theme-text"
            />
          </div>
        </div>
      </section>

      {/* Security */}
      <SecuritySection />

      {/* About */}
      <section className="card p-6">
        <h2 className="text-base font-bold mb-2">About</h2>
        <p className="text-sm text-muted">
          AutomateAscension v0.1.0 — Built with ZipTrader U strategies, React,
          FastAPI, and the Webull Open API.
        </p>
      </section>
    </div>
  );
}
