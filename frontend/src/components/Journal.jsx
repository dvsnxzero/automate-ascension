import { ClipboardList } from "lucide-react";

export default function Journal() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-28 md:pb-8">
      <h1 className="text-3xl font-black tracking-tight mb-6">Trade Journal</h1>

      <div className="card p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <ClipboardList size={28} className="text-accent" />
        </div>
        <div className="text-white font-semibold mb-2">Coming soon</div>
        <div className="text-muted text-sm mb-1">
          Your trade journal will auto-log every paper and live trade.
        </div>
        <div className="text-muted/50 text-xs">
          Phase 2 — unlocks with Indicators & Patterns module.
        </div>
      </div>
    </div>
  );
}
