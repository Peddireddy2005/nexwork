import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ListTodo, MessageSquare, Paperclip, Plus, Trash2, Upload, X, Calendar, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export function TaskDrawer({ taskId, open, onOpenChange, canEdit, onChange }) {
  const { user } = useAuth();
  const [task, setTask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [newSub, setNewSub] = useState("");
  const [newChk, setNewChk] = useState("");
  const [newComment, setNewComment] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [allProfiles, setAllProfiles] = useState([]);
  const fileRef = useRef(null);
  const commentRef = useRef(null);

  const load = async () => {
    if (!taskId) return;
    const [t, subs, chk, com, att, profs] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).maybeSingle(),
      supabase.from("tasks").select("*").eq("parent_task_id", taskId).order("created_at"),
      supabase.from("checklists").select("*, checklist_items(*)").eq("task_id", taskId),
      supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at"),
      supabase.from("task_attachments").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, avatar_url"),
    ]);
    setTask(t.data);
    setSubtasks(subs.data || []);
    setChecklist((chk.data || [])[0]?.checklist_items?.sort((a, b) => a.order_index - b.order_index) || []);
    setComments(com.data || []);
    setAttachments(att.data || []);
    setAllProfiles(profs.data || []);
    const map = {};
    (profs.data || []).forEach((p) => {
      map[p.id] = p;
    });
    setProfiles(map);
  };

  useEffect(() => {
    if (open && taskId) load();
  }, [open, taskId]);

  useEffect(() => {
    if (!taskId || !open) return;
    const ch = supabase
      .channel(`task-${taskId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_attachments", filter: `task_id=eq.${taskId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [taskId, open]);

  const updateField = async (patch) => {
    if (!task) return;
    setTask({ ...task, ...patch });
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    if (error) toast.error(error.message);
    else onChange?.();
  };

  const addSubtask = async () => {
    if (!newSub.trim() || !user || !task) return;
    const { error } = await supabase.from("tasks").insert({
      title: newSub,
      created_by: user.id,
      parent_task_id: task.id,
      project_id: task.project_id,
      status: "todo",
      priority: "medium",
    });
    if (error) return toast.error(error.message);
    setNewSub("");
    load();
  };

  const toggleSubtask = async (s) => {
    const next = s.status === "completed" ? "todo" : "completed";
    await supabase.from("tasks").update({ status: next }).eq("id", s.id);
    load();
    onChange?.();
  };

  const ensureChecklist = async () => {
    if (!task) return null;
    const existing = await supabase.from("checklists").select("id").eq("task_id", task.id).maybeSingle();
    if (existing.data?.id) return existing.data.id;
    const created = await supabase.from("checklists").insert({ task_id: task.id, title: "Checklist" }).select("id").single();
    return created.data?.id;
  };

  const addChecklistItem = async () => {
    if (!newChk.trim()) return;
    const cid = await ensureChecklist();
    if (!cid) return;
    const { error } = await supabase.from("checklist_items").insert({
      checklist_id: cid,
      title: newChk,
      order_index: checklist.length,
    });
    if (error) return toast.error(error.message);
    setNewChk("");
    load();
  };

  const toggleChk = async (item) => {
    await supabase.from("checklist_items").update({ completed: !item.completed }).eq("id", item.id);
    load();
  };

  const removeChk = async (id) => {
    await supabase.from("checklist_items").delete().eq("id", id);
    load();
  };

  const onCommentChange = (v) => {
    setNewComment(v);
    const caret = commentRef.current?.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/@([\w-]*)$/);
    if (m) {
      setMentionQuery(m[1].toLowerCase());
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (p) => {
    const handle = (p.full_name || "user").replace(/\s+/g, "_");
    const caret = commentRef.current?.selectionStart ?? newComment.length;
    const before = newComment.slice(0, caret).replace(/@([\w-]*)$/, `@${handle} `);
    const after = newComment.slice(caret);
    setNewComment(before + after);
    setMentionOpen(false);
    commentRef.current?.focus();
  };

  const sendComment = async () => {
    if (!newComment.trim() || !user || !task) return;
    const { error } = await supabase.from("task_comments").insert({
      task_id: task.id,
      user_id: user.id,
      content: newComment,
    });
    if (error) return toast.error(error.message);
    setNewComment("");
    setMentionOpen(false);
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user || !task) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Max 10MB per file");
    const path = `${task.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("task-files").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const { data: pub } = supabase.storage.from("task-files").getPublicUrl(path);
    const { error } = await supabase.from("task_attachments").insert({
      task_id: task.id,
      file_name: file.name,
      file_url: pub.publicUrl,
      file_type: file.type,
      file_size: file.size,
      uploaded_by: user.id,
    });
    if (error) toast.error(error.message);
    else toast.success("File attached");
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  const removeAttachment = async (id) => {
    await supabase.from("task_attachments").delete().eq("id", id);
    load();
  };

  const filteredMentions = mentionOpen ? allProfiles.filter((p) => (p.full_name || "").toLowerCase().includes(mentionQuery)).slice(0, 6) : [];

  const subDone = subtasks.filter((s) => s.status === "completed").length;
  const chkDone = checklist.filter((c) => c.completed).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl glass-strong p-0 overflow-y-auto">
        {!task ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader className="p-6 pb-3 sticky top-0 z-10 glass-strong border-b">
              <SheetTitle className="text-xl pr-8">
                <Input
                  value={task.title}
                  disabled={!canEdit}
                  onChange={(e) => setTask({ ...task, title: e.target.value })}
                  onBlur={(e) => updateField({ title: e.target.value })}
                  className="text-lg font-semibold border-0 bg-transparent px-0 focus-visible:ring-0"
                />
              </SheetTitle>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Select value={task.status} onValueChange={(v) => updateField({ status: v })} disabled={!canEdit}>
                  <SelectTrigger className="h-8 w-36 glass-subtle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="review">In Review</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={task.priority} onValueChange={(v) => updateField({ priority: v })} disabled={!canEdit}>
                  <SelectTrigger className="h-8 w-32 glass-subtle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                {task.deadline && (
                  <Badge variant="outline" className="gap-1 glass-subtle">
                    <Calendar className="h-3 w-3" />
                    {new Date(task.deadline).toLocaleDateString()}
                  </Badge>
                )}
              </div>
            </SheetHeader>

            <div className="p-6 space-y-6">
              <section>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Description</Label>
                <Textarea
                  value={task.description || ""}
                  disabled={!canEdit}
                  onChange={(e) => setTask({ ...task, description: e.target.value })}
                  onBlur={(e) => updateField({ description: e.target.value })}
                  placeholder="Add a description…"
                  className="mt-1 min-h-[80px] glass-subtle"
                />
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Start</Label>
                  <Input
                    type="date"
                    disabled={!canEdit}
                    className="mt-1 glass-subtle"
                    value={task.start_date ? task.start_date.slice(0, 10) : ""}
                    onChange={(e) => updateField({ start_date: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Deadline</Label>
                  <Input
                    type="date"
                    disabled={!canEdit}
                    className="mt-1 glass-subtle"
                    value={task.deadline ? task.deadline.slice(0, 10) : ""}
                    onChange={(e) => updateField({ deadline: e.target.value || null })}
                  />
                </div>
              </section>

              <section className="rounded-xl glass p-4 liquid-sheen">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ListTodo className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Subtasks</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {subDone}/{subtasks.length}
                    </Badge>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {subtasks.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 group">
                      <Checkbox checked={s.status === "completed"} onCheckedChange={() => toggleSubtask(s)} disabled={!canEdit} />
                      <span className={`text-sm flex-1 ${s.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{s.title}</span>
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <div className="flex gap-2 mt-3">
                    <Input
                      value={newSub}
                      onChange={(e) => setNewSub(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                      placeholder="Add subtask…"
                      className="h-8 glass-subtle text-sm"
                    />
                    <Button size="sm" variant="ghost" onClick={addSubtask}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </section>

              <section className="rounded-xl glass p-4 liquid-sheen">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Checklist</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {chkDone}/{checklist.length}
                    </Badge>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {checklist.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 group">
                      <Checkbox checked={item.completed} onCheckedChange={() => toggleChk(item)} disabled={!canEdit} />
                      <span className={`text-sm flex-1 ${item.completed ? "line-through text-muted-foreground" : ""}`}>{item.title}</span>
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removeChk(item.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <div className="flex gap-2 mt-3">
                    <Input
                      value={newChk}
                      onChange={(e) => setNewChk(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addChecklistItem()}
                      placeholder="Add item…"
                      className="h-8 glass-subtle text-sm"
                    />
                    <Button size="sm" variant="ghost" onClick={addChecklistItem}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </section>

              <section className="rounded-xl glass p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Attachments</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {attachments.length}
                    </Badge>
                  </div>
                  {canEdit && (
                    <>
                      <input ref={fileRef} type="file" hidden onChange={onUpload} accept="image/jpeg,image/png,application/pdf,.doc,.docx" />
                      <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                      </Button>
                    </>
                  )}
                </div>
                {attachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No attachments</p>
                ) : (
                  <ul className="space-y-2">
                    {attachments.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 group glass-subtle rounded-lg p-2">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                        <a href={a.file_url} target="_blank" rel="noreferrer" className="text-sm flex-1 hover:underline truncate">
                          {a.file_name}
                        </a>
                        <span className="text-[10px] text-muted-foreground">{a.file_size ? `${(a.file_size / 1024).toFixed(0)} KB` : ""}</span>
                        {(canEdit || a.uploaded_by === user?.id) && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removeAttachment(a.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl glass p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Comments</h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {comments.length}
                  </Badge>
                </div>
                <ul className="space-y-3 mb-3">
                  {comments.map((c) => {
                    const p = profiles[c.user_id];
                    return (
                      <li key={c.id} className="flex gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{(p?.full_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 glass-subtle rounded-lg px-3 py-2">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-medium">{p?.full_name || "Unknown"}</span>
                            <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap mt-0.5">
                            {c.content.split(/(@[\w_-]+)/g).map((part, i) =>
                              part.startsWith("@") ? (
                                <span key={i} className="text-primary font-medium">
                                  {part}
                                </span>
                              ) : (
                                <span key={i}>{part}</span>
                              )
                            )}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="relative">
                  <Textarea
                    ref={commentRef}
                    value={newComment}
                    onChange={(e) => onCommentChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        sendComment();
                      }
                    }}
                    placeholder="Write a comment… use @ to mention"
                    className="min-h-[64px] glass-subtle pr-10"
                  />
                  <Button size="icon" variant="ghost" className="absolute right-1 bottom-1 h-7 w-7" onClick={sendComment} disabled={!newComment.trim()}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                  {mentionOpen && filteredMentions.length > 0 && (
                    <div className="absolute bottom-full mb-1 left-0 glass-strong rounded-lg p-1 w-56 z-20">
                      {filteredMentions.map((p) => (
                        <button key={p.id} onClick={() => insertMention(p)} className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/20 text-sm">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{(p.full_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {p.full_name || "Unnamed"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
