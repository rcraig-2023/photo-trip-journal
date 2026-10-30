import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { useSession } from "@/lib/session";
import { TIER_LIMITS, useTierAccess } from "@/lib/tiers";
import { useActiveTrip, useTrips } from "@/lib/touri";
import { cn } from "@/lib/utils";

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
  const { trip } = useActiveTrip();
  const trips = useTrips();
  const access = useTierAccess(trip?.id);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
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
      <h1 className="display mt-5 break-words text-[2.6rem]">
        {user?.email ?? "Guest Preview"}
      </h1>

      {/* Membership & Quota Section */}
      <section className="mt-10 border border-rule bg-paper p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="eyebrow text-accent">Membership Plan</span>
            <h2 className="display mt-1 text-2xl">{access.limits.label}</h2>
          </div>
          {!user ? (
            <Link
              to="/auth"
              className="bg-primary px-4 py-2 text-xs uppercase tracking-[0.16em] text-primary-foreground"
            >
              Sign up free →
            </Link>
          ) : !access.isPaid ? (
            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              className="inline-flex items-center gap-1.5 bg-primary px-4 py-2 text-xs uppercase tracking-[0.16em] text-primary-foreground"
            >
              <Sparkles className="size-3.5" /> Upgrade
            </button>
          ) : (
            <span className="eyebrow text-accent">Active</span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-rule pt-4 text-xs">
          <div>
            <span className="eyebrow block text-[0.62rem]">
              {user ? "Cloud Photos" : "Local Browser Photos"}
            </span>
            <span className="timecode mt-1 block text-sm text-foreground">
              {access.photosUsed} / {access.limits.maxPhotos}
            </span>
          </div>
          <div>
            <span className="eyebrow block text-[0.62rem]">AI Place Scans</span>
            <span className="timecode mt-1 block text-sm text-foreground">
              {access.aiScansUsed} / {access.limits.maxAiScans}
            </span>
          </div>
        </div>

        {/* Creator Tier Switcher (restricted to app creator account) */}
        {access.isCreator && (
          <div className="mt-5 border-t border-rule pt-4">
            <span className="eyebrow block text-[0.6rem]">
              Creator Tier Switcher ({user?.email})
            </span>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              Your creator account defaults to Touri Pro ($0). Switch below to test any user stage live:
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {(
                [
                  { id: "guest", label: `Guest (${TIER_LIMITS.guest.maxPhotos} local)` },
                  { id: "free", label: `Free (${TIER_LIMITS.free.maxPhotos} photos)` },
                  { id: "trip_pass", label: "Trip Pass ($9)" },
                  { id: "pro", label: "Touri Pro ($29/yr)" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={async () => {
                    await access.updatePlan(option.id, trip?.id);
                    toast.success(`Creator view switched to ${option.label}`);
                  }}
                  className={cn(
                    "border px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.12em]",
                    access.tier === option.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-rule text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <h2 className="eyebrow mt-12">Your trips</h2>
      <ul className="mt-2">
        {trips.data?.map((t) => (
          <li key={t.id} className="hairline flex items-center justify-between py-4">
            <span className="display text-xl">{t.title}</span>
            {t.is_active ? (
              <span className="eyebrow text-accent">Current</span>
            ) : (
              <button
                onClick={() => activate(t.id)}
                className="eyebrow underline underline-offset-4"
              >
                Make current
              </button>
            )}
          </li>
        ))}
      </ul>
      {access.canCreateTrip ? (
        <Link
          to="/trips/new"
          className="mt-6 inline-block text-xs uppercase tracking-[0.18em] text-accent"
        >
          + New trip
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setUpgradeOpen(true)}
          className="mt-6 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-accent"
        >
          + New trip <Lock className="size-3" />
        </button>
      )}

      <h2 className="eyebrow mt-14">Install</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Add Touri to your home screen from your browser's share menu to open it like an app.
      </p>

      {user ? (
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
          className="mt-14 w-full border border-rule py-4 text-xs uppercase tracking-[0.18em]"
        >
          Sign out
        </button>
      ) : (
        <Link
          to="/auth"
          className="mt-14 block w-full border border-rule py-4 text-center text-xs uppercase tracking-[0.18em]"
        >
          Sign in or Create Account
        </Link>
      )}

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        tripId={trip?.id}
        tripTitle={trip?.title}
      />
    </div>
  );
}
