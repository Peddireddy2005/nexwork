export function ProjectKanban({ projectId, canEdit, onProjectChange }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newCol, setNewCol] = useState("todo");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [deadline, setDeadline] = useState("");
  const [openTaskId, setOpenTaskId] = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("tasks").select("*").eq("project_id", projectId).eq("is_archived", false);
    setTasks(data || []);
    setLoading(false);
  };

  // Reloads the board AND tells the parent (ProjectDetailPage) to refetch
  // the project record, since progress is now recalculated server-side.
  const refreshAll = async () => {
    await load();
    onProjectChange?.();
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = async (e, status) => {
    e.preventDefault();
    if (!dragId || !canEdit) return;
    const t = tasks.find((x) => x.id === dragId);
    if (!t || t.status === status) {
      setDragId(null);
      return;
    }
    setTasks((prev) => prev.map((x) => (x.id === dragId ? { ...x, status } : x)));
    const { error } = await supabase.from("tasks").update({ status }).eq("id", dragId);
    if (error) {
      toast.error("Failed to move task");
      load();
    } else {
      onProjectChange?.();
    }
    setDragId(null);
  };

  const openCreate = (col) => {
    setNewCol(col);
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDeadline("");
    setShowCreate(true);
  };

  const createTask = async () => {
    if (!title.trim() || !user) return;
    const { error } = await supabase.from("tasks").insert({
      title,
      description: description || null,
      status: newCol,
      priority,
      deadline: deadline || null,
      project_id: projectId,
      created_by: user.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Task created");
    setShowCreate(false);
    refreshAll();
  };

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Loading tasks…</div>;

  return (
    <>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 overflow-x-auto">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, col.id)} className="glass rounded-xl p-2 min-h-[200px] liquid-sheen">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col.label}</h3>
                  <Badge variant="secondary" className="text-[10px] px-1.5">
                    {colTasks.length}
                  </Badge>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openCreate(col.id)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {colTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 text-center py-6">No tasks</p>
                ) : (
                  colTasks.map((t) => {
                    const overdue = t.deadline && new Date(t.deadline) < new Date() && t.status !== "completed";
                    return (
                      <Card
                        key={t.id}
                        draggable={canEdit}
                        onDragStart={(e) => onDragStart(e, t.id)}
                        onClick={() => setOpenTaskId(t.id)}
                        className={`cursor-pointer glass-subtle glass-hover border-border/40 ${dragId === t.id ? "opacity-50" : ""}`}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start gap-1.5">
                            {canEdit && <GripVertical className="h-3 w-3 text-muted-foreground/40 mt-0.5 shrink-0" />}
                            <p className="text-sm font-medium flex-1 leading-tight">{t.title}</p>
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${priorityClass[t.priority]}`}>
                              {t.priority}
                            </Badge>
                            {t.deadline && (
                              <div className={`flex items-center gap-0.5 text-[10px] ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {overdue && <AlertTriangle className="h-2.5 w-2.5" />}
                                <Calendar className="h-2.5 w-2.5" />
                                {new Date(t.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TaskDrawer taskId={openTaskId} open={!!openTaskId} onOpenChange={(v) => !v && setOpenTaskId(null)} canEdit={canEdit} onChange={refreshAll} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New task in {COLUMNS.find((c) => c.id === newCol)?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[80px]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
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
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={createTask} disabled={!title.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}