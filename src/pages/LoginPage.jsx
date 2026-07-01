import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) toast.error(error.message);
    else navigate("/dashboard");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex lg:w-1/2 bg-card items-center justify-center p-12 border-r border-border">
        <div className="max-w-md space-y-6">
          <h1 className="text-4xl font-bold tracking-tight text-primary" style={{ lineHeight: "1.1" }}>
            NEXUBOTICS
          </h1>
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { label: "Task Management", desc: "Kanban boards & workflows" },
              { label: "Real-Time Chat", desc: "Team channels & DMs" },
              { label: "Performance", desc: "Leaderboards & ratings" },
              { label: "Onboarding", desc: "Guided setup flows" },
            ].map((feature) => (
              <div key={feature.label} className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium">{feature.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in-up">
          <div className="text-center mb-8 lg:hidden">
            <h1 className="text-3xl font-bold tracking-tight text-primary" style={{ lineHeight: "1.1" }}>
              NEXUBOTICS
            </h1>
          </div>
          <div className="space-y-1 mb-6">
            <h2 className="text-xl font-semibold text-foreground">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in with your email</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="pl-9" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>
            <Button type="submit" className="w-full active:scale-[0.98]" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {loading ? "Please wait..." : "Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">Contact your admin to get an account</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
