import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Brain, Shield, Sparkles, Stethoscope, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MedScan AI — Instant Prescription Analysis" },
      { name: "description", content: "Snap a prescription, get instant AI-powered medication insights, side effects, and cheaper equivalents." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Stethoscope className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold">MedScan AI</span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">Features</a>
            <a href="#how" className="text-sm text-muted-foreground hover:text-foreground">How it works</a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/login">Sign in</Link></Button>
            <Button asChild className="bg-gradient-primary"><Link to="/signup">Get started</Link></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-glow opacity-60" />
        <div className="container relative mx-auto px-4 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3 w-3" /> AI-Powered Healthcare · v2.0
            </div>
            <h1 className="font-display text-5xl font-bold tracking-tight md:text-7xl">
              Decode any prescription <span className="text-gradient">in seconds.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground md:text-xl">
              Upload a photo of your prescription. MedScan AI identifies medications, explains uses and side effects,
              and finds cheaper equivalents — instantly.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-12 bg-gradient-primary px-7 text-base shadow-glow">
                <Link to="/signup">Start free scan <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base">
                <Link to="/dashboard">View demo</Link>
              </Button>
            </div>
            <div className="mt-12 flex items-center justify-center gap-8 text-xs text-muted-foreground">
              <div>★★★★★ <span className="ml-1">4.9 / 5</span></div>
              <div>· 250k+ scans</div>
              <div>· HIPAA aware</div>
            </div>
          </div>

          {/* Hero card preview */}
          <div className="mx-auto mt-16 max-w-4xl">
            <div className="rounded-3xl border border-border bg-gradient-card p-2 shadow-glow animate-float">
              <div className="relative overflow-hidden rounded-2xl bg-muted/30 p-8">
                <div className="grid gap-6 md:grid-cols-3">
                  {[
                    { name: "Amoxicillin 500mg", tag: "Antibiotic", price: "₹12.50" },
                    { name: "Paracetamol 650mg", tag: "Analgesic", price: "₹3.20" },
                    { name: "Pantoprazole 40mg", tag: "Antacid", price: "₹7.90" },
                  ].map((m) => (
                    <div key={m.name} className="rounded-xl border border-border bg-card p-4 shadow-soft">
                      <div className="text-xs text-primary">{m.tag}</div>
                      <div className="mt-1 font-display font-bold">{m.name}</div>
                      <div className="mt-3 text-2xl font-bold text-gradient">{m.price}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold md:text-5xl">Built for clarity, designed for care.</h2>
          <p className="mt-4 text-muted-foreground">Everything you need to understand your medications confidently.</p>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            { icon: Brain, title: "AI Recognition", desc: "Trained on 12M+ prescriptions for accurate handwriting analysis." },
            { icon: Zap, title: "Instant Results", desc: "Get full medication breakdowns in under 3 seconds." },
            { icon: Shield, title: "Privacy First", desc: "Your scans are encrypted end-to-end and never shared." },
            { icon: Upload, title: "Drag & Drop", desc: "Upload from any device — image, PDF, or camera." },
            { icon: Sparkles, title: "Smart Equivalents", desc: "Find cheaper generics for every prescribed brand." },
            { icon: Stethoscope, title: "24/7 AI Doctor", desc: "Ask follow-up questions to your personal AI assistant." },
          ].map((f) => (
            <div key={f.title} className="group rounded-2xl border border-border bg-gradient-card p-6 shadow-card transition-all hover:shadow-glow hover:-translate-y-1">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-gradient-primary group-hover:text-primary-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-hero p-12 text-center text-primary-foreground shadow-glow md:p-20">
          <div className="absolute inset-0 bg-gradient-glow opacity-30" />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold md:text-5xl">Ready to scan your first prescription?</h2>
            <p className="mx-auto mt-4 max-w-xl opacity-90">Join 250,000+ patients and clinicians who trust MedScan AI.</p>
            <Button asChild size="lg" className="mt-8 h-12 bg-background px-8 text-foreground hover:bg-background/90">
              <Link to="/signup">Create free account <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © 2026 MedScan AI · Not a substitute for professional medical advice.
      </footer>
    </div>
  );
}
