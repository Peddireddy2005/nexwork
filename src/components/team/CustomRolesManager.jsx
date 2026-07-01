import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";

const ALL_PERMISSIONS = [
  { key: "view_tasks", label: "View Tasks" },
  { key: "edit_own_tasks", label: "Edit Own Tasks" },
  { key: "manage_tasks", label: "Manage All Tasks" },
  { key: "view_messages", label: "View Messages" },
  { key: "view_performance", label: "View Performance" },
  { key: "manage_onboarding", label: "Manage Onboarding" },
  { key: "manage_team", label: "Manage Team" },
  { key: "manage_invites", label: "Manage Invites" },
];

export const CustomRolesManager = ({ onRolesChange }) => {
  const [roles, setRoles] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [permissions, setPermissions] = useState([]);
  const [creating, setCreating] = useState(false);

  const fetchRoles = async () => {
    const { data } = await supabase.from("custom_roles").select("*").order("name");
    setRoles(data || []);
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const togglePermission = (key) => {
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const createRole = async () => {
    if (!name.trim()) {
      toast.error("Role name is required");
      return;
    }
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      setCreating(false);
      return;
    }

    const { error } = await supabase.from("custom_roles").insert({
      name: name.trim(),
      description: description.trim() || null,
      permissions,
      color,
      created_by: user.id,
    });

    if (error) {
      toast.error(error.message.includes("duplicate") ? "Role name already exists" : error.message);
    } else {
      toast.success(`Role "${name}" created`);
      setName("");
      setDescription("");
      setColor("#3b82f6");
      setPermissions([]);
      setOpen(false);
      fetchRoles();
      onRolesChange?.();
    }
    setCreating(false);
  };

  const deleteRole = async (id, roleName) => {
    const { error } = await supabase.from("custom_roles").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Role "${roleName}" deleted`);
    fetchRoles();
    onRolesChange?.();
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-primary" /> Custom Roles
          </CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs active:scale-[0.97]">
                <Plus className="h-3 w-3" /> New Role
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Custom Role</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Role Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Art Director" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this role do?" rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
                    <span className="text-xs text-muted-foreground">{color}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Permissions</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_PERMISSIONS.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={permissions.includes(p.key)} onCheckedChange={() => togglePermission(p.key)} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
                <Button onClick={createRole} className="w-full active:scale-[0.98]" disabled={creating}>
                  {creating ? "Creating..." : "Create Role"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {roles.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No custom roles yet</p>
        ) : (
          <div className="space-y-2">
            {roles.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="text-sm font-medium truncate">{r.name}</span>
                  <span className="text-[10px] text-muted-foreground">{(r.permissions || []).length} perms</span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteRole(r.id, r.name)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
