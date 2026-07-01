import { useState, useRef, useMemo, useEffect } from "react";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Save, Camera, Loader2, User, Palette, Shield, LogOut, Mail, Building2, Sun, Moon, Monitor, RotateCcw, Check, Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";

const SettingsPage = () => {
  const { user, profile, role, refreshProfile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const initial = useMemo(
    () => ({
      fullName: profile?.full_name || "",
      bio: profile?.bio || "",
      department: profile?.department || "",
    }),
    [profile]
  );

  const [fullName, setFullName] = useState(initial.fullName);
  const [bio, setBio] = useState(initial.bio);
  const [department, setDepartment] = useState(initial.department);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setFullName(initial.fullName);
    setBio(initial.bio);
    setDepartment(initial.department);
  }, [initial]);

  const dirty = fullName.trim() !== initial.fullName.trim() || bio.trim() !== initial.bio.trim() || department.trim() !== initial.department.trim();

  const [tab, setTab] = useState("profile");
  const [pendingTab, setPendingTab] = useState(null);
  const { pendingHref, confirmPending, cancelPending } = useUnsavedGuard(dirty);

  const onTabChange = (next) => {
    if (dirty && next !== tab) {
      setPendingTab(next);
    } else {
      setTab(next);
    }
  };

  const handleConfirmDiscard = () => {
    if (pendingTab) {
      handleReset();
      setTab(pendingTab);
      setPendingTab(null);
    }
    if (pendingHref) confirmPending();
  };
  const handleCancelGuard = () => {
    setPendingTab(null);
    cancelPending();
  };
  const handleSaveAndContinue = async () => {
    await handleSave();
    if (pendingTab) {
      setTab(pendingTab);
      setPendingTab(null);
    }
    if (pendingHref) confirmPending();
  };

  const guardOpen = !!pendingTab || !!pendingHref;

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!user || !dirty) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        bio: bio.trim() || null,
        department: department.trim() || null,
      })
      .eq("id", user.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Profile updated");
      setSavedAt(new Date());
      await refreshProfile();
    }
    setSaving(false);
  };

  const handleReset = () => {
    setFullName(initial.fullName);
    setBio(initial.bio);
    setDepartment(initial.department);
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) {
        toast.error(uploadError.message);
        setUploading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
      if (updateError) toast.error(updateError.message);
      else {
        toast.success("Profile picture updated");
        await refreshProfile();
      }
    } catch (err) {
      toast.error(err.message || "Upload failed");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const initials = (fullName || initial.fullName)
    ? (fullName || initial.fullName).split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0] || "?").toUpperCase();

  const previewInitials = fullName ? fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : initials;

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun, preview: "from-amber-100 via-white to-sky-100" },
    { value: "dark", label: "Dark", icon: Moon, preview: "from-slate-900 via-slate-800 to-indigo-950" },
    { value: "system", label: "System", icon: Monitor, preview: "from-slate-200 via-slate-400 to-slate-700" },
  ];

  const copyEmail = () => {
    if (!user?.email) return;
    navigator.clipboard.writeText(user.email);
    toast.success("Email copied");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up pb-20">
      <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 sm:p-8">
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="relative group">
            <Avatar className="h-24 w-24 ring-4 ring-background shadow-xl">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="Profile" />}
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-2xl font-bold">{initials}</AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              aria-label="Change avatar"
            >
              {uploading ? <Loader2 className="h-6 w-6 text-white animate-spin" /> : <Camera className="h-6 w-6 text-white" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">{initial.fullName || "Your Profile"}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {user?.email}
              </span>
              {role && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
                  <Shield className="h-3 w-3" />
                  {role}
                </span>
              )}
              {initial.department && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {initial.department}
                </span>
              )}
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-primary hover:underline mt-2" disabled={uploading}>
              {uploading ? "Uploading…" : "Change profile photo"}
            </button>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full sm:w-fit">
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="h-3.5 w-3.5" />
            Profile{dirty && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5">
            <Palette className="h-3.5 w-3.5" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="grid lg:grid-cols-[1fr,320px] gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Profile Information</CardTitle>
                    <CardDescription>Update your personal details and how others see you.</CardDescription>
                  </div>
                  {dirty ? (
                    <Badge variant="outline" className="border-warning/40 text-warning gap-1 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
                      Unsaved
                    </Badge>
                  ) : savedAt ? (
                    <Badge variant="outline" className="border-success/40 text-success gap-1 shrink-0">
                      <Check className="h-3 w-3" />
                      Saved
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSave} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">Department</Label>
                      <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="bio">Bio</Label>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{bio.length}/280</span>
                    </div>
                    <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value.slice(0, 280))} placeholder="Tell your team a bit about yourself…" rows={4} />
                    <p className="text-[11px] text-muted-foreground">Brief description that appears on your profile card.</p>
                  </div>
                  <Separator />
                  <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground">
                      {savedAt ? <>Last saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</> : "Changes are saved to your profile."}
                    </p>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <Button type="button" variant="ghost" size="sm" onClick={handleReset} disabled={!dirty || saving}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Reset
                      </Button>
                      <Button type="submit" disabled={saving || !dirty} className="min-w-32">
                        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        {saving ? "Saving…" : dirty ? "Save Changes" : "Saved"}
                      </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="lg:sticky lg:top-20 h-fit">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" /> Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-muted/30 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 ring-2 ring-background">
                      {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                      <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-sm font-bold">{previewInitials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{fullName || "Your name"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {department || "No department"}
                        {role && <span className="text-primary capitalize"> · {role}</span>}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-4 min-h-[3rem]">{bio || <span className="italic">Your bio will appear here…</span>}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 text-center">How teammates will see you</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>Pick a theme. Changes apply instantly across the workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                {themeOptions.map((opt) => {
                  const active = theme === opt.value;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setTheme(opt.value);
                        toast.success(`${opt.label} theme applied`);
                      }}
                      className={`group relative text-left rounded-2xl border-2 transition-all overflow-hidden ${active ? "border-primary shadow-lg shadow-primary/10" : "border-border/60 hover:border-border"}`}
                    >
                      <div className={`h-20 bg-gradient-to-br ${opt.preview} relative`}>
                        <div className="absolute inset-x-3 top-3 flex gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
                          <div className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
                          <div className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
                        </div>
                        <div className="absolute inset-x-3 bottom-2 space-y-1">
                          <div className="h-1.5 w-1/2 rounded bg-foreground/20" />
                          <div className="h-1.5 w-3/4 rounded bg-foreground/15" />
                        </div>
                      </div>
                      <div className="p-3 flex items-center justify-between bg-card">
                        <span className="inline-flex items-center gap-2 text-sm font-medium">
                          <Icon className="h-4 w-4" />
                          {opt.label}
                        </span>
                        {active && (
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">
                  Tip: <span className="text-foreground font-medium">System</span> follows your device preference automatically.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account Details</CardTitle>
                <CardDescription>Your identity and access on NEXUBOTICS.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Email</p>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-sm font-medium truncate">{user?.email}</p>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copyEmail}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Role</p>
                    <p className="text-sm font-medium capitalize mt-1 inline-flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      {role || "member"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Internal ID</p>
                    <p className="text-xs font-mono text-muted-foreground mt-1 truncate">{user?.id}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Joined</p>
                    <p className="text-sm font-medium mt-1">{user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
                <CardDescription>Actions here affect your active session.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
                  <div>
                    <p className="text-sm font-medium">Sign out of this device</p>
                    <p className="text-xs text-muted-foreground mt-0.5">You'll need to sign in again to access NEXUBOTICS.</p>
                  </div>
                  <Button variant="destructive" size="sm" onClick={signOut}>
                    <LogOut className="h-4 w-4 mr-1.5" />
                    Sign out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {dirty && (
        <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-6 sm:bottom-6 z-40 animate-fade-in-up">
          <div className="mx-auto sm:mx-0 max-w-md rounded-2xl border border-border/60 bg-card/90 backdrop-blur-xl shadow-2xl p-3 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-warning animate-pulse shrink-0" />
            <p className="text-sm font-medium flex-1">You have unsaved changes</p>
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving}>
              Discard
            </Button>
            <Button size="sm" onClick={() => handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={guardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>You've edited your profile but haven't saved yet. What would you like to do?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={handleCancelGuard}>Stay on page</AlertDialogCancel>
            <Button variant="ghost" onClick={handleConfirmDiscard} disabled={saving}>
              Discard changes
            </Button>
            <AlertDialogAction onClick={handleSaveAndContinue} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save & continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SettingsPage;
