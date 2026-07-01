import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { toast } from "sonner";

const KEY = "team_sheet_url";

export const useTeamSheetUrl = () => {
  const [url, setUrl] = useState("");
  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle()
      .then(({ data }) => setUrl(data?.value || ""));
  }, []);
  return url;
};

export const TeamSheetSetting = () => {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle()
      .then(({ data }) => setUrl(data?.value || ""));
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("app_settings").upsert(
      {
        key: KEY,
        value: url.trim() || null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      },
      { onConflict: "key" }
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Team sheet URL saved");
  };

  return (
    <div className="flex gap-2 items-center">
      <Input type="url" placeholder="https://docs.google.com/spreadsheets/d/..." value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" />
      <Button size="sm" onClick={save} disabled={saving} className="gap-1">
        <Save className="h-4 w-4" /> Save
      </Button>
    </div>
  );
};
