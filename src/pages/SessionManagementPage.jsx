import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Monitor, Search, Shield } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const deviceIcon = (info) => {
  const s = (info || "").toLowerCase();
  if (s.includes("mobile")) return "mobile";
  if (s.includes("tablet")) return "tablet";
  if (s.includes("desktop")) return "desktop";
  return "device";
};

const SessionManagementPage = () => {
  const { role, user } = useAuth();
  const [mySessions, setMySessions] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [settings, setSettings] = useState({});
  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState({});
  const [currentSessionId, setCurrentSessionId] = useState(null);

  const fetchMySessions = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("user_sessions")
      .select("id, user_id, session_id, device_info, ip_address, last_active_at, created_at")
      .eq("user_id", user.id)
      .order("last_active_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setMySessions(data || []);
  };

  const fetchAdminData = async () => {
    const [profilesRes, settingsRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url, department"),
      supabase.from("user_device_settings").select("user_id, allow_multi_device"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setProfiles(profilesRes.data || []);
    const sMap = {};
    (settingsRes.data || []).forEach((s) => {
      sMap[s.user_id] = s.allow_multi_device;
    });
    setSettings(sMap);
    const rMap = {};
    (rolesRes.data || []).forEach((r) => {
      rMap[r.user_id] = r.role;
    });
    setRoles(rMap);
  };

  useEffect(() => {
    fetchMySessions();
    if (role === "admin") fetchAdminData();
    const i = setInterval(fetchMySessions, 30000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role]);

  useEffect(() => {
    if (mySessions.length > 0) {
      setCurrentSessionId(mySessions[0].session_id);
    }
  }, [mySessions]);

  const toggleMultiDevice = async (userId, allow) => {
    const existing = settings[userId] !== undefined;
    if (existing) {
      const { error } = await supabase.from("user_device_settings").update({ allow_multi_device: allow, updated_at: new Date().toISOString() }).eq("user_id", userId);
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("user_device_settings").insert({ user_id: userId, allow_multi_device: allow });
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    setSettings((prev) => ({ ...prev, [userId]: allow }));
    toast.success(`Multi-device ${allow ? "enabled" : "disabled"}`);
  };

  const getInitials = (name) => (name ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "??");
  const roleColors = { admin: "bg-destructive/10 text-destructive", manager: "bg-primary/10 text-primary", member: "bg-muted text-muted-foreground" };

  const filtered = profiles.filter((p) => !search || p.full_name?.toLowerCase().includes(search.toLowerCase()) || p.department?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ lineHeight: "1.2" }}>
          Session Management
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Review the devices signed in to your account.</p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              My active devices
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {mySessions.length === 0 ? "No active sessions found." : `${mySessions.length} active session${mySessions.length === 1 ? "" : "s"}.`}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {mySessions.map((s) => {
            const type = deviceIcon(s.device_info);
            const isCurrent = s.session_id === currentSessionId;
            return (
              <div key={s.id} className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-primary uppercase">{type.slice(0, 2)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{s.device_info || "Unknown device"}</p>
                    {isCurrent && (
                      <Badge variant="secondary" className="text-[10px] bg-success/10 text-success">
                        This device
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last seen {formatDistanceToNow(new Date(s.last_active_at), { addSuffix: true })}
                    {" · "}Signed in {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })}
          {mySessions.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No sessions to display.</p>}
        </CardContent>
      </Card>

      {role === "admin" && (
        <>
          <Separator />
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Team device permissions
              </h2>
              <p className="text-muted-foreground text-xs mt-1">Control multi-device login for each member. By default members can only be signed in on one device.</p>
            </div>
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members..." className="pl-9 h-9" />
            </div>
          </div>
          <Card className="shadow-sm">
            <CardContent className="space-y-1 pt-4">
              {filtered.map((member) => {
                const multiDevice = settings[member.id] ?? false;
                const memberRole = roles[member.id] || "member";
                return (
                  <div key={member.id} className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <Avatar className="h-10 w-10">
                      {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">{getInitials(member.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{member.full_name || "Unknown"}</p>
                        <Badge variant="secondary" className={`text-[10px] ${roleColors[memberRole]}`}>
                          {memberRole}
                        </Badge>
                      </div>
                      {member.department && <p className="text-xs text-muted-foreground">{member.department}</p>}
                    </div>
                    <Switch checked={multiDevice} onCheckedChange={(checked) => toggleMultiDevice(member.id, checked)} />
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No members found</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default SessionManagementPage;
