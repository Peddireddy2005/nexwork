import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AnnouncementsManager() {
  const { user, role } = useAuth();
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("info");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (role !== "admin") return null;

  const fetchItems = async () => {
    const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(20);
    setItems(data || []);
  };
  useEffect(() => {
    fetchItems();
  }, []);

  const create = async () => {
    if (!title.trim() || !user) return;
    setBusy(true);
    const { error } = await supabase.from("announcements").insert({
      title: title.trim(),
      body: body.trim() || null,
      severity,
      created_by: user.id,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Announcement posted");
    setTitle("");
    setBody("");
    setSeverity("info");
    setOpen(false);
    fetchItems();
  };

  const remove = async (id) => {
    if (!confirm("Delete this announcement?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    fetchItems();
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-muted-foreground" /> Workspace Announcements
          <Badge variant="secondary" className="text-[10px]">
            Admin
          </Badge>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New
        </Button>
      </CardHeader>
      <CardContent>
        {open && (
          <div className="space-y-2 mb-3 p-3 rounded-xl border border-border/60 bg-muted/30">
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="Optional details…" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="flex items-center gap-2">
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={create} disabled={busy || !title.trim()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Post
              </Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No announcements yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm p-2 rounded-md hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="font-medium truncate">{a.title}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {a.severity} · {new Date(a.starts_at).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => remove(a.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
