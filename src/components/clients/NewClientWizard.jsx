import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight, Sparkles, Check } from "lucide-react";
import { logError } from "@/lib/errorLogger";

const SERVICE_OPTIONS = ["AI Ads", "Marketing Automation", "Website Build", "CRM Setup", "Social Media", "Custom"];

const clientSchema = z.object({
  name: z.string().trim().min(1, "Required").max(80, "Max 80 chars"),
  contactName: z.string().trim().max(80).optional(),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(120).optional(),
});

const configSchema = z.object({
  serviceTypes: z.array(z.string()).min(1, "Pick at least one service"),
  budget: z.string().optional(),
  kickoffDate: z.string().min(1, "Kickoff date required"),
  notes: z.string().max(500, "Max 500 chars").optional(),
});

export function NewClientWizard({ open, onOpenChange, onCreated }) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Step 1
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");

  // Step 2
  const [serviceTypes, setServiceTypes] = useState([]);
  const [budget, setBudget] = useState("");
  const [kickoffDate, setKickoffDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [autoGenerate, setAutoGenerate] = useState(true);

  const reset = () => {
    setStep(1);
    setName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setCompany("");
    setServiceTypes([]);
    setBudget("");
    setKickoffDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setAutoGenerate(true);
    setErrors({});
  };

  const validateStep1 = () => {
    const result = clientSchema.safeParse({ name, contactName, email, phone, company });
    if (!result.success) {
      const errs = {};
      result.error.issues.forEach((i) => {
        errs[i.path[0]] = i.message;
      });
      setErrors(errs);
      return false;
    }
    setErrors({});
    return true;
  };

  const validateStep2 = () => {
    const result = configSchema.safeParse({ serviceTypes, budget, kickoffDate, notes });
    if (!result.success) {
      const errs = {};
      result.error.issues.forEach((i) => {
        errs[i.path[0]] = i.message;
      });
      setErrors(errs);
      return false;
    }
    setErrors({});
    return true;
  };

  const next = async () => {
    if (step === 1) {
      if (!validateStep1()) return;
      const { data: dup } = await supabase.from("clients").select("id").eq("email", email).maybeSingle();
      if (dup) {
        setErrors({ email: "Email already exists" });
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!validateStep2()) return;
      setStep(3);
    }
  };

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const serviceLabel = serviceTypes.join(" + ");
      // 1. Create client
      const { data: client, error: cErr } = await supabase
        .from("clients")
        .insert({
          name,
          email,
          phone: phone || null,
          company: company || null,
          notes: notes || null,
          service_type: serviceLabel,
          status: "active",
          created_by: user.id,
        })
        .select()
        .single();
      if (cErr) throw cErr;

      // 2. Create project
      const kickoff = new Date(kickoffDate);
      const deadline = new Date(kickoff);
      deadline.setDate(deadline.getDate() + 30);

      const { data: project, error: pErr } = await supabase
        .from("projects")
        .insert({
          name: `${name} — ${serviceLabel}`,
          description: notes || null,
          client_id: client.id,
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

      // 3. Add owner as project member
      await supabase.from("project_members").insert({
        project_id: project.id,
        user_id: user.id,
        role: "owner",
      });

      // 4. Activity log
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action: "client_created",
        entity_type: "client",
        entity_id: client.id,
        metadata: { name, project_id: project.id },
      });

      // 5. AI task generation (best-effort)
      if (autoGenerate) {
        toast.info("Generating tasks with AI…");
        try {
          const { data: ai } = await supabase.functions.invoke("ai-project-generator", {
            body: {
              action: "generate_tasks",
              clientId: client.id,
              clientName: name,
              serviceType: serviceLabel,
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

      toast.success(`Client ${name} created and project launched.`);
      onOpenChange(false);
      reset();
      onCreated?.();
    } catch (e) {
      logError({
        error_message: e.message || "Client onboarding failed",
        action: "client_onboarding",
        component: "NewClientWizard",
        severity: "error",
      });
      toast.error(e.message || "Failed to create client");
    } finally {
      setSaving(false);
    }
  };

  const toggleService = (s) => {
    setServiceTypes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !saving) {
          onOpenChange(false);
          reset();
        } else if (o) {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent className="max-w-lg" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Onboard New Client — Step {step} of 3</DialogTitle>
          <div className="flex gap-1 mt-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${n <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <Label>Client Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={errors.name ? "border-destructive" : ""} />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
            </div>
            <div>
              <Label>Primary Contact Name</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={errors.email ? "border-destructive" : ""} />
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <Label>Service Type * (multi-select)</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {SERVICE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleService(s)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                      serviceTypes.includes(s) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-accent"
                    }`}
                  >
                    {serviceTypes.includes(s) && <Check className="inline h-3 w-3 mr-1" />}
                    {s}
                  </button>
                ))}
              </div>
              {errors.serviceTypes && <p className="text-xs text-destructive mt-1">{errors.serviceTypes}</p>}
            </div>
            <div>
              <Label>Estimated Budget</Label>
              <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Kickoff Date *</Label>
              <Input type="date" value={kickoffDate} onChange={(e) => setKickoffDate(e.target.value)} />
              {errors.kickoffDate && <p className="text-xs text-destructive mt-1">{errors.kickoffDate}</p>}
            </div>
            <div>
              <Label>Notes / Brief (max 500)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="min-h-[80px]" />
              <p className="text-[10px] text-muted-foreground text-right mt-0.5">{notes.length}/500</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <h3 className="font-semibold text-sm">Review</h3>
              <div className="text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Client:</span> {name}
                </p>
                <p>
                  <span className="text-muted-foreground">Email:</span> {email}
                </p>
                {company && (
                  <p>
                    <span className="text-muted-foreground">Company:</span> {company}
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">Services:</span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {serviceTypes.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px]">
                      {s}
                    </Badge>
                  ))}
                </div>
                <p>
                  <span className="text-muted-foreground">Kickoff:</span> {kickoffDate}
                </p>
                {budget && (
                  <p>
                    <span className="text-muted-foreground">Budget:</span> ${parseFloat(budget).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer p-3 rounded-lg border bg-card">
              <input type="checkbox" checked={autoGenerate} onChange={(e) => setAutoGenerate(e.target.checked)} className="rounded" />
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Auto-generate initial tasks with AI</span>
            </label>
            <p className="text-xs text-muted-foreground">
              On submit: a project named{" "}
              <strong>
                {name} — {serviceTypes.join(" + ")}
              </strong>{" "}
              will be created with a 30-day default deadline.
            </p>
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={saving}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
              disabled={saving}
            >
              Cancel
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={next}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…
                </>
              ) : (
                "Create & Launch"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
