import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Stethoscope, Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  return (
    <AuthShell
      mode="login"
      onSubmit={async ({ email, password }) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Welcome back!");
        navigate({ to: "/dashboard" });
      }}
    />
  );
}

export type AuthSubmit = (v: { email: string; password: string; name?: string }) => Promise<void>;

export function AuthShell({ mode, onSubmit }: { mode: "login" | "signup"; onSubmit: AuthSubmit }) {
  const isLogin = mode === "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-hero lg:block">
        <div className="absolute inset-0 bg-gradient-glow opacity-50" />
        <div className="relative flex h-full flex-col justify-between p-12 text-primary-foreground">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <Stethoscope className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-bold">MedScan AI</span>
          </Link>
          <div>
            <h2 className="font-display text-4xl font-bold leading-tight">
              Healthcare clarity,<br />one scan away.
            </h2>
            <p className="mt-4 max-w-md opacity-80">
              Join thousands using AI to decode prescriptions instantly.
            </p>
          </div>
          <p className="text-xs opacity-60">© 2026 MedScan AI</p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-background p-6 md:p-12">
        <div className="w-full max-w-sm space-y-6 animate-fade-up">
          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
              <Stethoscope className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold">MedScan AI</span>
          </Link>
          <div>
            <h1 className="font-display text-3xl font-bold">{isLogin ? "Welcome back" : "Create account"}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isLogin ? "Sign in to access your dashboard." : "Start scanning prescriptions in seconds."}
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onSubmit({ email, password, name });
              } finally {
                setBusy(false);
              }
            }}
          >
            {!isLogin && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Jane Doe" required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@clinic.com" className="pl-9" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} className="pl-9" required />
              </div>
            </div>
            <Button type="submit" disabled={busy} className="h-11 w-full bg-gradient-primary text-base shadow-glow">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isLogin ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account? " : "Already a member? "}
            <Link to={isLogin ? "/signup" : "/login"} className="font-semibold text-primary hover:underline">
              {isLogin ? "Sign up" : "Sign in"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
