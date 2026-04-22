import { useState } from "react";
import { BookOpen, Search, ChevronRight } from "lucide-react";

const MODULES = [
  { num: "01", name: "Welcome", lessons: 5 },
  { num: "02", name: "Getting Started", lessons: 4 },
  { num: "03", name: "Using Your Broker", lessons: 4 },
  { num: "04", name: "Beginning Chart Analysis", lessons: 5 },
  { num: "05", name: "Making Trades Using Indicators & Patterns", lessons: 15 },
  { num: "06", name: "Smart Trading Techniques", lessons: 5 },
  { num: "07", name: "Fundamentals", lessons: 12 },
  { num: "08", name: "Biotech Toolbox", lessons: 2 },
  { num: "09", name: "ETF Toolbox", lessons: 4 },
  { num: "10", name: "Value Dipping", lessons: 6 },
  { num: "11", name: "High Conviction Portfolio Strategy", lessons: 7 },
  { num: "12", name: "Course Aids and Useful Files", lessons: 3 },
  { num: "13", name: "Scanners Setup: ThinkOrSwim", lessons: 4 },
  { num: "14", name: "Closing Remarks", lessons: 2 },
];

export default function CourseNotes() {
  const [selectedModule, setSelectedModule] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-28 md:pb-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-3xl font-black tracking-tight">Course Notes</h1>
        <div className="relative ml-auto">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-accent/50 w-48 transition-colors"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Module list */}
        <div className="md:col-span-1">
          <div className="card divide-y divide-border overflow-hidden">
            {MODULES.filter(
              (m) =>
                !searchQuery ||
                m.name.toLowerCase().includes(searchQuery.toLowerCase())
            ).map((mod) => (
              <button
                key={mod.num}
                onClick={() => setSelectedModule(mod)}
                className={`w-full text-left px-4 py-3.5 flex items-center justify-between transition-all duration-200 ${
                  selectedModule?.num === mod.num
                    ? "bg-accent/10"
                    : "hover:bg-surface-light"
                }`}
              >
                <div>
                  <span className={`text-xs font-mono font-bold mr-2 ${
                    selectedModule?.num === mod.num ? "text-accent" : "text-muted"
                  }`}>
                    {mod.num}
                  </span>
                  <span className="text-sm font-medium">{mod.name}</span>
                  <div className="text-xs text-muted mt-0.5">
                    {mod.lessons} lessons
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className={
                    selectedModule?.num === mod.num ? "text-accent" : "text-border-light"
                  }
                />
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="md:col-span-2">
          {selectedModule ? (
            <div className="card p-6">
              <h2 className="text-lg font-bold mb-4">
                <span className="text-accent font-mono mr-2">
                  {selectedModule.num}
                </span>
                {selectedModule.name}
              </h2>
              <div className="text-muted text-sm space-y-3">
                <p>
                  Course notes will load from the markdown files in{" "}
                  <code className="bg-surface-light border border-border px-2 py-0.5 rounded-lg text-xs font-mono text-accent/70">
                    /public/course-notes/
                  </code>
                </p>
                <p>
                  Copy your extracted notes from{" "}
                  <code className="bg-surface-light border border-border px-2 py-0.5 rounded-lg text-xs font-mono text-accent/70">
                    ziptrader-course-notes/
                  </code>{" "}
                  into this directory to view them here.
                </p>
              </div>
            </div>
          ) : (
            <div className="card p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <BookOpen size={28} className="text-accent" />
              </div>
              <div className="text-muted text-sm">
                Select a module to view your ZipTrader U course notes.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
