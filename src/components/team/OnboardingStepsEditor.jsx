import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

export const OnboardingStepsEditor = () => {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStatus, setNewStatus] = useState("pending");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("onboarding_steps").select("*").order("order_index");
    setSteps(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const addStep = async () => {
    if (!newTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const order_index = steps.length;
    const { error } = await supabase.from("onboarding_steps").insert({
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      order_index,
      default_status: newStatus,
      created_by: user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Step added");
    setNewTitle("");
    setNewDesc("");
    setNewStatus("pending");
    load();
  };

  const updateStep = async (id, patch) => {
    const { error } = await supabase.from("onboarding_steps").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    load();
  };

  const deleteStep = async (id) => {
    if (!confirm("Delete this onboarding step?")) return;
    const { error } = await supabase.from("onboarding_steps").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Step deleted");
    load();
  };

  const move = async (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    const a = steps[idx],
      b = steps[target];
    await supabase.from("onboarding_steps").update({ order_index: b.order_index }).eq("id", a.id);
    await supabase.from("onboarding_steps").update({ order_index: a.order_index }).eq("id", b.id);
    load();
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Manage Onboarding Steps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 p-3 border rounded-md bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground">Add new step</p>
          <Input placeholder="Step title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <Textarea placeholder="Description (optional)" rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <div className="flex gap-2">
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending stage</SelectItem>
                <SelectItem value="training">Training stage</SelectItem>
                <SelectItem value="active">Active stage</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={addStep} className="gap-1">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : steps.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No steps yet.</p>
        ) : (
          <div className="space-y-2">
            {steps.map((s, i) => (
              <StepRow
                key={s.id}
                step={s}
                onSave={(patch) => updateStep(s.id, patch)}
                onDelete={() => deleteStep(s.id)}
                onMoveUp={i > 0 ? () => move(i, -1) : undefined}
                onMoveDown={i < steps.length - 1 ? () => move(i, 1) : undefined}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const StepRow = ({ step, onSave, onDelete, onMoveUp, onMoveDown }) => {
  const [title, setTitle] = useState(step.title);
  const [description, setDescription] = useState(step.description || "");
  const [defaultStatus, setDefaultStatus] = useState(step.default_status);
  const dirty = title !== step.title || description !== (step.description || "") || defaultStatus !== step.default_status;

  return (
    <div className="p-3 border rounded-md space-y-2">
      <div className="flex gap-2 items-start">
        <div className="flex flex-col gap-1">
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={!onMoveUp} onClick={onMoveUp}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={!onMoveDown} onClick={onMoveDown}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description" />
          <div className="flex gap-2 items-center">
            <Select value={defaultStatus} onValueChange={setDefaultStatus}>
              <SelectTrigger className="h-8 text-xs w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending stage</SelectItem>
                <SelectItem value="training">Training stage</SelectItem>
                <SelectItem value="active">Active stage</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!dirty} className="gap-1" onClick={() => onSave({ title, description: description || null, default_status: defaultStatus })}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
            <Button size="sm" variant="ghost" className="gap-1 text-destructive ml-auto" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
