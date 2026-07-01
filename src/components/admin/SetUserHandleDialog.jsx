import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AtSign, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SetUserHandleDialog({ open, onOpenChange, userId, userName, currentHandle, onSaved }) {
  const [value, setValue] = useState(currentHandle || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(currentHandle || "");
  }, [currentHandle, open]);

  const save = async () => {
    if (!userId) return;
    const handle = value.trim().toLowerCase();
    if (handle && !/^[a-z0-9_-]{3,30}$/.test(handle)) {
      return toast.error("3–30 chars: lowercase letters, numbers, _ or -");
    }
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ user_handle: handle || null }).eq("id", userId);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("User ID updated");
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set User ID</DialogTitle>
          <DialogDescription>
            Assign a unique handle for {userName || "this member"}. They can sign in with @handle or email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Label>User ID</Label>
          <div className="relative">
            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. john_doe" className="pl-9 lowercase" autoFocus />
          </div>
          <p className="text-[11px] text-muted-foreground">3–30 chars · a-z, 0-9, _ or -</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
