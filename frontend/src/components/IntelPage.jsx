import { useEffect, useState } from "react";
import {
  Radar,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  Newspaper,
  Zap,
  ArrowUpRight,
  Clock,
  AlertTriangle,
  Search,
  Filter,
} from "lucide-react";
import {
  getIntelDashboard,
  scrapeReddit,
  fetchNews,
  takeSentimentSnapshot,
  getRedditFeed,
  getNewsFeed,
  searchReddit,
} from "../services/api";

/* ────────────────────────────────
   Sentiment gauge (visual bar)
   ──────────────────────────────── */
function SentimentBar({ score, label }) {
  // score: -1 to 1
  const pct = ((score + 1) / 2) * 100; // 0-100%
  const color =
    score > 0.2 ? "var(--color-bull)" : score < -0.2 ? "var(--color-bear)" : "var(--color-muted)";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-surface-light rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, var(--color-bear), var(--color-muted) 50%, var(--color-bull))`,
            clipPath: `inset(0 ${100 - pct}% 0 0)`,
          }}
        />
        {/* Simple indicator dot */}
      </div>
      <span
        className="text-xs font-bold min-w-[60px] text-right"
        style={{ color }}
      >
        {label || (score > 0.2 ? "Bullish" : score < -0.2 ? "Bearish" : "Neutral")}
      </span>
    </div>
  );
}

/* ────────────────────────────────
   Sentiment icon
   ──────────────────────────────── */
function SentimentIcon({ label, size = 14 }) {
  if (label === "bullish")
    return <TrendingUp size={size} className="text-accent" />;
  if (label === "bearish")
    return <TrendingDown size={size} className="text-bear" />;
  return <Minus size={size} className="text-muted" />;
}

/* ────────────────────────────────
   Reddit post card
   ──────────────────────────────── */
function RedditCard({ post }) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card p-4 hover:border-accent/30 transition-colors block"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-accent font-semibold">
              r/{post.subreddit}
            </span>
            <SentimentIcon label={post.sentiment_label} size={12} />
            {post.symbols_mentioned && (
              <span className="text-xs text-yellow-400 font-mono">
                ${post.symbols_mentioned.split(",")[0]}
              </span>
            )}
          </div>
          <div className="text-sm font-semibold line-clamp-2">{post.title}</div>
          {post.body && (
            <div className="text-xs text-muted mt-1 line-clamp-2">
              {post.body}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="text-xs font-bold text-accent">
            ↑{post.score}
          </div>
          <div className="text-xs text-muted">
            {post.num_comments}💬
          </div>
        </div>
      </div>
      {post.tags && (
        <div className="flex flex-wrap gap-1 mt-2">
          {post.tags.split(",").map((tag) => (
            <span
              key={tag}
              className="text-[10px] bg-surface-light border border-border/50 rounded-full px-2 py-0.5 text-muted"
            >
              {tag.trim()}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}

/* ────────────────────────────────
   News article card
   ──────────────────────────────── */
function NewsCard({ article }) {
  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card p-4 hover:border-accent/30 transition-colors block"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted font-medium">
              {article.source}
            </span>
            <SentimentIcon label={article.sentiment_label} size={12} />
            <span className="text-xs text-muted">
              {article.published_at ? timeAgo(article.published_at) : ""}
            </span>
          </div>
          <div className="text-sm font-semibold line-clamp-2">
            {article.headline}
          </div>
          {article.summary && (
            <div className="text-xs text-muted mt-1 line-clamp-2">
              {article.summary}
            </div>
          )}
          {article.symbols && (
            <div className="text-xs text-yellow-400 font-mono mt-1">
              {article.symbols}
            </div>
          )}
        </div>
        <ArrowUpRight size={14} className="text-muted shrink-0 mt-1" />
      </div>
    </a>
  );
}

/* ────────────────────────────────
   Event card
   ──────────────────────────────── */
function EventCard({ event }) {
  const typeColors = {
    trump_announcement: "text-orange-400 bg-orange-400/10",
    tariff: "text-red-400 bg-red-400/10",
    earnings: "text-blue-400 bg-blue-400/10",
    fed: "text-purple-400 bg-purple-400/10",
    policy: "text-yellow-400 bg-yellow-400/10",
    macro: "text-cyan-400 bg-cyan-400/10",
    default: "text-muted bg-surface-light",
  };

  const colorCls = typeColors[event.event_type] || typeColors.default;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colorCls}`}>
              {event.event_type.replace(/_/g, " ")}
            </span>
            <span className="text-xs text-muted">
              Severity: {event.severity}/10
            </span>
          </div>
          <div className="text-sm font-semibold">{event.title}</div>
          {event.description && (
            <div className="text-xs text-muted mt-1">{event.description}</div>
          )}
        </div>
        {event.market_direction && (
          <div className="shrink-0">
            {event.market_direction === "UP" ? (
              <TrendingUp size={18} className="text-accent" />
            ) : event.market_direction === "DOWN" ? (
              <TrendingDown size={18} className="text-bear" />
            ) : (
              <Minus size={18} className="text-muted" />
            )}
          </div>
        )}
      </div>
      {(event.spy_change_pct || event.max_profit_pct) && (
        <div className="flex gap-4 mt-2 text-xs">
          {event.spy_change_pct != null && (
            <span className={event.spy_change_pct >= 0 ? "text-accent" : "text-bear"}>
              SPY {event.spy_change_pct >= 0 ? "+" : ""}{event.spy_change_pct.toFixed(2)}%
            </span>
          )}
          {event.max_profit_pct != null && (
            <span className="text-yellow-400">
              Max profit: +{event.max_profit_pct.toFixed(1)}%
            </span>
          )}
          {event.reaction_time_mins != null && (
            <span className="text-muted">
              Reaction: {event.reaction_time_mins}min
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════
   MAIN INTEL PAGE
   ════════════════════════════════ */
export default function IntelPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("feed"); // feed | reddit | news | events
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const fetchDashboard = async () => {
    try {
      const res = await getIntelDashboard({ hours: 24 });
      setDashboard(res.data);
    } catch (err) {
      console.error("Intel dashboard fetch:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Scrape Reddit + fetch news + take snapshot in parallel
      await Promise.allSettled([
        scrapeReddit({ limit: 15 }),
        fetchNews({ category: "general" }),
        takeSentimentSnapshot("hourly"),
      ]);
      await fetchDashboard();
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      await searchReddit(searchQuery, { time_filter: "week", limit: 25 });
      const res = await getRedditFeed({ hours: 168 }); // last 7 days
      setSearchResults(res.data.posts || []);
      setTab("reddit");
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  };

  const tabs = [
    { key: "feed", label: "Feed", icon: Radar },
    { key: "reddit", label: "Reddit", icon: MessageSquare },
    { key: "news", label: "News", icon: Newspaper },
    { key: "events", label: "Events", icon: Zap },
  ];

  const dist = dashboard?.sentiment_distribution || {};
  const totalPosts = dist.total || 0;
  const bullPct = totalPosts ? Math.round((dist.bullish / totalPosts) * 100) : 0;
  const bearPct = totalPosts ? Math.round((dist.bearish / totalPosts) * 100) : 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-28 md:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-3xl font-black tracking-tight">Intel</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="accent-btn text-xs flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Scanning..." : "Refresh Intel"}
        </button>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search Reddit... (trump tariff, NVDA earnings, rate cut)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="ghost-btn text-xs px-4 disabled:opacity-50"
          >
            {searching ? "..." : "Search"}
          </button>
        </div>
      </form>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-surface rounded-xl border border-border overflow-hidden w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              tab === t.key
                ? "bg-accent/10 text-accent"
                : "text-muted hover:text-theme-text"
            }`}
          >
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-10 text-center">
          <RefreshCw size={20} className="animate-spin mx-auto text-accent mb-3" />
          <div className="text-muted text-sm">Loading intelligence...</div>
        </div>
      ) : !dashboard ? (
        <div className="card p-10 text-center">
          <Radar size={40} className="mx-auto text-border-light mb-4" />
          <div className="text-theme-text font-semibold mb-2">No data yet</div>
          <div className="text-muted text-sm mb-4">
            Click "Refresh Intel" to scrape Reddit and fetch news.
          </div>
          <div className="text-xs text-muted">
            Requires REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, and FINNHUB_API_KEY in .env
          </div>
        </div>
      ) : tab === "feed" ? (
        <FeedTab dashboard={dashboard} bullPct={bullPct} bearPct={bearPct} totalPosts={totalPosts} />
      ) : tab === "reddit" ? (
        <RedditTab posts={searchResults || dashboard.top_reddit || []} />
      ) : tab === "news" ? (
        <NewsTab articles={dashboard.latest_news || []} />
      ) : (
        <EventsTab events={dashboard.recent_events || []} />
      )}
    </div>
  );
}

/* ────────────────────────────────
   FEED TAB (overview)
   ──────────────────────────────── */
function FeedTab({ dashboard, bullPct, bearPct, totalPosts }) {
  const timeline = dashboard.sentiment_timeline || [];
  const latestSentiment = timeline.length > 0 ? timeline[timeline.length - 1] : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Sentiment overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-muted font-medium mb-2 flex items-center gap-1.5">
            <MessageSquare size={12} /> Reddit Mood
          </div>
          {latestSentiment ? (
            <SentimentBar score={latestSentiment.reddit || 0} />
          ) : (
            <div className="text-xs text-muted">No data</div>
          )}
          <div className="text-xs text-muted mt-2">
            {totalPosts} posts · {bullPct}% bullish · {bearPct}% bearish
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-muted font-medium mb-2 flex items-center gap-1.5">
            <Newspaper size={12} /> News Mood
          </div>
          {latestSentiment ? (
            <SentimentBar score={latestSentiment.news || 0} />
          ) : (
            <div className="text-xs text-muted">No data</div>
          )}
          <div className="text-xs text-muted mt-2">
            {dashboard.latest_news?.length || 0} articles tracked
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-muted font-medium mb-2 flex items-center gap-1.5">
            <Radar size={12} className="text-accent" /> Combined
          </div>
          {latestSentiment ? (
            <SentimentBar score={latestSentiment.combined || 0} />
          ) : (
            <div className="text-xs text-muted">No data</div>
          )}
          <div className="text-xs text-muted mt-2">
            Weighted blend: 40% Reddit, 60% news
          </div>
        </div>
      </div>

      {/* Two column: Reddit + News */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Reddit */}
        <div>
          <div className="text-xs text-muted font-medium mb-3 flex items-center gap-1.5">
            <MessageSquare size={12} className="text-orange-400" />
            Top Reddit Posts
          </div>
          <div className="flex flex-col gap-2">
            {(dashboard.top_reddit || []).slice(0, 5).map((p) => (
              <RedditCard key={p.id} post={p} />
            ))}
            {(!dashboard.top_reddit || dashboard.top_reddit.length === 0) && (
              <div className="card p-6 text-center text-xs text-muted">
                No posts yet. Hit "Refresh Intel" to scrape.
              </div>
            )}
          </div>
        </div>

        {/* Latest News */}
        <div>
          <div className="text-xs text-muted font-medium mb-3 flex items-center gap-1.5">
            <Newspaper size={12} className="text-blue-400" />
            Latest News
          </div>
          <div className="flex flex-col gap-2">
            {(dashboard.latest_news || []).slice(0, 5).map((a) => (
              <NewsCard key={a.id} article={a} />
            ))}
            {(!dashboard.latest_news || dashboard.latest_news.length === 0) && (
              <div className="card p-6 text-center text-xs text-muted">
                No articles yet. Hit "Refresh Intel" to fetch.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Events */}
      {dashboard.recent_events && dashboard.recent_events.length > 0 && (
        <div>
          <div className="text-xs text-muted font-medium mb-3 flex items-center gap-1.5">
            <Zap size={12} className="text-yellow-400" />
            Recent Market Events
          </div>
          <div className="flex flex-col gap-2">
            {dashboard.recent_events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────
   REDDIT TAB
   ──────────────────────────────── */
function RedditTab({ posts }) {
  if (posts.length === 0) {
    return (
      <div className="card p-10 text-center">
        <MessageSquare size={32} className="mx-auto text-border-light mb-3" />
        <div className="text-muted text-sm">
          No Reddit posts. Try searching or refreshing.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {posts.map((p) => (
        <RedditCard key={p.id || p.reddit_id} post={p} />
      ))}
    </div>
  );
}

/* ────────────────────────────────
   NEWS TAB
   ──────────────────────────────── */
function NewsTab({ articles }) {
  if (articles.length === 0) {
    return (
      <div className="card p-10 text-center">
        <Newspaper size={32} className="mx-auto text-border-light mb-3" />
        <div className="text-muted text-sm">
          No news articles. Try refreshing.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {articles.map((a) => (
        <NewsCard key={a.id} article={a} />
      ))}
    </div>
  );
}

/* ────────────────────────────────
   EVENTS TAB
   ──────────────────────────────── */
function EventsTab({ events }) {
  if (events.length === 0) {
    return (
      <div className="card p-10 text-center">
        <Zap size={32} className="mx-auto text-border-light mb-3" />
        <div className="text-theme-text font-semibold mb-2">No events cataloged</div>
        <div className="text-muted text-sm">
          Events are created when significant market-moving news is detected.
          This will populate as the system collects data over time.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {events.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </div>
  );
}
