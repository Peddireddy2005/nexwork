import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCheck } from "lucide-react";

const NotificationsPage = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setNotifications(data || []);
  };

  useEffect(() => {
    fetchNotifications();

    if (!user) return;
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = async (id) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    fetchNotifications();
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    fetchNotifications();
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ lineHeight: "1.2" }}>
            Notifications
          </h1>
          <p className="text-muted-foreground mt-1">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllRead} size="sm">
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {notifications.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No notifications yet</p>
            </CardContent>
          </Card>
        ) : (
          notifications.map((n) => (
            <Card key={n.id} className={`shadow-sm transition-all ${!n.is_read ? "border-l-2 border-l-primary" : "opacity-70"}`}>
              <CardContent className="py-3 flex items-start gap-3">
                <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${n.is_read ? "bg-muted" : "bg-primary"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                {!n.is_read && (
                  <Button variant="ghost" size="sm" onClick={() => markAsRead(n.id)}>
                    <Check className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
