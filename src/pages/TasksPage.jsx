import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, MessageSquare, Paperclip, Send, GripVertical, LayoutGrid, List, Upload, Users, Download, FolderOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const STATUSES = ["todo", "in_progress", "review", "completed"];
const statusLabels = { todo: "To Do", in_progress: "In Progress", review: "Review", completed: "Completed" };
const priorityColors = { low: "bg-muted text-muted-foreground", medium: "bg-info/10 text-info", high: "bg-warning/10 text-warning", urgent: "bg-destructive/10 text-destructive" };
const statusColors = { todo: "bg-muted text-muted-foreground", in_progress: "bg-info/10 text-info", review: "bg-warning/10 text-warning", completed: "bg-success/10 text-success" };
const statusColumnColors = { todo: "border-t-muted-foreground/30", in_progress: "border-t-info/60", review: "border-t-warning/60", completed: "border-t-success/60" };

const TasksPage = () => {
  const { user, role } = useAuth();
  const isAdminOrManager = role === "admin" || role === "manager";
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTask, setDetailTask] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [editingTask, setEditingTask] = useState(null);
  const [viewMode, setViewMode] = useState("kanban");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [taskAssignees, setTaskAssignees] = useState({});

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const [deadline, setDeadline] = useState("");

  const fetchTasks = useCallback(async () => {
    let query = supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (filterStatus !== "all") query = query.eq("status", filterStatus);
    if (filterPriority !== "all") query = query.eq("priority", filterPriority);
    const { data } = await query;
    setTasks(data || []);
  }, [filterStatus, filterPriority]);

  const fetchProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, full_name");
    setProfiles(data || []);
  };

  const fetchAllAssignees = async () => {
    const { data } = await supabase.from("task_assignees").select("*");
    const map = {};
    (data || []).forEach((a) => {
      if (!map[a.task_id]) map[a.task_id] = [];
      map[a.task_id].push(a.user_id);
    });
    setTaskAssignees(map);
  };

  useEffect(() => {
    fetchTasks();
    fetchProfiles();
    fetchAllAssignees();
  }, [fetchTasks]);

  const fetchComments = async (taskId) => {
    const { data } = await supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at", { ascending: true });
    setComments(data || []);
  };

  const fetchAttachments = async (taskId) => {
    const { data } = await supabase.from("task_attachments").select("*").eq("task_id", taskId).order("created_at", { ascending: false });
    const resolved = await Promise.all(
      (data || []).map(async (a) => {
        const { data: signed } = await supabase.storage.from("task-attachments").createSignedUrl(a.file_url, 3600);
        return { id: a.id, name: a.file_name, url: signed?.signedUrl || "" };
      })
    );
    setAttachments(resolved);
  };

  const openDetail = (task) => {
    setDetailTask(task);
    fetchComments(task.id);
    fetchAttachments(task.id);
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setStatus("todo");
    setSelectedAssignees([]);
    setDeadline("");
    setEditingTask(null);
  };

  const openEdit = (task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description || "");
    setPriority(task.priority);
    setStatus(task.status);
    setSelectedAssignees(taskAssignees[task.id] || []);
    setDeadline(task.deadline ? task.deadline.split("T")[0] : "");
    setDialogOpen(true);
  };

  const toggleAssignee = (userId) => {
    setSelectedAssignees((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    const taskData = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      assigned_to: selectedAssignees[0] || null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    };

    let taskId;

    if (editingTask) {
      const { error } = await supabase.from("tasks").update(taskData).eq("id", editingTask.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      taskId = editingTask.id;
      await supabase.from("task_assignees").delete().eq("task_id", taskId);
      toast.success("Task updated");
    } else {
      const { data, error } = await supabase.from("tasks").insert({ ...taskData, created_by: user.id }).select().single();
      if (error) {
        toast.error(error.message);
        return;
      }
      taskId = data.id;
      toast.success("Task created");
    }

    if (selectedAssignees.length > 0) {
      await supabase.from("task_assignees").insert(selectedAssignees.map((uid) => ({ task_id: taskId, user_id: uid })));
    }

    setDialogOpen(false);
    resetForm();
    fetchTasks();
    fetchAllAssignees();
  };

  const deleteTask = async (task) => {
    setDeleting(true);
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) {
      setDeleting(false);
      toast.error(error.message);
      return;
    }
    if (user) {
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action: "task_deleted",
        entity_type: "task",
        entity_id: task.id,
        metadata: { title: task.title, status: task.status, priority: task.priority },
      });
    }
    setDeleting(false);
    toast.success("Task deleted");
    setDeleteConfirm(null);
    setDetailTask(null);
    fetchTasks();
    fetchAllAssignees();
  };

  const canDeleteTask = (task) => isAdminOrManager || task.created_by === user?.id;

  const updateTaskStatus = async (taskId, newStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Status updated to ${statusLabels[newStatus]}`);

    if (newStatus === "completed") {
      const assignees = taskAssignees[taskId] || [];
      const allMembers = task.assigned_to ? [...new Set([task.assigned_to, ...assignees])] : assignees;
      const isGroup = allMembers.length > 1;

      if (allMembers.length > 0) {
        const historyRecords = allMembers.map((uid) => ({
          task_id: taskId,
          task_title: task.title,
          task_description: task.description || null,
          task_priority: task.priority,
          user_id: uid,
          was_group_task: isGroup,
          group_members: allMembers,
        }));
        await supabase.from("task_completion_history").insert(historyRecords);
      }

      await supabase.from("task_assignees").delete().eq("task_id", taskId);
      await supabase.from("tasks").update({ assigned_to: null }).eq("id", taskId);
      fetchAllAssignees();
    }

    fetchTasks();
    if (detailTask?.id === taskId) {
      setDetailTask((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  const isAssignedToUser = (taskId) => {
    if (!user) return false;
    const assignees = taskAssignees[taskId] || [];
    return assignees.includes(user.id);
  };

  const canEditTask = (task) => {
    return isAdminOrManager || task.created_by === user?.id || isAssignedToUser(task.id);
  };

  const addComment = async () => {
    if (!user || !detailTask || !newComment.trim()) return;
    const { error } = await supabase.from("task_comments").insert({ task_id: detailTask.id, user_id: user.id, content: newComment.trim() });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewComment("");
    fetchComments(detailTask.id);
  };

  const handleFileUpload = async (e) => {
    if (!detailTask || !e.target.files?.[0]) return;
    setUploading(true);
    const file = e.target.files[0];
    const path = `${detailTask.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, file);
    if (upErr) {
      toast.error(upErr.message);
      setUploading(false);
      return;
    }
    const { error: insErr } = await supabase.from("task_attachments").insert({
      task_id: detailTask.id,
      file_name: file.name,
      file_url: path,
      file_type: file.type || null,
      file_size: file.size,
      uploaded_by: user.id,
    });
    if (insErr) toast.error(insErr.message);
    else {
      toast.success("File uploaded");
      fetchAttachments(detailTask.id);
    }
    setUploading(false);
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    if (!canEditTask(task)) {
      toast.error("You don't have permission to update this task");
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
    if (error) {
      toast.error(error.message);
      fetchTasks();
    }
  };

  const getProfileName = (id) => {
    if (!id) return "Unassigned";
    return profiles.find((p) => p.id === id)?.full_name || "Unknown";
  };

  const getInitials = (name) => (name ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "??");

  const getAssigneeNames = (taskId) => {
    const assignees = taskAssignees[taskId] || [];
    if (assignees.length === 0) return "Unassigned";
    return assignees.map((id) => getProfileName(id)).join(", ");
  };

  const filteredTasks = tasks;
  const tasksByStatus = STATUSES.reduce((acc, s) => {
    acc[s] = filteredTasks.filter((t) => t.status === s);
    return acc;
  }, {});

  const renderAssigneeAvatars = (taskId) => {
    const assignees = taskAssignees[taskId] || [];
    if (assignees.length === 0) {
      return (
        <div className="flex items-center gap-1.5">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[8px]">??</AvatarFallback>
          </Avatar>
          <span className="text-[11px] text-muted-foreground">Unassigned</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <div className="flex -space-x-1.5">
          {assignees.slice(0, 3).map((uid) => (
            <Avatar key={uid} className="h-5 w-5 border-2 border-background">
              <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{getInitials(getProfileName(uid) === "Unassigned" ? null : getProfileName(uid))}</AvatarFallback>
            </Avatar>
          ))}
        </div>
        {assignees.length > 3 && <span className="text-[10px] text-muted-foreground ml-1">+{assignees.length - 3}</span>}
        {assignees.length <= 2 && <span className="text-[11px] text-muted-foreground ml-1 truncate max-w-[80px]">{assignees.map((id) => getProfileName(id)).join(", ")}</span>}
      </div>
    );
  };

  const renderTaskCard = (task, index, draggable = true) => {
    const inner = (
      <Card className="shadow-sm hover:shadow-md transition-[box-shadow] cursor-pointer active:scale-[0.98] border border-border/50" onClick={() => openDetail(task)}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm leading-tight line-clamp-2 flex-1">{task.title}</h3>
            <div className="flex items-center gap-1 shrink-0">
              {canDeleteTask(task) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(task);
                  }}
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive transition-colors"
                  aria-label="Delete task"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {draggable && <GripVertical className="h-4 w-4 text-muted-foreground/40" />}
            </div>
          </div>
          {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${priorityColors[task.priority]}`}>
              {task.priority}
            </Badge>
            {task.deadline && <span className="text-[10px] text-muted-foreground">Due {new Date(task.deadline).toLocaleDateString()}</span>}
          </div>
          <div className="pt-1">{renderAssigneeAvatars(task.id)}</div>
        </CardContent>
      </Card>
    );
    if (!draggable) return <div key={task.id}>{inner}</div>;
    return (
      <Draggable key={task.id} draggableId={task.id} index={index}>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className="mb-2">
            {inner}
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ lineHeight: "1.2" }}>
            Tasks
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{tasks.length} tasks total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button onClick={() => setViewMode("kanban")} className={`p-2 transition-colors ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("list")} className={`p-2 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportToCsv(
                "tasks",
                tasks.map((t) => ({
                  Title: t.title,
                  Status: statusLabels[t.status] || t.status,
                  Priority: t.priority,
                  Assignees: getAssigneeNames(t.id),
                  Deadline: t.deadline || "",
                  Description: t.description || "",
                  Created: new Date(t.created_at).toISOString().split("T")[0],
                }))
              )
            }
          >
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingTask ? "Edit Task" : "Create Task"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe the task..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {statusLabels[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Assign To
                    <span className="text-xs text-muted-foreground font-normal">(optional, multiple)</span>
                  </Label>
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {profiles.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer">
                        <Checkbox checked={selectedAssignees.includes(p.id)} onCheckedChange={() => toggleAssignee(p.id)} />
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{getInitials(p.full_name)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{p.full_name || "Unknown"}</span>
                      </label>
                    ))}
                  </div>
                  {selectedAssignees.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedAssignees.length} member{selectedAssignees.length > 1 ? "s" : ""} selected
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Deadline</Label>
                  <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                </div>
                <Button type="submit" className="w-full">
                  {editingTask ? "Update" : "Create"} Task
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {viewMode === "kanban" ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STATUSES.map((s) => (
              <div key={s} className={`rounded-lg bg-muted/40 border-t-2 ${statusColumnColors[s]} p-3 min-h-[200px]`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">{statusLabels[s]}</h3>
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {tasksByStatus[s].length}
                  </Badge>
                </div>
                <Droppable droppableId={s}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-[120px] rounded-md transition-colors ${snapshot.isDraggingOver ? "bg-primary/5" : ""}`}>
                      {tasksByStatus[s].map((task, idx) => renderTaskCard(task, idx))}
                      {provided.placeholder}
                      {tasksByStatus[s].length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No tasks</p>}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      ) : (
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No tasks found. Create your first task.</p>
              </CardContent>
            </Card>
          ) : (
            tasks.map((task) => (
              <Card key={task.id} className="shadow-sm hover:shadow-md transition-[box-shadow] cursor-pointer active:scale-[0.99]" onClick={() => openDetail(task)}>
                <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{task.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {getAssigneeNames(task.id)} {task.deadline && `· Due ${new Date(task.deadline).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className={`text-[10px] ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </Badge>
                    <Badge variant="secondary" className={`text-[10px] ${statusColors[task.status]}`}>
                      {statusLabels[task.status]}
                    </Badge>
                    {canDeleteTask(task) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(task);
                        }}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Delete task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Dialog open={!!detailTask} onOpenChange={(open) => { if (!open) setDetailTask(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          {detailTask && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{detailTask.title}</DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-4 pb-4">
                  {detailTask.description && <p className="text-sm text-muted-foreground">{detailTask.description}</p>}
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary" className={priorityColors[detailTask.priority]}>
                      {detailTask.priority}
                    </Badge>
                    <Badge variant="secondary" className={statusColors[detailTask.status]}>
                      {statusLabels[detailTask.status]}
                    </Badge>
                  </div>

                  {canEditTask(detailTask) && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Update Status</Label>
                      <Select value={detailTask.status} onValueChange={(v) => updateTaskStatus(detailTask.id, v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {statusLabels[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Assigned:</span>
                      <span className="font-medium">{getAssigneeNames(detailTask.id)}</span>
                    </div>
                    {(taskAssignees[detailTask.id]?.length || 0) > 0 && (
                      <div className="flex -space-x-1.5 ml-6">
                        {(taskAssignees[detailTask.id] || []).map((uid) => (
                          <Avatar key={uid} className="h-6 w-6 border-2 border-background">
                            <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{getInitials(getProfileName(uid))}</AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                    )}
                    {detailTask.deadline && (
                      <div>
                        <span className="text-muted-foreground">Deadline:</span> <span className="font-medium">{new Date(detailTask.deadline).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/tasks/${detailTask.id}/documents`}>
                        <FolderOpen className="h-3 w-3 mr-1" />
                        Documents
                      </Link>
                    </Button>
                    {(isAdminOrManager || detailTask.created_by === user?.id) && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openEdit(detailTask)}>
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm(detailTask)}>
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5" />
                        Attachments
                      </h4>
                      <label className="cursor-pointer">
                        <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                        <Button variant="ghost" size="sm" asChild disabled={uploading}>
                          <span>
                            <Upload className="h-3 w-3 mr-1" />
                            {uploading ? "Uploading..." : "Upload"}
                          </span>
                        </Button>
                      </label>
                    </div>
                    {attachments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No attachments</p>
                    ) : (
                      <div className="space-y-1">
                        {attachments.map((a) => (
                          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block text-xs text-primary hover:underline truncate">
                            {a.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Comments
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {comments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No comments yet</p>
                      ) : (
                        comments.map((c) => (
                          <div key={c.id} className="bg-muted/50 rounded-md p-2.5">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium">{getProfileName(c.user_id)}</span>
                              <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                            </div>
                            <p className="text-sm">{c.content}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="flex-1 h-9"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            addComment();
                          }
                        }}
                      />
                      <Button size="sm" onClick={addComment} disabled={!newComment.trim()}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold text-foreground">{deleteConfirm?.title}</span>, along with its comments and attachments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && deleteTask(deleteConfirm)} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TasksPage;