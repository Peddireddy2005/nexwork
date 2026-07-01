import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Shield, Search, Wifi, WifiOff, RefreshCw, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const ActiveUsersPage = () => {
  const { role } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [roles, setRoles] = useState({});
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const [profilesRes, sessionsRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url, department"),
      supabase.from("user_sessions").select("user_id, last_active_at, device_info, created_at"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setProfiles(profilesRes.data || []);
    setSessions(sessionsRes.data || []);
    const rMap = {};
    (rolesRes.data || []).forEach((r) => {
      rMap[r.user_id] = r.role;
    });
    setRoles(rMap);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getInitials = (name) => (name ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "??");
  const roleColors = { admin: "bg-destructive/10 text-destructive", manager: "bg-primary/10 text-primary", member: "bg-muted text-muted-foreground" };

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const activeSessions = sessions.filter((s) => new Date(s.last_active_at) > fiveMinAgo);
  const activeUserIds = new Set(activeSessions.map((s) => s.user_id));

  const filtered = profiles.filter((p) => !search || p.full_name?.toLowerCase().includes(search.toLowerCase()) || p.department?.toLowerCase().includes(search.toLowerCase()));

  const activeProfiles = filtered.filter((p) => activeUserIds.has(p.id));
  const inactiveProfiles = filtered.filter((p) => !activeUserIds.has(p.id));

  const getLastActive = (userId) => {
    const userSessions = sessions.filter((s) => s.user_id === userId).sort((a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime());
    return userSessions[0]?.last_active_at || null;
  };

  if (role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ lineHeight: "1.2" }}>
            Active Users
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            <span className="text-success font-medium">{activeProfiles.length} online</span> · {inactiveProfiles.length} offline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9 h-9" />
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border-success/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wifi className="h-4 w-4 text-success" />
            Online Now ({activeProfiles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No users currently online</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeProfiles.map((member) => {
                const memberRole = roles[member.id] || "member";
                const userActiveSessions = activeSessions.filter((s) => s.user_id === member.id);
                return (
                  <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-success/5 border border-success/10">
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">{getInitials(member.full_name)}</AvatarFallback>
                      </Avatar>
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-background" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm truncate">{member.full_name || "Unknown"}</p>
                        <Badge variant="secondary" className={`text-[9px] px-1 py-0 ${roleColors[memberRole]}`}>
                          {memberRole}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {userActiveSessions.length} device{userActiveSessions.length > 1 ? "s" : ""} · {userActiveSessions.map((s) => s.device_info || "Unknown").join(", ")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <WifiOff className="h-4 w-4 text-muted-foreground" />
            Offline ({inactiveProfiles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inactiveProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">All users are online!</p>
          ) : (
            <div className="space-y-1">
              {inactiveProfiles.map((member) => {
                const memberRole = roles[member.id] || "member";
                const lastActive = getLastActive(member.id);
                return (
                  <div key={member.id} className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="relative">
                      <Avatar className="h-9 w-9 opacity-60">
                        {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                        <AvatarFallback className="bg-muted text-muted-foreground text-sm">{getInitials(member.full_name)}</AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm truncate text-muted-foreground">{member.full_name || "Unknown"}</p>
                        <Badge variant="secondary" className={`text-[9px] px-1 py-0 ${roleColors[memberRole]}`}>
                          {memberRole}
                        </Badge>
                      </div>
                      {lastActive && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last seen {formatDistanceToNow(new Date(lastActive), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ActiveUsersPage;
