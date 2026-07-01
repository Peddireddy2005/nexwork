import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Zap, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const TRIGGERS = [
  { value: "task_created", label: "Task is created" },
  { value: "task_status_change", label: "Task status changes" },
  { value: "task_priority_urgent", label: "Task priority becomes Urgent" },
  { value: "deadline_approaching", label: "Deadline is N days away" },
  { value: "project_status_change", label: "Project status changes" },
];

const ACTIONS = [
  { value: "send_notification", label: "Send in-app notification" },
  { value: "change_status", label: "Change task status" },
  { value: "add_comment", label: "Add a comment to task" },
  { value: "create_task", label: "Create a new task" },
];

export function ProjectAutomations({ projectId, canEdit }) {
  const { user } = useAuth();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("task_created");
  const [action, setAction] = useState("send_notification");
  const [actionConfig, setActionConfig] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("automation_rules").select("*").contains("trigger_config", { project_id: projectId }).order("created_at", { ascending: false });
    setRules(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const create = async () => {
    if (!name.trim() || !user) return;
    if (rules.length >= 20) {
      toast.error("Maximum 20 rules per project");
      return;
    }
    const { error } = await supabase.from("automation_rules").insert({
      name,
      trigger_type: trigger,
      trigger_config: { project_id: projectId },
      actions: [{ type: action, config: actionConfig }],
      conditions: [],
      enabled: true,
      created_by: user.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Automation rule created");
    setShowCreate(false);
    setName("");
    setActionConfig("");
    load();
  };

  const toggle = async (id, enabled) => {
    await supabase.from("automation_rules").update({ enabled }).eq("id", id);
    load();
  };

  const remove = async (id) => {
    await supabase.from("automation_rules").delete().eq("id", id);
    toast.success("Rule deleted");
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Automation Rules
          <Badge variant="secondary" className="text-[10px]">
            {rules.length}/20
          </Badge>
        </CardTitle>
        {canEdit && (
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={rules.length >= 20}>
            <Plus className="h-4 w-4 mr-1" /> Add Rule
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No automation rules yet. Create one to automate task workflows.</p>
        ) : (
          <ul className="space-y-2">
            {rules.map((r) => {
              const actionLabel = ACTIONS.find((a) => a.value === r.actions?.[0]?.type)?.label;
              const trigLabel = TRIGGERS.find((t) => t.value === r.trigger_type)?.label;
              return (
                <li key={r.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      When <span className="text-foreground">{trigLabel}</span> → Then <span className="text-foreground">{actionLabel}</span>
                    </p>
                  </div>
                  <Switch checked={r.enabled} onCheckedChange={(v) => toggle(r.id, v)} disabled={!canEdit} />
                  {canEdit && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(r.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Automation Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Rule Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Notify on urgent" />
            </div>
            <div>
              <Label>When (Trigger)</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Then (Action)</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Action Detail</Label>
              <Input value={actionConfig} onChange={(e) => setActionConfig(e.target.value)} placeholder="e.g. notification message or status value" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={!name.trim()}>
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
