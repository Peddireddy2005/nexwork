import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { decryptMessage } from "@/lib/encryption";

/**
 * Global component that listens for new messages across ALL channels
 * the user is a member of, and sends browser push notifications.
 */
const GlobalMessageNotifier = () => {
  const { user } = useAuth();
  const { permission, requestPermission, sendNotification } = useBrowserNotifications();
  const [profileNames, setProfileNames] = useState({});
  const [channelNames, setChannelNames] = useState({});
  const [channelKeys, setChannelKeys] = useState({});
  const channelRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [profilesRes, channelsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name"),
        supabase.from("channels").select("id, name, is_direct, encryption_key"),
      ]);
      const names = {};
      profilesRes.data?.forEach((p) => {
        names[p.id] = p.full_name || "Unknown";
      });
      setProfileNames(names);

      const chNames = {};
      const chKeys = {};
      channelsRes.data?.forEach((c) => {
        chNames[c.id] = c.is_direct ? "Direct Message" : `#${c.name}`;
        chKeys[c.id] = c.encryption_key || null;
      });
      setChannelNames(chNames);
      setChannelKeys(chKeys);
    };
    fetchData();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const ch = supabase
      .channel("global-message-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const msg = payload.new;
        if (msg.user_id === user.id) return;

        const senderName = profileNames[msg.user_id] || "Someone";
        const channelName = channelNames[msg.channel_id] || "a channel";
        const key = channelKeys[msg.channel_id];

        let body = msg.content;
        if (key) {
          body = await decryptMessage(msg.content, key);
        }

        sendNotification(`${senderName} in ${channelName}`, {
          body: body.length > 120 ? body.slice(0, 120) + "…" : body,
          tag: `msg-${msg.channel_id}`,
        });
      })
      .subscribe();

    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, profileNames, channelNames, channelKeys, sendNotification]);

  const handleEnableNotifications = async () => {
    const result = await requestPermission();
    if (result === "granted") {
      toast.success("Browser notifications enabled!");
    } else if (result === "denied") {
      toast.error("Notifications blocked. Please enable them in your browser settings.");
    }
  };

  if (permission === "granted") return null;

  return (
    <Button variant="ghost" size="sm" onClick={handleEnableNotifications} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
      {permission === "denied" ? (
        <>
          <BellOff className="h-3.5 w-3.5" />
          Notifications Blocked
        </>
      ) : (
        <>
          <Bell className="h-3.5 w-3.5" />
          Enable Notifications
        </>
      )}
    </Button>
  );
};

export default GlobalMessageNotifier;