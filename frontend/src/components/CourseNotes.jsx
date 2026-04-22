import { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  Search,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  ArrowRight,
  Loader2,
  X,
  FileText,
  GraduationCap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { getModules, getLessons, getLesson, searchNotes } from "../services/api";

/* ────────────────────────────────
   Simple markdown components
   ──────────────────────────────── */
const mdComponents = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-black tracking-tight mb-4 text-theme-text">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold mt-6 mb-3 text-theme-text">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-bold mt-5 mb-2 text-theme-text">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-muted leading-relaxed mb-3">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="text-theme-text font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="text-accent/80">{children}</em>,
  ul: ({ children }) => (
    <ul className="space-y-1.5 mb-4 ml-4">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="space-y-1.5 mb-4 ml-4 list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-muted leading-relaxed flex gap-2">
      <span className="text-accent/50 shrink-0">•</span>
      <span>{children}</span>
    </li>
  ),
  hr: () => <hr className="border-border my-6" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/40 pl-4 my-4 italic text-muted/80">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    if (className) {
      return (
        <pre className="bg-surface border border-border rounded-xl p-4 overflow-x-auto mb-4">
          <code className="text-xs font-mono text-accent/80">{children}</code>
        </pre>
      );
    }
    return (
      <code className="bg-surface border border-border px-1.5 py-0.5 rounded-lg text-xs font-mono text-accent/80">
        {children}
      </code>
    );
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 hover:text-accent/80">
      {children}
    </a>
  ),
};

/* ────────────────────────────────
   Search result card
   ──────────────────────────────── */
