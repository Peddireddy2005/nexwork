import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, ClipboardList, ChevronRight, UserPlus, Eye, EyeOff, Mail, Lock, User, Building2, Phone } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const statusFlow = ["pending", "training", "active"];
const statusColors = { pending: "bg-warning/10 text-warning", training: "bg-info/10 text-info", active: "bg-success/10 text-success" };

const OnboardingPage = () => {
  const { user, role, profile, refreshProfile } = useAuth();
  const [steps, setSteps] = useState([]);
  const [progress, setProgress] = useState({});

  const [allProfiles, setAllProfiles] = useState([]);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberDepartment, setMemberDepartment] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberBio, setMemberBio] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [memberCustomRoleId, setMemberCustomRoleId] = useState("none");
  const [showPassword, setShowPassword] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [customRoles, setCustomRoles] = useState([]);

  const fetchSteps = async () => {
    const { data } = await supabase.from("onboarding_steps").select("*").order("order_index");
    setSteps(data || []);
  };

  const fetchProgress = async () => {
    if (!user) return;
    const { data } = await supabase.from("user_onboarding").select("step_id, completed").eq("user_id", user.id);
    const map = {};
    data?.forEach((d) => {
      map[d.step_id] = d.completed;
    });
    setProgress(map);
  };

  const fetchProfiles = async () => {
    if (role !== "admin") return;
    const { data } = await supabase.from("profiles").select("id, full_name, onboarding_status");
    setAllProfiles(data || []);
  };

  const fetchCustomRoles = async () => {
    const { data } = await supabase.from("custom_roles").select("id, name, color").order("name");
    setCustomRoles(data || []);
  };

  useEffect(() => {
    fetchSteps();
    fetchProgress();
    fetchProfiles();
    fetchCustomRoles();
  }, [user, role]);

  const toggleStep = async (stepId) => {
    if (!user) return;
    const currentlyDone = progress[stepId] || false;
    if (currentlyDone) {
      await supabase.from("user_onboarding").update({ completed: false, completed_at: null }).eq("user_id", user.id).eq("step_id", stepId);
    } else {
      const { data } = await supabase.from("user_onboarding").select("id").eq("user_id", user.id).eq("step_id", stepId).single();
      if (data) {
        await supabase.from("user_onboarding").update({ completed: true, completed_at: new Date().toISOString() }).eq("id", data.id);
      } else {
        await supabase.from("user_onboarding").insert({ user_id: user.id, step_id: stepId, completed: true, completed_at: new Date().toISOString() });
      }
    }
    fetchProgress();
  };

  const updateUserStatus = async (userId, newStatus) => {
    const { error } = await supabase.from("profiles").update({ onboarding_status: newStatus }).eq("id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Status updated");
    fetchProfiles();
    if (userId === user?.id) refreshProfile();
  };

  const addMember = async () => {
    if (!memberEmail || !memberPassword || !memberName) {
      toast.error("Email, password, and full name are required");
      return;
    }
    if (memberPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setAddingMember(true);
    try {
      const res = await supabase.functions.invoke("create-member", {
        body: {
          email: memberEmail,
          password: memberPassword,
          full_name: memberName,
          department: memberDepartment || null,
          bio: memberBio || null,
          role: memberRole,
          custom_role_id: memberCustomRoleId === "none" ? null : memberCustomRoleId,
          phone: memberPhone || null,
        },
      });

      if (res.error) {
        toast.error(res.error.message || "Failed to create member");
      } else if (res.data?.error) {
        toast.error(res.data.error);
      } else {
        toast.success(`Member "${memberName}" created — they can sign in immediately with the credentials you set.`);
        setMemberEmail("");
        setMemberPassword("");
        setMemberName("");
        setMemberDepartment("");
        setMemberBio("");
        setMemberRole("member");
        setMemberPhone("");
        setMemberCustomRoleId("none");
        setAddMemberOpen(false);
        fetchProfiles();
      }
    } catch (err) {
      toast.error(err.message || "Failed to create member");
    }
    setAddingMember(false);
  };

  const completedCount = steps.filter((s) => progress[s.id]).length;
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ lineHeight: "1.2" }}>
            Onboarding
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {profile && (
              <Badge variant="secondary" className={`mr-2 ${statusColors[profile.onboarding_status]}`}>
                {profile.onboarding_status}
              </Badge>
            )}
            {role === "admin" ? "Add new members and manage onboarding" : "Complete your onboarding steps"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {role === "admin" && (
            <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 active:scale-[0.97]">
                  <UserPlus className="h-4 w-4" /> Add Member
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Onboard New Member</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Full Name *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="John Smith" className="pl-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="john@company.com" type="email" className="pl-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Password *</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={memberPassword} onChange={(e) => setMemberPassword(e.target.value)} placeholder="Min 6 characters" type={showPassword ? "text" : "password"} className="pl-9 pr-9" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={memberDepartment} onChange={(e) => setMemberDepartment(e.target.value)} placeholder="e.g. Marketing" className="pl-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} placeholder="+1 555 123 4567" type="tel" className="pl-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>System Role</Label>
                      <Select value={memberRole} onValueChange={setMemberRole}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {customRoles.length > 0 && (
                      <div className="space-y-2">
                        <Label>Custom Role</Label>
                        <Select value={memberCustomRoleId} onValueChange={setMemberCustomRoleId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {customRoles.map((cr) => (
                              <SelectItem key={cr.id} value={cr.id}>
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cr.color }} />
                                  {cr.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Bio</Label>
                      <Textarea value={memberBio} onChange={(e) => setMemberBio(e.target.value)} placeholder="Short bio or notes about this member..." rows={2} />
                    </div>
                  </div>
                  <Button onClick={addMember} className="w-full gap-2 active:scale-[0.98]" disabled={addingMember}>
                    <UserPlus className="h-4 w-4" />
                    {addingMember ? "Creating Account..." : "Create Member Account"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">The member will be able to log in immediately with these credentials.</p>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="py-4">
          <div className="flex items-center justify-center gap-2 mb-4">
            {statusFlow.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${profile?.onboarding_status === s ? statusColors[s] + " ring-2 ring-offset-1 ring-current" : "bg-muted text-muted-foreground"}`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </div>
                {i < statusFlow.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/40" />}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm font-medium tabular-nums">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {completedCount} of {steps.length} steps completed
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {steps.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No onboarding steps yet{role === "admin" ? ". Create one to get started." : "."}</p>
            </CardContent>
          </Card>
        ) : (
          steps.map((step, i) => (
            <Card key={step.id} className={`shadow-sm transition-all ${progress[step.id] ? "opacity-60" : ""}`}>
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <Checkbox checked={progress[step.id] || false} onCheckedChange={() => toggleStep(step.id)} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${progress[step.id] ? "line-through" : ""}`}>
                    {i + 1}. {step.title}
                  </p>
                  {step.description && <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {role === "admin" && allProfiles.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Manage User Onboarding Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allProfiles.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.full_name || "Unknown"}</p>
                  </div>
                  <Select value={p.onboarding_status} onValueChange={(v) => updateUserStatus(p.id, v)}>
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="training">Training</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OnboardingPage;
