import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useGuestState } from "@/lib/guestStore";
import { useSession } from "@/lib/session";
import { syncGuestToSupabase } from "@/lib/uploadQueue";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Touri travel diary" },
      {
        name: "description",
        content: "Sign in to Touri to keep your multi-city trips, photos and notes in one journal.",
      },
      { property: "og:title", content: "Sign in — Touri travel diary" },
      {
        property: "og:description",
        content: "Sign in to Touri to keep your multi-city trips, photos and notes in one journal.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const guest = useGuestState();
  const hasGuestMemories = guest.photos.length > 0 || guest.entries.length > 0;
  const [mode, setMode] = useState<"in" | "up">(hasGuestMemories ? "up" : "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function syncAndRedirect() {
      const synced = await syncGuestToSupabase(user!.id);
      if (synced > 0) {
        toast.success(
          `Synced ${synced} guest ${synced === 1 ? "memory" : "memories"} to your journal.`,
        );
        await qc.invalidateQueries();
      }
      if (active) navigate({ to: "/" });
    }
    void syncAndRedirect();
    return () => {
      active = false;
    };
  }, [user, navigate, qc]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const fn =
      mode === "in"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          });
    const { error } = await fn;
    setBusy(false);
    if (error) toast.error(error.message);
    else if (mode === "up") toast.success("Account created — welcome to Touri.");
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Could not sign in with Google.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-between px-6 py-12">
      <div>
        <div className="flex items-center justify-between">
          <span className="eyebrow">Touri</span>
          <Link to="/" className="eyebrow text-accent underline underline-offset-4">
            Try Guest Preview →
          </Link>
        </div>
        <h1 className="display mt-10 text-[3.4rem]">
          Your trip,
          <br />
          written down
          <br />
          as it happens.
        </h1>
        <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Photos from your phone, a few lines at dinner, the church you couldn't name. Touri keeps
          them in order, city by city.
        </p>

        {hasGuestMemories && (
          <div className="mt-6 border border-accent/40 bg-paper p-4">
            <span className="eyebrow flex items-center gap-1.5 text-accent">
              <Sparkles className="size-3.5" /> Ready to Save to Cloud
            </span>
            <p className="mt-1 text-xs leading-relaxed text-foreground">
              You have <strong>{guest.photos.length}</strong> local{" "}
              {guest.photos.length === 1 ? "photo" : "photos"} and{" "}
              <strong>{guest.entries.length}</strong>{" "}
              {guest.entries.length === 1 ? "memory" : "memories"} in your browser preview. Sign up
              or sign in below to save them permanently and run AI place recognition.
            </p>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="mt-12">
        <label className="eyebrow block">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full border-b border-rule bg-transparent pb-2 text-lg outline-none focus:border-accent"
          placeholder="you@example.com"
        />
        <label className="eyebrow mt-8 block">Password</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full border-b border-rule bg-transparent pb-2 text-lg outline-none focus:border-accent"
          placeholder="••••••••"
        />
        <button
          disabled={busy}
          className="mt-10 w-full bg-primary py-4 text-sm uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-50"
        >
          {mode === "in" ? "Sign in" : "Create free account"}
        </button>
        <button
          type="button"
          onClick={google}
          className="mt-3 w-full border border-rule py-4 text-sm uppercase tracking-[0.18em]"
        >
          Continue with Google
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="mt-6 w-full text-xs text-muted-foreground underline underline-offset-4"
        >
          {mode === "in" ? "No account yet? Create one" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
