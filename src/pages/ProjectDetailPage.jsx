import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Calendar, Sparkles, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { ProjectKanban } from "@/components/projects/ProjectKanban";
import { ProjectAIPanel } from "@/components/projects/ProjectAIPanel";
import { ProjectAutomations } from "@/components/projects/ProjectAutomations";

const statusVariants = {
  active: "bg-success/10 text-success border-success/20",
  on_hold: "bg-warning/10 text-warning border-warning/20",
  in_review: "bg-info/10 text-info border-info/20",
  completed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [project, setProject] = useState(null);
  const [client, setClient] = useState(null);
  const [members, setMembers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = role === "admin" || role === "manager";
  const canEdit = isAdmin || project?.owner_id === user?.id;

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: p, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
    if (error || !p) {
      setLoading(false);
      return;
    }
    setProject(p);

    if (p.client_id) {
      const { data: c } = await supabase.from("clients").select("*").eq("id", p.client_id).maybeSingle();
      setClient(c);
    }

    const { data: mem } = await supabase.from("project_members").select("*").eq("project_id", id);
    if (mem && mem.length > 0) {
      const userIds = mem.map((m) => m.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds);
      setMembers(
        (profiles || []).map((pr) => ({
          ...pr,
          role: mem.find((m) => m.user_id === pr.id)?.role || "member",
        }))
      );
    } else {
      setMembers([]);
    }

    const { data: acts } = await supabase.from("activity_logs").select("*").eq("entity_id", id).order("created_at", { ascending: false }).limit(20);
    setActivity(acts || []);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const updateStatus = async (newStatus) => {
    if (!project) return;
    const { error } = await supabase.from("projects").update({ status: newStatus }).eq("id", project.id);
    if (error) {
      toast.error("Failed to update status");
      return;
    }
    toast.success("Status updated");
    load();
  };

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );

  if (!project)
    return (
      <div className="text-center py-16 space-y-3">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/40" />
        <p className="text-muted-foreground">Project not found</p>
        <Button variant="outline" onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
      </div>
    );

  const days = project.deadline ? Math.ceil((new Date(project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Projects
      </Button>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{project.name}</h1>
                <Badge variant="outline" className={statusVariants[project.status]}>
                  {project.status.replace("_", " ")}
                </Badge>
              </div>
              {client && (
                <Link to="/clients" className="text-sm text-muted-foreground hover:text-primary mt-1 inline-block">
                  Client: <span className="font-medium">{client.name}</span>
                </Link>
              )}
              {project.description && <p className="text-sm text-muted-foreground mt-2">{project.description}</p>}
            </div>
            {canEdit && project.status !== "cancelled" && (
              <Select value={project.status} onValueChange={updateStatus}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Progress</p>
              <div className="flex items-center gap-2">
                <Progress value={project.progress} className="h-2 flex-1" />
                <span className="text-sm font-bold tabular-nums">{project.progress}%</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Deadline</p>
              <div className="flex items-center gap-1.5 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {project.deadline ? (
                  <span className={days !== null && days < 0 ? "text-destructive font-medium" : days !== null && days < 7 ? "text-warning font-medium" : ""}>
                    {new Date(project.deadline).toLocaleDateString()}
                    {days !== null && <span className="text-xs ml-2 text-muted-foreground">({days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`})</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No deadline</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Team ({members.length})</p>
              <div className="flex -space-x-2">
                {members.slice(0, 5).map((m) => (
                  <Avatar key={m.id} className="h-7 w-7 border-2 border-background" title={m.full_name}>
                    {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                    <AvatarFallback className="text-[10px]">{(m.full_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback>
                  </Avatar>
                ))}
                {members.length === 0 && <span className="text-xs text-muted-foreground">No members yet</span>}
              </div>
            </div>
          </div>

          {project.service_types?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {project.service_types.map((s) => (
                <Badge key={s} variant="secondary" className="text-[10px]">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="ai">AI Panel</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <ProjectKanban projectId={project.id} canEdit={canEdit} onProjectChange={load} />
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="p-4">
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p>
              ) : (
                <ul className="space-y-2">
                  {activity.map((a) => (
                    <li key={a.id} className="text-sm flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-medium">{a.action.replace(/_/g, " ")}</span>
                        {a.metadata && Object.keys(a.metadata).length > 0 && <span className="text-muted-foreground"> · {JSON.stringify(a.metadata).slice(0, 80)}</span>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{new Date(a.created_at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation">
          <ProjectAutomations projectId={project.id} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="ai">
          <ProjectAIPanel projectId={project.id} projectName={project.name} serviceTypes={project.service_types || []} onTasksCreated={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
