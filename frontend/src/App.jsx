import { Routes, Route, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
  ScanSearch,
  ClipboardList,
  FlaskConical,
  BookOpen,
  Settings,
} from "lucide-react";
import Dashboard from "./components/Dashboard";
import ChartView from "./components/ChartView";
import ScannerPanel from "./components/ScannerPanel";
import CourseNotes from "./components/CourseNotes";
import Journal from "./components/Journal";
import BacktestLab from "./components/BacktestLab";
import SettingsPage from "./components/Settings";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/chart", icon: BarChart3, label: "Chart" },
  { to: "/scanner", icon: ScanSearch, label: "Scan" },
  { to: "/journal", icon: ClipboardList, label: "Journal" },
  { to: "/backtest", icon: FlaskConical, label: "Lab" },
  { to: "/notes", icon: BookOpen, label: "Notes" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar — desktop */}
      <nav className="hidden md:flex flex-col w-60 bg-black border-r border-border p-5 gap-1">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-black font-black text-sm">A</span>
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
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chart" element={<ChartView />} />
          <Route path="/chart/:symbol" element={<ChartView />} />
          <Route path="/scanner" element={<ScannerPanel />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/backtest" element={<BacktestLab />} />
          <Route path="/notes" element={<CourseNotes />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      {/* Bottom nav — mobile (matches design reference: 4 icons, centered active) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-xl border-t border-border flex justify-around items-center py-3 px-2 z-50">
        {navItems.slice(0, 5).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 transition-all duration-200 ${
                isActive
                  ? "text-accent"
                  : "text-muted"
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
                  <Icon size={20} strokeWidth={1.5} />
                )}
                {!isActive && (
                  <span className="text-[10px] font-medium">{label}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
