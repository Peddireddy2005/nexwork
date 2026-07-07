import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, XCircle, UserPlus } from "lucide-react";

const InvitePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [invite, setInvite] = useState(null);
  const [status, setStatus] = useState("loading");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    checkToken();
  }, [token]);

  const checkToken = async () => {
    const { data, error } = await supabase.rpc("check_invite_token", { p_token: token });

    if (error || !data || data.length === 0) {
      setStatus("invalid");
      return;
    }
    const row = data[0];
    if (row.used) {
      setStatus("used");
      return;
    }
    if (row.expired) {
      setStatus("expired");
      return;
    }

    setInvite({ role: row.invite_role, email: row.invite_email });
    if (row.invite_email) setEmail(row.invite_email);
    setStatus("valid");
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!invite) return;
    setSubmitting(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin + "/dashboard",
      },
    });

    if (authError) {
      toast.error(authError.message);
      setSubmitting(false);
      return;
    }

    if (authData.user) {
      const { error: roleError } = await supabase.functions.invoke("apply-invite-role", {
        body: { token, user_id: authData.user.id },
      });

      if (roleError) {
        console.error("Role assignment error:", roleError);
        toast.error("Account created but role assignment failed. Contact your admin.");
        setTimeout(() => navigate("/login"), 1500);
      } else {
        // Email confirmations are disabled workspace-wide (see supabase/config.toml),
        // so signUp already returns a live, usable session — no email step exists.
        toast.success("Account created! Taking you to your dashboard…");
        setTimeout(() => navigate("/dashboard"), 800);
      }
    }

    setSubmitting(false);
  };

  const roleColors = {
    admin: "bg-destructive/10 text-destructive",
    manager: "bg-primary/10 text-primary",
    member: "bg-muted text-muted-foreground",
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status !== "valid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-sm shadow-lg">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-lg font-semibold">{status === "used" ? "Invite Already Used" : status === "expired" ? "Invite Expired" : "Invalid Invite"}</h2>
            <p className="text-sm text-muted-foreground">
              {status === "used" ? "This invite link has already been used." : status === "expired" ? "This invite link has expired. Ask your admin for a new one." : "This invite link is not valid."}
            </p>
            <Button variant="outline" onClick={() => navigate("/login")} className="active:scale-[0.97]">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm shadow-lg animate-fade-in-up">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl" style={{ lineHeight: "1.2" }}>
            Join <span className="text-primary">NEXUBOTICS</span>
          </CardTitle>
          <div className="flex justify-center mt-2">
            <Badge variant="secondary" className={`capitalize ${roleColors[invite?.role || ""] || ""}`}>
              {invite?.role} role
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required disabled={!!invite?.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>
            <Button type="submit" className="w-full active:scale-[0.98]" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {submitting ? "Creating account..." : "Join Team"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button type="button" className="text-sm text-primary hover:underline" onClick={() => navigate("/login")}>
              Already have an account? Sign in
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InvitePage;