import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { CityAutocomplete } from "@/components/CityAutocomplete";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { createGuestTrip } from "@/lib/guestStore";
import { TIER_LIMITS, useTierAccess } from "@/lib/tiers";

export const Route = createFileRoute("/trips/new")({
  head: () => ({
    meta: [
      { title: "Start a trip — Touri" },
      { name: "description", content: "Name your trip and list the cities you'll pass through." },
      { property: "og:title", content: "Start a trip — Touri" },
      {
        property: "og:description",
        content: "Name your trip and list the cities you'll pass through.",
      },
    ],
  }),
  component: () => (
    <Require>
      <AppShell>
        <NewTrip />
      </AppShell>
    </Require>
  ),
});

type Row = {
  name: string;
  country: string;
  start: string;
  end: string;
  lat: number | null;
  lng: number | null;
};

const emptyRow = (): Row => ({ name: "", country: "", start: "", end: "", lat: null, lng: null });

function NewTrip() {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string | null>(null);
  const access = useTierAccess();
  const navigate = useNavigate();
  const qc = useQueryClient();

  function addAnotherCity() {
    if (!access.isPaid && rows.length >= access.limits.maxCitiesPerTrip) {
      setUpgradeReason(
        !access.isAuthenticated
          ? "Guest preview includes 1 city chapter. Create a free account or unlock a Trip Pass to plan multi-city journeys."
          : `Free Explorer includes ${TIER_LIMITS.free.maxCitiesPerTrip} city chapter per trip. Unlock a Single Trip Pass ($9) or Touri Pro ($29/yr) to add unlimited cities.`,
      );
      setUpgradeOpen(true);
      return;
    }
    setRows([...rows, emptyRow()]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!access.canCreateTrip) {
      setUpgradeReason(
        !access.isAuthenticated
          ? "Guest preview includes 1 active trip. Create a free account to save your journal."
          : `Free Explorer includes ${TIER_LIMITS.free.maxTrips} trip. Unlock Touri Pro ($29/yr) for unlimited trips and archive access.`,
      );
      setUpgradeOpen(true);
      return;
    }

    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;

    const validCities = rows
      .filter((r) => r.name.trim())
      .slice(0, access.limits.maxCitiesPerTrip);

    if (!uid) {
      createGuestTrip({
        title: title.trim(),
        start_date: start || null,
        end_date: end || null,
        cities: validCities.map((r) => ({
          name: r.name.trim(),
          country: r.country.trim() || null,
          start_date: r.start || null,
          end_date: r.end || null,
          lat: r.lat,
          lng: r.lng,
        })),
      });
      await qc.invalidateQueries();
      setBusy(false);
      navigate({ to: "/trip" });
      return;
    }

    await supabase.from("trips").update({ is_active: false }).eq("user_id", uid);
    const { data: trip, error } = await supabase
      .from("trips")
      .insert({
        user_id: uid,
        title: title.trim(),
        start_date: start || null,
        end_date: end || null,
        is_active: true,
      })
      .select()
      .single();

    if (error || !trip) {
      setBusy(false);
      toast.error(error?.message ?? "Could not save the trip.");
      return;
    }

    const cities = validCities.map((r, i) => ({
      user_id: uid,
      trip_id: trip.id,
      name: r.name.trim(),
      country: r.country.trim() || null,
      start_date: r.start || null,
      end_date: r.end || null,
      sort_order: i,
      lat: r.lat,
      lng: r.lng,
    }));
    if (cities.length) await supabase.from("cities").insert(cities);

    await qc.invalidateQueries();
    setBusy(false);
    navigate({ to: "/trip" });
  }

  return (
    <form onSubmit={save} className="px-6 pt-12">
      <span className="eyebrow">New trip</span>
      <input
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Autumn in Europe"
        className="display mt-6 w-full bg-transparent text-[2.6rem] outline-none placeholder:text-muted-foreground/50"
      />
      <div className="mt-8 flex gap-6">
        <label className="flex-1">
          <span className="eyebrow">From</span>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-2 w-full border-b border-rule bg-transparent pb-2 outline-none"
          />
        </label>
        <label className="flex-1">
          <span className="eyebrow">To</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-2 w-full border-b border-rule bg-transparent pb-2 outline-none"
          />
        </label>
      </div>

      <h2 className="eyebrow mt-12">Cities</h2>
      {rows.map((r, i) => (
        <div key={i} className="hairline mt-4 pt-4">
          <CityAutocomplete
            value={r.name}
            onChange={(v) =>
              setRows(
                rows.map((x, j) =>
                  i === j ? { ...x, name: v, country: "", lat: null, lng: null } : x,
                ),
              )
            }
            onPick={(hit) =>
              setRows(
                rows.map((x, j) =>
                  i === j
                    ? { ...x, name: hit.name, country: hit.country ?? "", lat: hit.lat, lng: hit.lng }
                    : x,
                ),
              )
            }
            placeholder="London"
            className="display w-full bg-transparent text-2xl outline-none placeholder:text-muted-foreground/40"
          />
          {r.country && (
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {r.country}
            </p>
          )}
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <input
              type="date"
              value={r.start}
              onChange={(e) =>
                setRows(rows.map((x, j) => (i === j ? { ...x, start: e.target.value } : x)))
              }
              className="bg-transparent outline-none"
            />
            <input
              type="date"
              value={r.end}
              onChange={(e) =>
                setRows(rows.map((x, j) => (i === j ? { ...x, end: e.target.value } : x)))
              }
              className="bg-transparent outline-none"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addAnotherCity}
        className="mt-5 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-accent"
      >
        + Another city
        {!access.isPaid && rows.length >= access.limits.maxCitiesPerTrip && (
          <Lock className="size-3" />
        )}
      </button>

      <button
        disabled={busy}
        className="mt-12 w-full bg-primary py-4 text-xs uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-50"
      >
        Begin the journal
      </button>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        tripTitle={title.trim() || null}
        reason={upgradeReason}
      />
    </form>
  );
}
