import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { useSession } from "@/lib/session";
import { useTrips } from "@/lib/touri";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Touri" },
      { name: "description", content: "Your account, trips and Touri app preferences." },
      { property: "og:title", content: "Settings — Touri" },
      { property: "og:description", content: "Your account, trips and Touri app preferences." },
    ],
  }),
  component: () => (
    <Require>
      <AppShell>
        <SettingsPage />
      </AppShell>
    </Require>
  ),
});

function SettingsPage() {
  const { user } = useSession();
  const trips = useTrips();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function activate(id: string) {
    if (!user) return;
    await supabase.from("trips").update({ is_active: false }).eq("user_id", user.id);
    await supabase.from("trips").update({ is_active: true }).eq("id", id);
    qc.invalidateQueries();
  }

  return (
    <div className="px-6 pt-12">
      <span className="eyebrow">Settings</span>
      <h1 className="display mt-5 text-[2.8rem]">{user?.email}</h1>

      <h2 className="eyebrow mt-12">Your trips</h2>
      <ul className="mt-2">
        {trips.data?.map((t) => (
          <li key={t.id} className="hairline flex items-center justify-between py-4">
            <span className="display text-xl">{t.title}</span>
            {t.is_active ? (
              <span className="eyebrow text-accent">Current</span>
            ) : (
              <button onClick={() => activate(t.id)} className="eyebrow underline underline-offset-4">
                Make current
              </button>
            )}
          </li>
        ))}
      </ul>
      <Link to="/trips/new" className="mt-6 inline-block text-xs uppercase tracking-[0.18em] text-accent">
        + New trip
      </Link>

      <h2 className="eyebrow mt-14">Install</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Add Touri to your home screen from your browser's share menu to open it like an app.
      </p>

      <button
        onClick={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth" });
        }}
        className="mt-14 w-full border border-rule py-4 text-xs uppercase tracking-[0.18em]"
      >
        Sign out
      </button>
    </div>
  );
}
