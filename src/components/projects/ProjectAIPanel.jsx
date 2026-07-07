import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertTriangle, ListChecks, Lightbulb, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function ProjectAIPanel({ projectId, projectName, serviceTypes, onTasksCreated }) {
  const [busy, setBusy] = useState(null);
  const [summary, setSummary] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [delays, setDelays] = useState([]);
  const [error, setError] = useState(null);

  const run = async (action, body = {}) => {
  setBusy(action);
  setError(null);
  try {
    const { data, error: err } = await supabase.functions.invoke("ai-project-generator", {
      body: { action, ...body },
    });
    if (err) {
      let detail = err.message;
      try {
        const errBody = await err.context?.json();
        if (errBody?.error) detail = errBody.error;
      } catch {
        // context wasn't JSON — fall back to err.message
      }
      throw new Error(detail);
    }
    return data;
  } catch (e) {
    setError(e.message || "AI request failed");
    toast.error("AI request failed — try again");
    return null;
  } finally {
    setBusy(null);
  }
};

  const generateTasks = async () => {
    const data = await run("generate_tasks", {
      clientName: projectName,
      serviceType: serviceTypes.join(", ") || "general",
    });
    if (data?.tasks?.length) {
      const ids = data.tasks.map((t) => t.id);
      await supabase.from("tasks").update({ project_id: projectId }).in("id", ids);
      toast.success(`Created ${data.tasks.length} tasks`);
      onTasksCreated?.();
    }
  };

  const summarize = async () => {
    const data = await run("summarize_project", { projectId });
    if (data) {
      setSummary(data.summary);
      setSuggestions(data.suggestions || []);
    }
  };

  const detectDelays = async () => {
    const data = await run("detect_delays");
    if (data) setDelays(data.tasks || []);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> AI Command Center
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <Button variant="outline" onClick={generateTasks} disabled={busy !== null}>
            {busy === "generate_tasks" ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ListChecks className="h-4 w-4 mr-1.5" />}
            Generate Tasks
          </Button>
          <Button variant="outline" onClick={summarize} disabled={busy !== null}>
            {busy === "summarize_project" ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Lightbulb className="h-4 w-4 mr-1.5" />}
            Summarize
          </Button>
          <Button variant="outline" onClick={detectDelays} disabled={busy !== null}>
            {busy === "detect_delays" ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <AlertTriangle className="h-4 w-4 mr-1.5" />}
            Detect Delays
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-destructive">{error}</p>
              <Button size="sm" variant="ghost" className="h-7 mt-1" onClick={() => setError(null)}>
                <RefreshCw className="h-3 w-3 mr-1" /> Dismiss
              </Button>
            </div>
          </div>
        )}

        {summary && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</h4>
            <p className="text-sm">{summary}</p>
            {suggestions.length > 0 && (
              <div className="pt-2 border-t border-border">
                <h5 className="text-xs font-semibold mb-1">Next actions:</h5>
                <ul className="text-sm space-y-1">
                  {suggestions.map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {delays.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-warning flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Delayed / At Risk
            </h4>
            <ul className="text-sm space-y-1">
              {delays.slice(0, 8).map((t, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{t.title}</span>
                  <span className="text-xs text-muted-foreground">{t.priority}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
