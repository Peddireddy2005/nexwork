import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const ProfileEditHistory = ({ profileId }) => {
  const [logs, setLogs] = useState([]);
  const [names, setNames] = useState({});

  useEffect(() => {
    if (!profileId) {
      setLogs([]);
      return;
    }
    (async () => {
      const { data } = await supabase.from("profile_edit_logs").select("*").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(50);
      const list = data || [];
      setLogs(list);
      const ids = Array.from(new Set(list.map((l) => l.edited_by)));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const map = {};
        profs?.forEach((p) => {
          map[p.id] = p.full_name || p.id.slice(0, 8);
        });
        setNames(map);
      }
    })();
  }, [profileId]);

  if (!profileId) return null;
  if (logs.length === 0) return <p className="text-xs text-muted-foreground">No edit history yet.</p>;

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {logs.map((l) => (
        <div key={l.id} className="text-xs border rounded-md p-2 bg-muted/30">
          <div className="flex justify-between text-muted-foreground">
            <span>{names[l.edited_by] || "Unknown"}</span>
            <span>{new Date(l.created_at).toLocaleString()}</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {Object.entries(l.changes || {}).map(([field, val]) => (
              <li key={field}>
                <span className="font-medium">{field}:</span>{" "}
                <span className="text-muted-foreground line-through">{String(val?.from ?? "")}</span>
                {" → "}
                <span>{String(val?.to ?? "")}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
