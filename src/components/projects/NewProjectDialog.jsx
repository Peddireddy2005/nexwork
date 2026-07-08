import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Check, Sparkles } from "lucide-react";

const SERVICE_OPTIONS = ["AI Ads", "Marketing Automation", "Website Build", "CRM Setup", "Social Media", "Custom"];

export function NewProjectDialog({ open, onOpenChange, onCreated }) {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [serviceTypes, setServiceTypes] = useState([]);
  const [budget, setBudget] = useState("");
  const [kickoffDate, setKickoffDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("clients")
      .select("id, name, company")
      .order("name")
      .then(({ data }) => setClients(data || []));
  }, [open]);

  const reset = () => {
    setClientId("");
    setName("");
    setServiceTypes([]);
    setBudget("");
    setKickoffDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setAutoGenerate(true);
  };

  const toggleService = (s) => {
    setServiceTypes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const submit = async () => {
    if (!clientId) return toast.error("Select a client");
    if (!name.trim()) return toast.error("Project name is required");
    if (serviceTypes.length === 0) return toast.error("Pick at least one service");
    if (!user) return;

    setSaving(true);
    try {
      const client = clients.find((c) => c.id === clientId);
      const kickoff = new Date(kickoffDate);
      const deadline = new Date(kickoff);
      deadline.setDate(deadline.getDate() + 30);

      const { data: project, error: pErr } = await supabase
        .from("projects")
        .insert({
          name: name.trim(),
          description: notes || null,
          client_id: clientId,
          owner_id: user.id,
          status: "active",
          start_date: kickoffDate,
          deadline: deadline.toISOString().split("T")[0],
          service_types: serviceTypes,
          budget: budget ? parseFloat(budget) : null,
          created_by: user.id,
        })
        .select()
        .single();
      if (pErr) throw pErr;

      await supabase.from("project_members").insert({
        project_id: project.id,
        user_id: user.id,
        role: "owner",
      });

      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action: "project_created",
        entity_type: "project",
        entity_id: project.id,
        metadata: { name: name.trim(), client_id: clientId },
      });

      if (autoGenerate) {
        toast.info("Generating tasks with AI…");
        try {
          const { data: ai } = await supabase.functions.invoke("ai-project-generator", {
            body: {
              action: "generate_tasks",
              clientId,
              clientName: client?.name || name,
              serviceType: serviceTypes.join(" + "),
              projectId: project.id,
            },
          });
          if (ai?.tasks?.length) {
            const ids = ai.tasks.map((t) => t.id);
            await supabase.from("tasks").update({ project_id: project.id }).in("id", ids);
          }
        } catch (aiErr) {
          console.error("AI task gen failed", aiErr);
        }
      }

      toast.success(`Project "${name}" created for ${client?.name || "client"}`);
      onOpenChange(false);
      reset();
      onCreated?.();
    } catch (e) {
      toast.error(e.message || "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project for Existing Client</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Client *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select a client…" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.company ? ` (${c.company})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {clients.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No clients yet — create a client first.</p>
            )}
          </div>

          <div>
            <Label>Project Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 Rebrand Website" maxLength={120} />
          </div>

          <div>
            <Label>Service Type * (multi-select)</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {SERVICE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleService(s)}
                  className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                    serviceTypes.includes(s)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-input hover:bg-accent"
                  }`}
                >
                  {serviceTypes.includes(s) && <Check className="inline h-3 w-3 mr-1" />}
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Budget</Label>
              <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Kickoff Date *</Label>
              <Input type="date" value={kickoffDate} onChange={(e) => setKickoffDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Notes / Brief</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="min-h-[70px]" />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer p-3 rounded-lg border bg-card">
            <input type="checkbox" checked={autoGenerate} onChange={(e) => setAutoGenerate(e.target.checked)} className="rounded" />
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Auto-generate initial tasks with AI</span>
          </label>

          {clientId && serviceTypes.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {serviceTypes.map((s) => <Badge key={s} variant="secondary" className="text-[10px] mr-1">{s}</Badge>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}