import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, Settings2, Trash2, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";

const PREFS_KEY = "nx_notif_prefs";
const defaultPrefs = { muted: false, sound: true, showRead: true };

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return raw ? { ...defaultPrefs, ...JSON.parse(raw) } : defaultPrefs;
    } catch {
      return defaultPrefs;
    }
  });

  // Reused across notifications instead of creating (and leaking) a new
  // AudioContext on every single incoming notification.
  const audioCtxRef = useRef(null);

  const updatePrefs = (next) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  };

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
    setItems(data || []);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase
      .channel("notifications:" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const n = payload.new;
          setItems((prev) => [n, ...prev].slice(0, 30));
          if (!prefs.muted && prefs.sound) {
            try {
              const Ctx = window.AudioContext || window.webkitAudioContext;
              if (Ctx) {
                if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
                  audioCtxRef.current = new Ctx();
                }
                const ctx = audioCtxRef.current;
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.frequency.value = 880;
                g.gain.value = 0.05;
                o.connect(g);
                g.connect(ctx.destination);
                o.start();
                o.stop(ctx.currentTime + 0.08);
              }
            } catch {}
          }
        } else if (payload.eventType === "UPDATE") {
          const n = payload.new;
          setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, ...n } : i)));
        } else if (payload.eventType === "DELETE") {
          const old = payload.old;
          setItems((prev) => prev.filter((i) => i.id !== old.id));
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, [user, prefs.muted, prefs.sound]);

  const unread = items.filter((i) => !i.is_read).length;
  const visible = prefs.showRead ? items : items.filter((i) => !i.is_read);

  const handleClick = async (n) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)));
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    }
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  const markAllRead = async () => {
    if (!user) return;
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
  };

  const clearOld = async () => {
    if (!user) return;
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("notifications").delete().eq("user_id", user.id).eq("is_read", true).lt("created_at", cutoff);
    if (error) {
      toast({ title: "Could not clear", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((i) => !(i.is_read && i.created_at < cutoff)));
    toast({ title: "Old notifications cleared" });
  };

  const clearAllRead = async () => {
    if (!user) return;
    const { error } = await supabase.from("notifications").delete().eq("user_id", user.id).eq("is_read", true);
    if (error) {
      toast({ title: "Could not clear", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((i) => !i.is_read));
    toast({ title: "Read notifications cleared" });
  };

  const timeAgo = (date) => {
    const diff = (Date.now() - new Date(date).getTime()) / 1000;
    if (diff < 60) return "now";
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    if (diff < 86400) return Math.floor(diff / 3600) + "h";
    return Math.floor(diff / 86400) + "d";
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setShowSettings(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && !prefs.muted && (
            <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          <div className="flex items-center gap-1">
            {unread > 0 && !showSettings && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={markAllRead}>
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Mark all
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSettings((s) => !s)} aria-label="Settings">
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {showSettings ? (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Mute notifications</p>
                <p className="text-xs text-muted-foreground">Hide badge count</p>
              </div>
              <Switch checked={prefs.muted} onCheckedChange={(v) => updatePrefs({ muted: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Sound on new</p>
                <p className="text-xs text-muted-foreground">Subtle chime</p>
              </div>
              <Switch checked={prefs.sound} onCheckedChange={(v) => updatePrefs({ sound: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Show read items</p>
                <p className="text-xs text-muted-foreground">Display history</p>
              </div>
              <Switch checked={prefs.showRead} onCheckedChange={(v) => updatePrefs({ showRead: v })} />
            </div>
            <Separator />
            <Button variant="outline" size="sm" className="w-full" onClick={clearOld}>
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Clear read older than 7 days
            </Button>
            <Button variant="outline" size="sm" className="w-full" onClick={clearAllRead}>
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Clear all read
            </Button>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{items.length === 0 ? "No notifications" : "No unread notifications"}</p>
            ) : (
              <ul className="divide-y">
                {visible.map((n) => (
                  <li key={n.id}>
                    <button onClick={() => handleClick(n)} className={`w-full text-left p-3 hover:bg-accent transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}>
                      <div className="flex items-start gap-2">
                        {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight">{n.title}</p>
                          {n.message && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>}
                          <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}