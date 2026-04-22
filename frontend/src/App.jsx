import { useState, useEffect } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
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
import { checkSession, checkSetup } from "./services/passkey";

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

export default function App() {
  const [authState, setAuthState] = useState("loading"); // loading | login | authenticated
  const [isSetup, setIsSetup] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Check if already logged in
        const session = await checkSession();
        if (session.authenticated) {
          setAuthState("authenticated");
          return;
        }

        // Check if passkeys are set up
        const setup = await checkSetup();
        setIsSetup(setup.is_setup);
        setAuthState("login");
      } catch {
        setAuthState("login");
      }
    })();
  }, []);

  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 26 26" fill="none">
              <path d="M15 3L6 15H13L11 23L20 11H13L15 3Z" fill="#000"/>
            </svg>
          </div>
          {/* Pulse ring */}
          <div className="absolute inset-0 rounded-2xl bg-accent/20 animate-ping" />
        </div>
        <div className="text-center">
          <div className="text-lg font-bold tracking-tight">
            Automate<span className="text-accent">Ascension</span>
          </div>
          <div className="text-xs text-muted mt-1 animate-pulse">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (authState === "login") {
    return (
      <Login
        isSetup={isSetup}
        onAuthenticated={() => setAuthState("authenticated")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex overflow-x-hidden max-w-full">
      {/* Sidebar — desktop */}
      <nav className="hidden md:flex flex-col w-60 bg-black border-r border-border p-5 gap-1">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 26 26" fill="none">
              <path d="M15 3L6 15H13L11 23L20 11H13L15 3Z" fill="#000"/>
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight">
            Automate<span className="text-accent">Ascension</span>
          </span>
        </div>

        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-white hover:bg-surface"
              }`
            }
          >
            <Icon size={18} strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}

        {/* Paper trading badge */}
        <div className="mt-auto pt-4 border-t border-border">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-accent/10 text-accent text-xs font-bold tracking-wider">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            PAPER MODE
          </div>
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

      {/* Bottom nav — mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-xl border-t border-border flex justify-around items-center h-16 px-2 z-50">
        {navItems.slice(0, 5).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-14 h-12 transition-all duration-200 ${
                isActive ? "text-accent" : "text-muted"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <div className="bg-accent rounded-xl px-5 py-2">
                    <Icon size={20} className="text-black" strokeWidth={2.5} />
                  </div>
                ) : (
                  <>
                    <Icon size={20} strokeWidth={1.5} />
                    <span className="text-[10px] font-medium mt-1">{label}</span>
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
