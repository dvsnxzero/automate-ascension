import { useState, useEffect, useCallback } from "react";
import { Routes, Route, NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
  ScanSearch,
  ClipboardList,
  FlaskConical,
  BookOpen,
  Settings,
  Radar,
} from "lucide-react";
import Dashboard from "./components/Dashboard";
import ChartView from "./components/ChartView";
import ScannerPanel from "./components/ScannerPanel";
import CourseNotes from "./components/CourseNotes";
import Journal from "./components/Journal";
import BacktestLab from "./components/BacktestLab";
import IntelPage from "./components/IntelPage";
import SettingsPage from "./components/Settings";
import Login from "./components/Login";
import PageLoader from "./components/PageLoader";
import { ThemeProvider } from "./hooks/useTheme";
import { TradingModeProvider } from "./hooks/useTradingMode";
import TradingModeToggle from "./components/TradingModeToggle";
import { useSessionTimeout, hasLiveSessionMarker, clearLiveSessionMarker } from "./hooks/useSessionTimeout";
import { useLenisGlobal } from "./hooks/useLenis";
import { checkSession, checkSetup, logout } from "./services/passkey";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/chart", icon: BarChart3, label: "Chart" },
  { to: "/scanner", icon: ScanSearch, label: "Scan" },
  { to: "/journal", icon: ClipboardList, label: "Journal" },
  { to: "/intel", icon: Radar, label: "Intel" },
  { to: "/backtest", icon: FlaskConical, label: "Lab" },
  { to: "/notes", icon: BookOpen, label: "Notes" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

// Mobile bottom nav — show these 6 items (skip Lab and Notes, accessible from sidebar on desktop)
const mobileNavItems = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/chart", icon: BarChart3, label: "Chart" },
  { to: "/scanner", icon: ScanSearch, label: "Scan" },
  { to: "/journal", icon: ClipboardList, label: "Journal" },
  { to: "/intel", icon: Radar, label: "Intel" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

function AuthenticatedApp({ onLogout }) {
  // Session timeout — logs out after inactivity
  useSessionTimeout(onLogout);
  // Smooth scroll + parallax
  useLenisGlobal();

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text flex overflow-x-hidden max-w-full">
      {/* Sidebar — desktop */}
      <nav className="hidden md:flex flex-col w-60 bg-theme-bg border-r border-border p-5 gap-1">
        {/* Logo — links to home */}
        <Link
          to="/"
          aria-label="AutomateAscension — Home"
          className="flex items-center gap-2 mb-8 px-2 -mx-2 rounded-lg hover:bg-surface transition-colors py-1"
        >
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 26 26" fill="none">
              <path d="M15 3L6 15H13L11 23L20 11H13L15 3Z" fill="#000"/>
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight">
            Automate<span className="text-accent">Ascension</span>
          </span>
        </Link>

        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-accent-bg text-accent"
                  : "text-muted hover:text-theme-text hover:bg-surface"
              }`
            }
          >
            <Icon size={18} strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}

        {/* Trading mode toggle — paper (Alpaca) vs live (Webull, kill-switched) */}
        <div className="mt-auto pt-4 border-t border-border flex justify-center">
          <TradingModeToggle />
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto min-w-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chart" element={<ChartView />} />
          <Route path="/chart/:symbol" element={<ChartView />} />
          <Route path="/scanner" element={<ScannerPanel />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/intel" element={<IntelPage />} />
          <Route path="/backtest" element={<BacktestLab />} />
          <Route path="/notes" element={<CourseNotes />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      {/* Bottom nav — mobile (lifted above iOS home indicator) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-theme-bg/90 backdrop-blur-xl border-t border-border flex justify-around items-start px-2 z-50 pt-1 bottom-nav-fixed">
        {mobileNavItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 max-w-[68px] h-12 transition-all duration-200 ${
                isActive ? "text-accent" : "text-muted"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <div className="bg-accent rounded-xl px-4 py-1.5">
                    <Icon size={18} className="text-black" strokeWidth={2.5} />
                  </div>
                ) : (
                  <>
                    <Icon size={20} strokeWidth={1.5} />
                    <span className="text-[10px] font-medium mt-0.5">{label}</span>
                  </>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState("loading"); // loading | login | authenticated
  const [isSetup, setIsSetup] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // If this tab has no live session marker, the app was closed/relaunched.
        // Force re-auth even if the server cookie is still valid.
        const isFreshLaunch = !hasLiveSessionMarker();

        if (isFreshLaunch) {
          // Sign the server cookie out so a stale cookie can't be reused.
          try { await logout(); } catch {}
          const setup = await checkSetup();
          setIsSetup(setup.is_setup);
          setAuthState("login");
          return;
        }

        // Returning to an existing tab — verify session is still valid
        const session = await checkSession();
        if (session.authenticated) {
          setAuthState("authenticated");
          return;
        }

        const setup = await checkSetup();
        setIsSetup(setup.is_setup);
        setAuthState("login");
      } catch {
        setAuthState("login");
      }
    })();
  }, []);

  const handleLogout = useCallback(async () => {
    clearLiveSessionMarker();
    try {
      await logout();
    } catch {}
    setAuthState("login");
  }, []);

  if (authState === "loading") {
    return (
      <ThemeProvider>
        <div className="bg-theme-bg">
          <PageLoader variant="fullscreen" message="Booting" />
        </div>
      </ThemeProvider>
    );
  }

  if (authState === "login") {
    return (
      <ThemeProvider>
        <Login
          isSetup={isSetup}
          onAuthenticated={() => setAuthState("authenticated")}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <TradingModeProvider>
        <AuthenticatedApp onLogout={handleLogout} />
      </TradingModeProvider>
    </ThemeProvider>
  );
}
