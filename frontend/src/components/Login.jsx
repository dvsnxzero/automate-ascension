import { useState, useEffect, useRef } from "react";
import { Fingerprint, KeyRound, ShieldCheck, AlertCircle, Copy, Smartphone, ArrowRight } from "lucide-react";
import {
  startRegistration,
  startAuthentication,
  authWithBackupCode,
} from "../services/passkey";

export default function Login({ isSetup, onAuthenticated }) {
  const [mode, setMode] = useState(isSetup ? "login" : "setup"); // setup | login | backup | register-device
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState(null); // shown once after setup
  const [backupInput, setBackupInput] = useState("");
  const [codesCopied, setCodesCopied] = useState(false);
  const [deviceRegistered, setDeviceRegistered] = useState(false);
  const autoTriggered = useRef(false);

  // Auto-trigger Face ID / Touch ID on page load for returning users
  useEffect(() => {
    if (mode === "login" && !autoTriggered.current && !loading) {
      autoTriggered.current = true;
      // Small delay so the UI renders first, then prompt biometrics
      const timer = setTimeout(() => {
        handlePasskeyLogin();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePasskeySetup = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await startRegistration();
      if (result.backup_codes) {
        setBackupCodes(result.backup_codes);
      } else {
        onAuthenticated();
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || "";
      // If credential already exists in authenticator, switch to login
      if (msg.includes("already registered") || msg.includes("InvalidStateError")) {
        setError(null);
        setMode("login");
        return;
      }
      setError(msg || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await startAuthentication();
      onAuthenticated();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBackupCode = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authWithBackupCode(backupInput.trim());
      // Authenticated — offer to register this device
      setMode("register-device");
    } catch (err) {
      setError(err?.response?.data?.detail || "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterDevice = async () => {
    setError(null);
    setLoading(true);
    try {
      await startRegistration();
      setDeviceRegistered(true);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || "Registration failed — you can add this device later in Settings.");
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCodesCopied(true);
    setTimeout(() => setCodesCopied(false), 2000);
  };

  // ─── Backup codes reveal (after first setup) ───
  if (backupCodes) {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-accent mx-auto mb-4 flex items-center justify-center">
              <ShieldCheck size={32} className="text-black" />
            </div>
            <h1 className="text-2xl font-black mb-2">Backup Codes</h1>
            <p className="text-muted text-sm">
              Save these codes somewhere safe. Each can only be used once.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-5 mb-4">
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <div
                  key={i}
                  className="bg-surface-light rounded-lg px-3 py-2 text-center font-mono text-sm text-accent tracking-widest"
                >
                  {code}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={copyBackupCodes}
            className="w-full ghost-btn flex items-center justify-center gap-2 mb-3"
          >
            <Copy size={14} />
            {codesCopied ? "Copied!" : "Copy all codes"}
          </button>

          <button
            onClick={onAuthenticated}
            className="w-full accent-btn text-center"
          >
            I've saved my codes — Continue
          </button>
        </div>
      </div>
    );
  }

  // ─── Setup (first time) ───
  if (mode === "setup") {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-accent mx-auto mb-4 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 26 26" fill="none">
                <path d="M15 3L6 15H13L11 23L20 11H13L15 3Z" fill="#000"/>
              </svg>
            </div>
            <h1 className="text-2xl font-black tracking-tight">
              <span className="text-theme-text">Automate</span><span className="text-accent">Ascension</span>
            </h1>
            <p className="text-muted text-sm mt-2">Set up passkey to secure your dashboard</p>
          </div>

          {error && (
            <div className="bg-bear/10 border border-bear/20 rounded-xl p-3 mb-4 flex items-center gap-2 text-bear text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button
            onClick={handlePasskeySetup}
            disabled={loading}
            className="w-full accent-btn flex items-center justify-center gap-3 py-4 text-base disabled:opacity-50"
          >
            <Fingerprint size={22} />
            {loading ? "Setting up..." : "Register Passkey"}
          </button>

          <p className="text-muted/50 text-xs text-center mt-4">
            Uses Face ID, Touch ID, or Windows Hello
          </p>

          <button
            onClick={() => { setMode("login"); setError(null); }}
            className="w-full ghost-btn mt-3 flex items-center justify-center gap-2 text-sm"
          >
            <Fingerprint size={14} />
            Already set up? Sign in
          </button>
        </div>
      </div>
    );
  }

  // ─── Register device (after backup code login) ───
  if (mode === "register-device") {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-accent mx-auto mb-4 flex items-center justify-center">
              <Smartphone size={32} className="text-black" />
            </div>
            <h1 className="text-2xl font-black mb-2">
              {deviceRegistered ? "Device Registered!" : "Add This Device"}
            </h1>
            <p className="text-muted text-sm">
              {deviceRegistered
                ? "Face ID / Touch ID is now set up. You won't need a backup code next time."
                : "Register a passkey so you can use Face ID or Touch ID next time."}
            </p>
          </div>

          {error && (
            <div className="bg-bear/10 border border-bear/20 rounded-xl p-3 mb-4 flex items-center gap-2 text-bear text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {!deviceRegistered ? (
            <>
              <button
                onClick={handleRegisterDevice}
                disabled={loading}
                className="w-full accent-btn flex items-center justify-center gap-3 py-4 text-base disabled:opacity-50"
              >
                <Fingerprint size={22} />
                {loading ? "Registering..." : "Register Passkey"}
              </button>

              <button
                onClick={onAuthenticated}
                className="w-full ghost-btn mt-3 flex items-center justify-center gap-2 text-sm"
              >
                Skip for now
                <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <button
              onClick={onAuthenticated}
              className="w-full accent-btn flex items-center justify-center gap-3 py-4 text-base"
            >
              Continue to Dashboard
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Login ───
  return (
    <div className="min-h-screen bg-theme-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-accent mx-auto mb-4 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 26 26" fill="none">
              <path d="M15 3L6 15H13L11 23L20 11H13L15 3Z" fill="#000"/>
            </svg>
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            <span className="text-theme-text">Automate</span><span className="text-accent">Ascension</span>
          </h1>
          <p className="text-muted text-sm mt-2">Sign in to continue</p>
        </div>

        {error && (
          <div className="bg-bear/10 border border-bear/20 rounded-xl p-3 mb-4 flex items-center gap-2 text-bear text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {mode === "login" && (
          <>
            <button
              onClick={handlePasskeyLogin}
              disabled={loading}
              className="w-full accent-btn flex items-center justify-center gap-3 py-4 text-base disabled:opacity-50"
            >
              <Fingerprint size={22} />
              {loading ? "Authenticating..." : "Sign in with Passkey"}
            </button>

            <button
              onClick={() => { setMode("backup"); setError(null); }}
              className="w-full ghost-btn mt-3 flex items-center justify-center gap-2 text-sm"
            >
              <KeyRound size={14} />
              Use backup code
            </button>
          </>
        )}

        {mode === "backup" && (
          <>
            <form onSubmit={handleBackupCode}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={backupInput}
                onChange={(e) => setBackupInput(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit backup code"
                className="w-full bg-surface border border-border rounded-xl px-4 py-4 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:border-accent/50 mb-3"
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || backupInput.length < 6}
                className="w-full accent-btn py-4 text-base disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify Code"}
              </button>
            </form>

            <button
              onClick={() => { setMode("login"); setError(null); }}
              className="w-full ghost-btn mt-3 flex items-center justify-center gap-2 text-sm"
            >
              <Fingerprint size={14} />
              Use passkey instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}
