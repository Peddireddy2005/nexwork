import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, Trophy, TrendingUp, BarChart3, Users, Target, Trash2, History, Clock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const PerformancePage = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const isAdminOrManager = role === "admin" || role === "manager";
  const [leaderboard, setLeaderboard] = useState([]);
  const [rateOpen, setRateOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("leaderboard");
  const [ratings, setRatings] = useState([]);
  const [completionHistory, setCompletionHistory] = useState([]);
  const [profiles, setProfiles] = useState({});

  const fetchPerformance = async () => {
    setLoading(true);
    try {
      const [profilesRes, tasksRes, ratingsRes, assigneesRes, historyRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, department"),
        supabase.from("tasks").select("id, assigned_to, status"),
        supabase.from("performance_ratings").select("*"),
        supabase.from("task_assignees").select("task_id, user_id"),
        supabase.from("task_completion_history").select("*").order("completed_at", { ascending: false }),
      ]);

      const profilesList = profilesRes.data;
      const tasks = tasksRes.data;
      const ratingsData = ratingsRes.data;
      const assignees = assigneesRes.data;
      const history = historyRes.data || [];

      if (!profilesList) {
        setLoading(false);
        return;
      }

      const nameMap = {};
      profilesList.forEach((p) => {
        nameMap[p.id] = p.full_name || "Unknown";
      });
      setProfiles(nameMap);
      setRatings(ratingsData || []);
      setCompletionHistory(history);

      const perfMap = {};
      profilesList.forEach((p) => {
        perfMap[p.id] = {
          id: p.id,
          full_name: p.full_name,
          department: p.department,
          completedCount: 0,
          totalAssigned: 0,
          avgRating: 0,
          ratingCount: 0,
        };
      });

      history.forEach((h) => {
        if (perfMap[h.user_id]) {
          perfMap[h.user_id].completedCount++;
        }
      });

      tasks?.forEach((t) => {
        if (t.assigned_to && perfMap[t.assigned_to]) {
          perfMap[t.assigned_to].totalAssigned++;
        }
      });
      if (assignees && tasks) {
        assignees.forEach((a) => {
          if (perfMap[a.user_id]) {
            const task = tasks.find((t) => t.id === a.task_id);
            if (task && task.assigned_to !== a.user_id) {
              perfMap[a.user_id].totalAssigned++;
            }
          }
        });
      }

      Object.values(perfMap).forEach((p) => {
        p.totalAssigned += p.completedCount;
      });

      const ratingAccum = {};
      ratingsData?.forEach((r) => {
        if (!ratingAccum[r.user_id]) ratingAccum[r.user_id] = { sum: 0, count: 0 };
        ratingAccum[r.user_id].sum += r.rating;
        ratingAccum[r.user_id].count++;
      });
      Object.entries(ratingAccum).forEach(([uid, { sum, count }]) => {
        if (perfMap[uid]) {
          perfMap[uid].avgRating = Math.round((sum / count) * 10) / 10;
          perfMap[uid].ratingCount = count;
        }
      });

      setLeaderboard(Object.values(perfMap).sort((a, b) => b.completedCount - a.completedCount));
    } catch (err) {
      console.error("Performance fetch error:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPerformance();
  }, []);

  const submitRating = async (e) => {
    e.preventDefault();
    if (!user || !selectedUser) return;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const { error } = await supabase.from("performance_ratings").upsert(
      {
        user_id: selectedUser,
        rated_by: user.id,
        rating,
        comment: comment.trim() || null,
        week_start: weekStart.toISOString().split("T")[0],
      },
      { onConflict: "user_id,rated_by,week_start" }
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Rating submitted");
    setRateOpen(false);
    setSelectedUser("");
    setRating(5);
    setComment("");
    fetchPerformance();
  };

  const deleteRating = async (id) => {
    const { error } = await supabase.from("performance_ratings").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Rating deleted");
    fetchPerformance();
  };

  const getInitials = (name) => (name ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "??");

  const getCompletionRate = (m) => (m.totalAssigned > 0 ? Math.round((m.completedCount / m.totalAssigned) * 100) : 0);

  const totalCompleted = leaderboard.reduce((s, m) => s + m.completedCount, 0);
  const totalAssigned = leaderboard.reduce((s, m) => s + m.totalAssigned, 0);
  const avgTeamRating =
    leaderboard.filter((m) => m.avgRating > 0).length > 0
      ? Math.round((leaderboard.filter((m) => m.avgRating > 0).reduce((s, m) => s + m.avgRating, 0) / leaderboard.filter((m) => m.avgRating > 0).length) * 10) / 10
      : 0;

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <h1 className="text-2xl font-bold tracking-tight" style={{ lineHeight: "1.2" }}>
          Performance
        </h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  const priorityColors = { low: "bg-muted text-muted-foreground", medium: "bg-info/10 text-info", high: "bg-warning/10 text-warning", urgent: "bg-destructive/10 text-destructive" };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ lineHeight: "1.2" }}>
            Performance
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Track team productivity and ratings</p>
        </div>
        {isAdminOrManager && (
          <Dialog open={rateOpen} onOpenChange={setRateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Star className="h-4 w-4 mr-1" />
                Rate Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Rate Team Member</DialogTitle>
              </DialogHeader>
              <form onSubmit={submitRating} className="space-y-4">
                <div className="space-y-2">
                  <Label>Team Member</Label>
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select member" />
                    </SelectTrigger>
                    <SelectContent>
                      {leaderboard
                        .filter((m) => m.id !== user?.id)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.full_name || "Unknown"}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rating (1-10)</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={1} max={10} value={rating} onChange={(e) => setRating(Number(e.target.value))} className="w-20" />
                    <div className="flex gap-0.5">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <button key={i} type="button" onClick={() => setRating(i + 1)} className="p-0.5">
                          <Star className={`h-4 w-4 transition-colors ${i < rating ? "text-accent fill-accent" : "text-muted"}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Comment</Label>
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Optional feedback..." />
                </div>
                <Button type="submit" className="w-full" disabled={!selectedUser}>
                  Submit Rating
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Team Members</span>
              <div className="p-1.5 rounded-md bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums">{leaderboard.length}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Tasks Completed</span>
              <div className="p-1.5 rounded-md bg-success/10">
                <Target className="h-4 w-4 text-success" />
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {totalCompleted}
              <span className="text-sm font-normal text-muted-foreground">/{totalAssigned}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Completion Rate</span>
              <div className="p-1.5 rounded-md bg-info/10">
                <BarChart3 className="h-4 w-4 text-info" />
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums">{totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0}%</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Avg Rating</span>
              <div className="p-1.5 rounded-md bg-accent/10">
                <Star className="h-4 w-4 text-accent" />
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {avgTeamRating || "—"}
              <span className="text-sm font-normal text-muted-foreground">/10</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="details">Detailed View</TabsTrigger>
          <TabsTrigger value="history">Task History</TabsTrigger>
          {isAdmin && <TabsTrigger value="ratings">Manage Ratings</TabsTrigger>}
        </TabsList>

        <TabsContent value="leaderboard" className="space-y-4 mt-4">
          {leaderboard.length >= 3 && (
            <div className="grid grid-cols-3 gap-3">
              {[1, 0, 2].map((rank) => {
                const member = leaderboard[rank];
                if (!member) return null;
                const medals = ["🥇", "🥈", "🥉"];
                return (
                  <Card key={member.id} className={`shadow-sm text-center ${rank === 0 ? "border-accent/30 bg-accent/5 ring-1 ring-accent/20" : ""}`}>
                    <CardContent className="pt-5 pb-4">
                      <div className="text-lg font-bold mb-2">{medals[rank]}</div>
                      <Avatar className="h-12 w-12 mx-auto mb-2">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">{getInitials(member.full_name)}</AvatarFallback>
                      </Avatar>
                      <p className="font-medium text-sm truncate">{member.full_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{member.completedCount} tasks done</p>
                      <div className="mt-2">
                        <Progress value={getCompletionRate(member)} className="h-1.5" />
                        <p className="text-[10px] text-muted-foreground mt-0.5">{getCompletionRate(member)}% completion</p>
                      </div>
                      <div className="flex items-center justify-center gap-1 mt-1.5">
                        <Star className="h-3 w-3 text-accent fill-accent" />
                        <span className="text-xs font-medium tabular-nums">{member.avgRating || "—"}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            {leaderboard.map((member, i) => {
              const medalColors = ["text-accent", "text-muted-foreground", "text-warning/70"];
              return (
                <Card key={member.id} className="shadow-sm hover:shadow-md transition-[box-shadow]">
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <div className="w-7 text-center font-bold text-sm tabular-nums text-muted-foreground">{i < 3 ? <Trophy className={`h-4 w-4 mx-auto ${medalColors[i]}`} /> : `#${i + 1}`}</div>
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">{getInitials(member.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{member.full_name || "Unknown"}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {member.completedCount}/{member.totalAssigned} tasks
                        </span>
                        <Progress value={getCompletionRate(member)} className="h-1 w-16" />
                        <span className="text-[10px] text-muted-foreground tabular-nums">{getCompletionRate(member)}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Star className="h-3.5 w-3.5 text-accent fill-accent" />
                      <span className="tabular-nums text-sm font-medium">{member.avgRating || "—"}</span>
                      {member.ratingCount > 0 && <span className="text-[10px] text-muted-foreground">({member.ratingCount})</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {leaderboard.length === 0 && (
              <Card className="shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No performance data yet</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-center">Assigned</TableHead>
                    <TableHead className="text-center">Completed</TableHead>
                    <TableHead className="text-center">Rate</TableHead>
                    <TableHead className="text-center">Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px]">{getInitials(member.full_name)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium truncate">{member.full_name || "Unknown"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{member.department || "—"}</span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-sm">{member.totalAssigned}</TableCell>
                      <TableCell className="text-center tabular-nums text-sm">{member.completedCount}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className={`text-[10px] ${getCompletionRate(member) >= 80 ? "bg-success/10 text-success" : getCompletionRate(member) >= 50 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>
                          {getCompletionRate(member)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Star className="h-3 w-3 text-accent fill-accent" />
                          <span className="tabular-nums text-sm">{member.avgRating || "—"}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {leaderboard.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completionHistory.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px]">{getInitials(profiles[record.user_id] || null)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{profiles[record.user_id] || "Unknown"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{record.task_title}</p>
                          {record.task_description && <p className="text-xs text-muted-foreground line-clamp-1">{record.task_description}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] ${priorityColors[record.task_priority] || ""}`}>
                          {record.task_priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {record.was_group_task ? (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              Group ({record.group_members?.length || 0})
                            </span>
                          ) : (
                            "Individual"
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(record.completed_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {completionHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p>No completion history yet</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="ratings" className="mt-4">
            <Card className="shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Rated By</TableHead>
                      <TableHead className="text-center">Rating</TableHead>
                      <TableHead>Comment</TableHead>
                      <TableHead>Week</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ratings.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">{profiles[r.user_id] || "Unknown"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{profiles[r.rated_by] || "Unknown"}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Star className="h-3 w-3 text-accent fill-accent" />
                            <span className="tabular-nums text-sm font-medium">{r.rating}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{r.comment || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.week_start}</TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteRating(r.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {ratings.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No ratings yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default PerformancePage;
