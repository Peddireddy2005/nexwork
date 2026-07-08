import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderKanban, Plus, Search, Calendar, ArrowRight, Briefcase, Download, Trash2, CheckSquare, X } from "lucide-react";
import { NewClientWizard } from "@/components/clients/NewClientWizard";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";

const statusVariants = {
  active: "bg-success/10 text-success border-success/20",
  on_hold: "bg-warning/10 text-warning border-warning/20",
  in_review: "bg-info/10 text-info border-info/20",
  completed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabels = {
  active: "Active",
  on_hold: "On Hold",
  in_review: "In Review",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showWizard, setShowWizard] = useState(false);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const isAdmin = role === "admin";
  const canManage = role === "admin" || role === "manager";

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    const { data: cls } = await supabase.from("clients").select("id, name");
    const map = {};
    (cls || []).forEach((c) => {
      map[c.id] = c.name;
    });
    setClients(map);
    setProjects(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const filtered = projects.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const daysUntil = (date) => {
    if (!date) return null;
    const diff = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const exportProjects = () => {
    exportToCsv(
      "projects",
      filtered.map((p) => ({
        Name: p.name,
        Client: p.client_id ? clients[p.client_id] || "" : "",
        Status: statusLabels[p.status] || p.status,
        Progress: `${p.progress}%`,
        "Service Types": (p.service_types || []).join("; "),
        Tags: (p.tags || []).join("; "),
        "Start Date": p.start_date || "",
        Deadline: p.deadline || "",
        Description: p.description || "",
        Created: new Date(p.created_at).toISOString().split("T")[0],
      }))
    );
  };

  const logDeletions = async (items) => {
    if (!user || items.length === 0) return;
    await supabase.from("activity_logs").insert(
      items.map((p) => ({
        user_id: user.id,
        action: "project_deleted",
        entity_type: "project",
        entity_id: p.id,
        metadata: { name: p.name, client_id: p.client_id },
      }))
    );
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const target = deleteTarget;
    const { error } = await supabase.from("projects").delete().eq("id", target.id);
    if (error) {
      setDeleting(false);
      toast.error(error.message);
      return;
    }
    await logDeletions([target]);
    setDeleting(false);
    toast.success(`Deleted "${target.name}"`);
    setDeleteTarget(null);
    load();
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectedProjects = filtered.filter((p) => selectedIds.has(p.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const exportSelected = () => {
    exportToCsv(
      "projects-selected",
      selectedProjects.map((p) => ({
        Name: p.name,
        Client: p.client_id ? clients[p.client_id] || "" : "",
        Status: statusLabels[p.status] || p.status,
        Progress: `${p.progress}%`,
        "Service Types": (p.service_types || []).join("; "),
        Tags: (p.tags || []).join("; "),
        "Start Date": p.start_date || "",
        Deadline: p.deadline || "",
        Description: p.description || "",
        Created: new Date(p.created_at).toISOString().split("T")[0],
      }))
    );
  };

  const handleBulkDelete = async () => {
    if (selectedProjects.length === 0) return;
    setDeleting(true);
    const ids = selectedProjects.map((p) => p.id);
    const { error } = await supabase.from("projects").delete().in("id", ids);
    if (error) {
      setDeleting(false);
      toast.error(error.message);
      return;
    }
    await logDeletions(selectedProjects);
    setDeleting(false);
    toast.success(`Deleted ${ids.length} project${ids.length === 1 ? "" : "s"}`);
    setBulkDeleteOpen(false);
    exitSelectMode();
    load();
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" /> Projects
          </h1>
          <p className="text-sm text-muted-foreground">Client delivery engine — every client = one project.</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && filtered.length > 0 &&
            (selectMode ? (
              <Button variant="outline" size="sm" onClick={exitSelectMode}>
                <X className="h-4 w-4 mr-1.5" /> Cancel
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
                <CheckSquare className="h-4 w-4 mr-1.5" /> Select
              </Button>
            ))}
          {canManage && !selectMode && (
            <Button variant="outline" size="sm" onClick={() => exportProjects()}>
              <Download className="h-4 w-4 mr-1.5" /> Export CSV
            </Button>
          )}
          {canManage && !selectMode && (
            <Button variant="outline" onClick={() => setShowProjectDialog(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New Project
            </Button>
          )} 
          {isAdmin && !selectMode && (
            <Button onClick={() => setShowWizard(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New Client
            </Button>
          )}
        </div>
      </div>

      {selectMode && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (allFilteredSelected) setSelectedIds(new Set());
              else setSelectedIds(new Set(filtered.map((p) => p.id)));
            }}
          >
            {allFilteredSelected ? "Clear" : "Select all"}
          </Button>
          <div className="flex-1" />
          {canManage && (
            <Button variant="outline" size="sm" disabled={selectedIds.size === 0} onClick={exportSelected}>
              <Download className="h-4 w-4 mr-1.5" /> Export selected
            </Button>
          )}
          {isAdmin && (
            <Button variant="destructive" size="sm" disabled={selectedIds.size === 0} onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete selected
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {["all", "active", "on_hold", "in_review", "completed", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-accent"}`}
            >
              {s === "all" ? "All" : statusLabels[s]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <Briefcase className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-foreground">No projects yet</p>
              <p className="text-sm text-muted-foreground">{isAdmin ? "Create a client to auto-launch a project." : "Projects assigned to you will appear here."}</p>
            </div>
            {isAdmin && (
              <Button onClick={() => setShowWizard(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> New Client
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const days = daysUntil(p.deadline);
            return (
              <Card
                key={p.id}
                className={`hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group ${selectedIds.has(p.id) ? "ring-2 ring-primary" : ""}`}
                onClick={() => (selectMode ? toggleSelect(p.id) : navigate(`/projects/${p.id}`))}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    {selectMode && <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} onClick={(e) => e.stopPropagation()} className="mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate group-hover:text-primary transition-colors">{p.name}</h3>
                      {p.client_id && clients[p.client_id] && <p className="text-xs text-muted-foreground truncate">{clients[p.client_id]}</p>}
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${statusVariants[p.status]}`}>
                      {statusLabels[p.status]}
                    </Badge>
                  </div>

                  {p.service_types && p.service_types.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.service_types.slice(0, 3).map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px] py-0">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium tabular-nums">{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} className="h-1.5" />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    {p.deadline ? (
                      <div className={`flex items-center gap-1 ${days !== null && days < 0 ? "text-destructive" : days !== null && days < 7 ? "text-warning" : "text-muted-foreground"}`}>
                        <Calendar className="h-3 w-3" />
                        {days !== null && days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : days !== null ? `${days}d left` : "No deadline"}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No deadline</span>
                    )}
                    <div className="flex items-center gap-1.5">
                      <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(p);
                          }}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Delete project"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NewClientWizard open={showWizard} onOpenChange={setShowWizard} onCreated={load} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold text-foreground">{deleteTarget?.name}</span> and all its tasks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} project{selectedIds.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the selected projects and all their tasks. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
