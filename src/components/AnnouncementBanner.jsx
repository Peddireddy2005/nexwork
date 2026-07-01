import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, X, AlertTriangle, Info, CheckCircle2 } from "lucide-react";

const DISMISSED_KEY = "nx_dismissed_announcements";

export function AnnouncementBanner() {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const fetchActive = async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase.from("announcements").select("*").lte("starts_at", nowIso).order("starts_at", { ascending: false }).limit(5);
      const active = (data || []).filter((a) => !a.ends_at || a.ends_at > nowIso);
      setItems(active);
    };
    fetchActive();

    const ch = supabase
      .channel("announcements_banner")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, fetchActive)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const visible = items.find((i) => !dismissed.includes(i.id));
  if (!visible) return null;

  const dismiss = () => {
    const next = [...dismissed, visible.id];
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  };

  const tone =
    visible.severity === "warning"
      ? { icon: AlertTriangle, ring: "border-warning/40 bg-warning/10 text-warning" }
      : visible.severity === "success"
      ? { icon: CheckCircle2, ring: "border-success/40 bg-success/10 text-success" }
      : visible.severity === "critical"
      ? { icon: AlertTriangle, ring: "border-destructive/40 bg-destructive/10 text-destructive" }
      : { icon: Info, ring: "border-primary/40 bg-primary/10 text-primary" };
  const Icon = tone.icon;

  return (
    <div className={`mx-4 mt-3 rounded-2xl border ${tone.ring} backdrop-blur-xl px-4 py-2.5 flex items-center gap-3 shadow-sm`}>
      <Megaphone className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{visible.title}</p>
        {visible.body && <p className="text-xs opacity-90 truncate">{visible.body}</p>}
      </div>
      <button onClick={dismiss} className="opacity-70 hover:opacity-100 p-1 rounded-md" aria-label="Dismiss">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
