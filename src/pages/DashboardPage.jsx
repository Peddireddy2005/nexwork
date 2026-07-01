import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckSquare, Clock, Users, TrendingUp, ListTodo, BarChart3, Activity, Target, AlertTriangle, ArrowRight, CalendarDays, Zap, UserCircle, FolderOpen, Plus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid } from "recharts";
import { useNavigate } from "react-router-dom";
import { NewClientWizard } from "@/components/clients/NewClientWizard";
import { AnnouncementsManager } from "@/components/AnnouncementsManager";

const DashboardPage = () => {
  const { role, user, profile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "admin" || role === "manager";
  const [showWizard, setShowWizard] = useState(false);

  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    todoTasks: 0,
    reviewTasks: 0,
    totalUsers: 0,
    overdueTasks: 0,
    totalClients: 0,
    activeProjects: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [tasksByPriority, setTasksByPriority] = useState([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);

  useEffect(() => {
    if (!user) return;

    const fetchAll = async () => {
      const taskQuery = isAdmin
        ? supabase.from("tasks").select("id, status, priority, deadline, title, assigned_to, updated_at, created_at")
        : supabase.from("tasks").select("id, status, priority, deadline, title, assigned_to, updated_at, created_at").eq("assigned_to", user.id);

      const { data: tasks } = await taskQuery;
      const allTasks = tasks || [];

      const totalTasks = allTasks.length;
      const completedTasks = allTasks.filter((t) => t.status === "completed").length;
      const inProgressTasks = allTasks.filter((t) => t.status === "in_progress").length;
      const todoTasks = allTasks.filter((t) => t.status === "todo").length;
      const reviewTasks = allTasks.filter((t) => t.status === "review").length;
      const overdueTasks = allTasks.filter((t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== "completed").length;

      const activeTasks = allTasks.filter((t) => t.status !== "completed");
      const priorityCounts = { low: 0, medium: 0, high: 0, urgent: 0 };
      activeTasks.forEach((t) => {
        if (t.priority in priorityCounts) priorityCounts[t.priority]++;
      });
      setTasksByPriority(
        [
          { name: "Low", value: priorityCounts.low, fill: "hsl(var(--muted-foreground))" },
          { name: "Medium", value: priorityCounts.medium, fill: "hsl(var(--info))" },
          { name: "High", value: priorityCounts.high, fill: "hsl(var(--warning))" },
          { name: "Urgent", value: priorityCounts.urgent, fill: "hsl(var(--destructive))" },
        ].filter((d) => d.value > 0)
      );

      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      setUpcomingDeadlines(
        activeTasks
          .filter((t) => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= in7Days)
          .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
          .slice(0, 5)
      );

      const weeks = [];
      for (let i = 3; i >= 0; i--) {
        const weekStart = new Date(now.getTime() - (i * 7 + now.getDay()) * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const created = allTasks.filter((t) => new Date(t.created_at) >= weekStart && new Date(t.created_at) < weekEnd).length;
        const completed = allTasks.filter((t) => t.status === "completed" && new Date(t.updated_at) >= weekStart && new Date(t.updated_at) < weekEnd).length;
        weeks.push({ week: `W${4 - i}`, label: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }), created, completed });
      }
      setWeeklyData(weeks);

      let totalUsers = 0;
      let totalClients = 0;
      let activeProjects = 0;

      if (isAdmin) {
        const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true });
        totalUsers = count || 0;

        const { count: clientCount } = await supabase.from("clients").select("*", { count: "exact", head: true });
        totalClients = clientCount || 0;

        const { count: projCount } = await supabase.from("client_projects").select("*", { count: "exact", head: true }).eq("status", "active");
        activeProjects = projCount || 0;
      }

      setStats({ totalTasks, completedTasks, inProgressTasks, todoTasks, reviewTasks, totalUsers, overdueTasks, totalClients, activeProjects });

      const recentQuery = isAdmin
        ? supabase.from("tasks").select("title, status, updated_at, priority").order("updated_at", { ascending: false }).limit(6)
        : supabase.from("tasks").select("title, status, updated_at, priority").eq("assigned_to", user.id).order("updated_at", { ascending: false }).limit(6);
      const { data: recent } = await recentQuery;
      setRecentActivity(recent || []);
    };

    fetchAll();
  }, [user, role]);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "there";

  const completionRate = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

  const statCards = [
    { title: "Total Tasks", value: stats.totalTasks, icon: ListTodo, color: "text-primary", bg: "bg-primary/10" },
    { title: "In Progress", value: stats.inProgressTasks, icon: Clock, color: "text-info", bg: "bg-info/10" },
    { title: "Completed", value: stats.completedTasks, icon: CheckSquare, color: "text-success", bg: "bg-success/10", trend: `${completionRate}%` },
    { title: "In Review", value: stats.reviewTasks, icon: TrendingUp, color: "text-warning", bg: "bg-warning/10" },
    ...(isAdmin
      ? [
          { title: "Clients", value: stats.totalClients, icon: UserCircle, color: "text-accent", bg: "bg-accent/10" },
          { title: "Active Projects", value: stats.activeProjects, icon: FolderOpen, color: "text-primary", bg: "bg-primary/10" },
        ]
      : []),
    ...(stats.overdueTasks > 0 ? [{ title: "Overdue", value: stats.overdueTasks, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" }] : []),
    ...(isAdmin && !stats.totalClients ? [{ title: "Team Members", value: stats.totalUsers, icon: Users, color: "text-accent", bg: "bg-accent/10" }] : []),
  ];

  const statusLabels = { todo: "To Do", in_progress: "In Progress", review: "Review", completed: "Completed" };
  const statusDot = { todo: "bg-muted-foreground", in_progress: "bg-info", review: "bg-warning", completed: "bg-success" };
  const priorityColor = { low: "text-muted-foreground", medium: "text-info", high: "text-warning", urgent: "text-destructive" };

  const statusChartData = [
    { name: "To Do", count: stats.todoTasks, fill: "hsl(var(--muted-foreground))" },
    { name: "In Progress", count: stats.inProgressTasks, fill: "hsl(var(--info))" },
    { name: "Review", count: stats.reviewTasks, fill: "hsl(var(--warning))" },
    { name: "Done", count: stats.completedTasks, fill: "hsl(var(--success))" },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Hey, {firstName} 👋</h1>
          <p className="text-muted-foreground mt-1 text-sm">{isAdmin ? "Your workspace & delivery overview" : "Your task overview for today"}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/projects")}>
            <FolderOpen className="h-4 w-4 mr-1.5" /> Projects
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/tasks")}>
            <CheckSquare className="h-4 w-4 mr-1.5" /> Tasks
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowWizard(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New Client
            </Button>
          )}
        </div>
      </div>
      <NewClientWizard open={showWizard} onOpenChange={setShowWizard} />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((card) => (
          <Card key={card.title} className="shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 cursor-default group">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{card.title}</span>
                <div className={`p-1.5 rounded-md ${card.bg} group-hover:scale-110 transition-transform`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold tabular-nums">{card.value}</span>
                {"trend" in card && card.trend && <span className="text-xs text-success font-medium mb-0.5">{card.trend}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" /> Tasks by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusChartData} barSize={28}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {statusChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" /> Weekly Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="created" stroke="hsl(var(--primary))" fill="url(#gradCreated)" name="Created" />
                  <Area type="monotone" dataKey="completed" stroke="hsl(var(--success))" fill="url(#gradCompleted)" name="Completed" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" /> Active Priority
              <Badge variant="secondary" className="text-[10px] ml-auto">
                Active only
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-40 flex items-center justify-center">
              {tasksByPriority.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={tasksByPriority} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value" nameKey="name">
                      {tasksByPriority.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">No active tasks</p>
              )}
            </div>
            {tasksByPriority.length > 0 && (
              <div className="flex justify-center gap-3 mt-1">
                {tasksByPriority.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="h-2 w-2 rounded-full" style={{ background: d.fill }} />
                    <span className="text-muted-foreground">
                      {d.name} ({d.value})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" /> Completion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.totalTasks > 0 ? (
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20">
                  <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="3"
                      strokeDasharray={`${completionRate}, 100`}
                      className="transition-all duration-700"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums">{completionRate}%</span>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-semibold text-success tabular-nums">{stats.completedTasks}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Remaining</span>
                    <span className="font-semibold tabular-nums">{stats.totalTasks - stats.completedTasks}</span>
                  </div>
                  {stats.overdueTasks > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-destructive">Overdue</span>
                      <span className="font-semibold text-destructive tabular-nums">{stats.overdueTasks}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">Create tasks to see metrics.</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" /> Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No upcoming deadlines this week.</p>
            ) : (
              <div className="space-y-2.5">
                {upcomingDeadlines.map((task, i) => {
                  const daysLeft = Math.ceil((new Date(task.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={i} className="flex items-center gap-3 group cursor-pointer hover:bg-muted/50 rounded-md p-1.5 -mx-1.5 transition-colors" onClick={() => navigate("/tasks")}>
                      <div className={`h-2 w-2 rounded-full shrink-0 ${daysLeft <= 1 ? "bg-destructive animate-pulse" : daysLeft <= 3 ? "bg-warning" : "bg-info"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{task.title}</p>
                        <p className="text-[10px] text-muted-foreground">{daysLeft <= 0 ? "Due today" : daysLeft === 1 ? "Due tomorrow" : `${daysLeft} days left`}</p>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] ${priorityColor[task.priority]}`}>
                        {task.priority}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isAdmin && <AnnouncementsManager />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No recent activity.</p>
            ) : (
              <div className="space-y-2.5">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 group cursor-pointer hover:bg-muted/50 rounded-md p-1.5 -mx-1.5 transition-colors" onClick={() => navigate("/tasks")}>
                    <div className={`h-2 w-2 rounded-full shrink-0 ${statusDot[item.status] || "bg-muted"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {statusLabels[item.status] || item.status} · {new Date(item.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
