import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AuthShell } from "./login";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({
  component: Signup,
});

function Signup() {
  const navigate = useNavigate();
  return (
    <AuthShell
      mode="signup"
      onSubmit={async ({ email, password, name }) => {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { display_name: name ?? "" },
          },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Account created. Welcome!");
        navigate({ to: "/dashboard" });
      }}
    />
  );
}
