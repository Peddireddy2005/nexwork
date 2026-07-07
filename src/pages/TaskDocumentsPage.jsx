import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, FileText, Download, Trash2, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const formatBytes = (bytes) => {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const TaskDocumentsPage = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [task, setTask] = useState(null);
  const [projectName, setProjectName] = useState(null);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const canAccess = !!user && !!task && (isAdmin || isManager || task.created_by === user.id || task.assigned_to === user.id || assigneeIds.includes(user.id));

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    const { data: t } = await supabase.from("tasks").select("id,title,status,project_id,created_by,assigned_to").eq("id", taskId).maybeSingle();
    if (!t) {
      setLoading(false);
      return;
    }
    setTask(t);
    if (t.project_id) {
      const { data: p } = await supabase.from("projects").select("name").eq("id", t.project_id).maybeSingle();
      setProjectName(p?.name ?? null);
    }
    const { data: ta } = await supabase.from("task_assignees").select("user_id").eq("task_id", taskId);
    setAssigneeIds((ta || []).map((r) => r.user_id));
    const { data: att } = await supabase.from("task_attachments").select("*").eq("task_id", taskId).order("created_at", { ascending: false });
    setAttachments(att || []);
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  // Resolve signed URLs for private-bucket attachments
  useEffect(() => {
    const resolve = async () => {
      const updates = {};
      for (const a of attachments) {
        if (!signedUrls[a.id]) {
          const { data } = await supabase.storage.from("task-attachments").createSignedUrl(a.file_url, 3600);
          if (data?.signedUrl) updates[a.id] = data.signedUrl;
        }
      }
      if (Object.keys(updates).length > 0) setSignedUrls((prev) => ({ ...prev, ...updates }));
    };
    if (attachments.length > 0) resolve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments]);

  const handleFiles = async (files) => {
    if (!user || !task) return;
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    let ok = 0,
      fail = 0;
    for (const file of arr) {
      try {
        const path = `${task.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const up = await supabase.storage.from("task-attachments").upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        const ins = await supabase.from("task_attachments").insert({
          task_id: task.id,
          file_name: file.name,
          file_url: path, // storage path — bucket is private
          file_type: file.type || null,
          file_size: file.size,
          uploaded_by: user.id,
        });
        if (ins.error) throw ins.error;
        ok++;
      } catch (e) {
        fail++;
        console.error(e);
      }
    }
    setUploading(false);
    if (ok) toast.success(`${ok} file${ok === 1 ? "" : "s"} uploaded`);
    if (fail) toast.error(`${fail} file${fail === 1 ? "" : "s"} failed`);
    load();
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const removeAttachment = async (a) => {
    if (!user) return;
    if (!confirm(`Delete "${a.file_name}"?`)) return;
    const { error } = await supabase.from("task_attachments").delete().eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.storage.from("task-attachments").remove([a.file_url]);
    toast.success("Deleted");
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!task) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <h2 className="text-2xl font-semibold">Task not found</h2>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go back
        </Button>
      </div>
    );
  }
  if (!canAccess) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <h2 className="text-2xl font-semibold">Access denied</h2>
        <p className="text-muted-foreground">You aren't assigned to this task.</p>
        <Button variant="outline" onClick={() => navigate("/tasks")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to tasks
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up max-w-4xl mx-auto">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/tasks" className="hover:text-foreground">
          Tasks
        </Link>
        {task.project_id && projectName && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link to={`/projects/${task.project_id}`} className="hover:text-foreground">
              {projectName}
            </Link>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground truncate max-w-[260px]">{task.title}</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>Documents</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="capitalize">
              {task.status.replace("_", " ")}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {attachments.length} file{attachments.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Drop files here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Anything attached here will be linked to this task.</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          </div>
          {uploading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attached files</CardTitle>
        </CardHeader>
        <CardContent>
          {attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No documents uploaded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {attachments.map((a) => {
                const canDelete = isAdmin || a.uploaded_by === user.id;
                return (
                  <li key={a.id} className="flex items-center gap-3 py-3">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{a.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(a.file_size)} · {new Date(a.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="ghost">
                      <a href={signedUrls[a.id] || "#"} target="_blank" rel="noreferrer" download>
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    {canDelete && (
                      <Button size="sm" variant="ghost" onClick={() => removeAttachment(a)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TaskDocumentsPage;