function SearchResult({ result, onSelect }) {
  return (
    <button
      onClick={() => onSelect(result.module_slug, result.filename)}
      className="w-full text-left card p-4 hover:border-accent/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <FileText size={16} className="text-accent shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-theme-text truncate">{result.title}</div>
          <div className="text-xs text-muted mt-0.5">
            <span className="text-accent/60 font-mono">{result.module_num}</span> · {result.module_name}
          </div>
          {result.snippets?.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.snippets.map((s, i) => (
                <div key={i} className="text-xs text-muted/70 truncate">
                  …{s}…
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/* ────────────────────────────────
   Main component
   ──────────────────────────────── */
export default function CourseNotes() {
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [lessonContent, setLessonContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [mobileView, setMobileView] = useState("modules"); // modules | lessons | content

  // Load modules on mount
  useEffect(() => {
    getModules()
      .then((res) => {
        if (res.data.modules) setModules(res.data.modules);
      })
      .catch(() => {});
  }, []);

  // Load lessons when module changes
  useEffect(() => {
    if (!selectedModule) {
      setLessons([]);
      return;
    }
    setLoading(true);
    getLessons(selectedModule.slug)
      .then((res) => setLessons(res.data.lessons || []))
      .catch(() => setLessons([]))
      .finally(() => setLoading(false));
  }, [selectedModule]);

  // Load lesson content
  const loadLesson = useCallback(
    async (moduleSlug, filename) => {
      setLoading(true);
      try {
        const res = await getLesson(moduleSlug, filename);
        setLessonContent(res.data);
        setSelectedLesson(filename);
        setMobileView("content");
      } catch {
        setLessonContent(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchNotes(searchQuery);
        setSearchResults(res.data);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Navigate to a search result
  const handleSearchSelect = (moduleSlug, filename) => {
    const mod = modules.find((m) => m.slug === moduleSlug);
    if (mod) {
      setSelectedModule(mod);
    }
    setSearchQuery("");
    setSearchResults(null);
    // Need to wait for lessons to load, then select
    getLessons(moduleSlug).then((res) => {
      setLessons(res.data.lessons || []);
      loadLesson(moduleSlug, filename);
    });
  };

  // Prev/Next navigation
  const currentLessonIndex = lessons.findIndex((l) => l.filename === selectedLesson);
  const prevLesson = currentLessonIndex > 0 ? lessons[currentLessonIndex - 1] : null;
  const nextLesson = currentLessonIndex < lessons.length - 1 ? lessons[currentLessonIndex + 1] : null;

  // Select module (on mobile, navigate to lessons view)
  const handleModuleSelect = (mod) => {
    setSelectedModule(mod);
    setSelectedLesson(null);
    setLessonContent(null);
    setMobileView("lessons");
  };

  return (
    <div className="flex flex-col h-full pb-28 md:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-theme-bg/95 backdrop-blur-sm border-b border-border/50 px-4 md:px-8 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            {/* Mobile back button */}
            {mobileView !== "modules" && (
              <button
                onClick={() => {
                  if (mobileView === "content") {
                    setMobileView("lessons");
                    setLessonContent(null);
                    setSelectedLesson(null);
                  } else {
                    setMobileView("modules");
                    setSelectedModule(null);
                  }
                }}
                className="md:hidden w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted hover:text-theme-text transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
            )}

            <GraduationCap size={22} className="text-accent shrink-0 hidden md:block" />
            <h1 className="text-xl md:text-2xl font-black tracking-tight shrink-0">
              {mobileView === "content" && lessonContent
                ? lessonContent.title
                : mobileView === "lessons" && selectedModule
                ? selectedModule.name
                : "Course Notes"}
            </h1>

            {/* Search */}
            <div className="relative ml-auto">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search all notes..."
                className="bg-surface border border-border rounded-xl pl-8 pr-8 py-2 text-sm focus:outline-none focus:border-accent/50 w-40 md:w-56 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults(null);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-theme-text"
                >
                  <X size={14} />
                </button>
              )}

              {/* Search dropdown */}
              {searchResults && (
                <div className="absolute right-0 top-full mt-2 w-80 md:w-96 max-h-96 overflow-y-auto bg-theme-bg border border-border rounded-2xl shadow-2xl z-50 p-2 space-y-2">
                  {searching && (
                    <div className="flex items-center gap-2 p-3 text-muted text-sm">
                      <Loader2 size={14} className="animate-spin" />
                      Searching...
                    </div>
                  )}
                  {!searching && searchResults.count === 0 && (
                    <div className="p-3 text-muted text-sm text-center">
                      No results for "{searchResults.query}"
                    </div>
                  )}
                  {!searching &&
                    searchResults.results?.map((r, i) => (
                      <SearchResult key={i} result={r} onSelect={handleSearchSelect} />
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 md:px-8 pt-4 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-full">

            {/* Module list — col 1-3 */}
            <div
              className={`md:col-span-3 overflow-y-auto ${
                mobileView !== "modules" ? "hidden md:block" : ""
              }`}
            >
              <div className="card divide-y divide-border overflow-hidden">
                {modules.map((mod) => (
                  <button
                    key={mod.slug}
                    onClick={() => handleModuleSelect(mod)}
                    className={`w-full text-left px-4 py-3.5 flex items-center justify-between transition-all duration-200 ${
                      selectedModule?.slug === mod.slug
                        ? "bg-accent/10"
                        : "hover:bg-surface-light"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-mono font-bold shrink-0 ${
                            selectedModule?.slug === mod.slug
                              ? "text-accent"
                              : "text-muted"
                          }`}
                        >
                          {mod.num}
                        </span>
                        <span className="text-sm font-medium truncate">{mod.name}</span>
                      </div>
                      <div className="text-xs text-muted mt-0.5 ml-6">
                        {mod.lesson_count} lesson{mod.lesson_count !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className={`shrink-0 ${
                        selectedModule?.slug === mod.slug
                          ? "text-accent"
                          : "text-border-light"
                      }`}
                    />
                  </button>
                ))}
                {modules.length === 0 && (
                  <div className="p-6 text-center text-muted text-sm">
                    <Loader2 size={16} className="animate-spin mx-auto mb-2" />
                    Loading modules...
                  </div>
                )}
              </div>
            </div>

            {/* Lesson list — col 4-5 */}
            <div
              className={`md:col-span-2 overflow-y-auto ${
                mobileView !== "lessons" ? "hidden md:block" : ""
              }`}
            >
              {selectedModule ? (
                <div className="card divide-y divide-border overflow-hidden">
                  {lessons.map((lesson) => (
                    <button
                      key={lesson.filename}
                      onClick={() =>
                        loadLesson(selectedModule.slug, lesson.filename)
                      }
                      className={`w-full text-left px-3 py-3 transition-all duration-200 ${
                        selectedLesson === lesson.filename
                          ? "bg-accent/10"
                          : "hover:bg-surface-light"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono font-bold shrink-0 ${
                            selectedLesson === lesson.filename
                              ? "text-accent"
                              : "text-muted"
                          }`}
                        >
                          {lesson.lesson_num}
                        </span>
                        <span className="text-xs font-medium truncate leading-tight">
                          {lesson.title}
                        </span>
                      </div>
                    </button>
                  ))}
                  {loading && lessons.length === 0 && (
                    <div className="p-4 text-center">
                      <Loader2 size={14} className="animate-spin mx-auto text-muted" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="hidden md:flex card p-6 items-center justify-center text-center h-40">
                  <div className="text-muted text-xs">Select a module</div>
                </div>
              )}
            </div>

            {/* Content — col 6-12 */}
            <div
              className={`md:col-span-7 overflow-y-auto ${
                mobileView !== "content" && mobileView !== "modules"
                  ? "hidden md:block"
                  : mobileView === "modules"
                  ? "hidden md:block"
                  : ""
              }`}
            >
              {lessonContent ? (
                <div className="card p-5 md:p-8">
                  {/* Markdown content */}
                  <div className="prose-custom">
                    <ReactMarkdown components={mdComponents}>
                      {lessonContent.content}
                    </ReactMarkdown>
                  </div>

                  {/* Prev / Next navigation */}
                  <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
                    {prevLesson ? (
                      <button
                        onClick={() =>
                          loadLesson(selectedModule.slug, prevLesson.filename)
                        }
                        className="ghost-btn text-xs flex items-center gap-2"
                      >
                        <ArrowLeft size={12} />
                        {prevLesson.title}
                      </button>
                    ) : (
                      <div />
                    )}
                    {nextLesson ? (
                      <button
                        onClick={() =>
                          loadLesson(selectedModule.slug, nextLesson.filename)
                        }
                        className="ghost-btn text-xs flex items-center gap-2"
                      >
                        {nextLesson.title}
                        <ArrowRight size={12} />
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>
                </div>
              ) : loading ? (
                <div className="card p-10 text-center">
                  <Loader2 size={24} className="animate-spin mx-auto text-accent mb-3" />
                  <div className="text-muted text-sm">Loading lesson...</div>
                </div>
              ) : (
                <div className="hidden md:block card p-10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                    <BookOpen size={28} className="text-accent" />
                  </div>
                  <div className="text-lg font-bold mb-2">ZipTrader U Notes</div>
                  <div className="text-muted text-sm">
                    {modules.length > 0
                      ? `${modules.length} modules · ${modules.reduce(
                          (sum, m) => sum + m.lesson_count,
                          0
                        )} lessons`
                      : "Select a module to start reading"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
