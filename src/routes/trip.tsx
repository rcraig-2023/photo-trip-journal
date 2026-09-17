import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Require } from "@/components/Require";
import { Photo } from "@/components/Photo";
import type { MapPoint } from "@/components/JourneyMap";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { fmtRange, useActiveTrip, useCities, useEntries, useTrips } from "@/lib/touri";

const JourneyMap = lazy(() => import("@/components/JourneyMap"));

export const Route = createFileRoute("/trip")({
  head: () => ({
    meta: [
      { title: "Trip overview — Touri" },
      {
        name: "description",
        content: "Every city in your current trip, in the order you travelled them.",
      },
      { property: "og:title", content: "Trip overview — Touri" },
      {
        property: "og:description",
        content: "Every city in your current trip, in the order you travelled them.",
      },
    ],
  }),
  component: () => (
    <Require>
      <AppShell>
        <TripPage />
      </AppShell>
    </Require>
  ),
});

function TripPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const { trip } = useActiveTrip();
  const all = useTrips();
  const cities = useCities(trip?.id);
  const entries = useEntries({ tripId: trip?.id, limit: 60 });
  const archiveTrips = (all.data ?? []).filter((candidate) => candidate.id !== trip?.id);
  const archiveIds = archiveTrips.map((candidate) => candidate.id);
  const archiveCovers = useQuery({
    queryKey: ["trip-archive-covers", archiveIds],
    enabled: archiveIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("trip_id, entry_photos(storage_path)")
        .in("trip_id", archiveIds)
        .neq("status", "pending")
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const covers = new Map<string, string>();
      for (const entry of data ?? []) {
        const path = entry.entry_photos?.[0]?.storage_path;
        if (entry.trip_id && path && !covers.has(entry.trip_id)) covers.set(entry.trip_id, path);
      }
      return covers;
    },
  });

  async function activateTrip(id: string) {
    if (!user || switchingId) return;
    setSwitchingId(id);
    try {
      const { error: clearError } = await supabase
        .from("trips")
        .update({ is_active: false })
        .eq("user_id", user.id);
      if (clearError) throw clearError;

      const { error: activateError } = await supabase
        .from("trips")
        .update({ is_active: true })
        .eq("id", id);
      if (activateError) {
        if (trip) await supabase.from("trips").update({ is_active: true }).eq("id", trip.id);
        throw activateError;
      }

      await qc.invalidateQueries();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open that trip.");
    } finally {
      setSwitchingId(null);
    }
  }

  if (!trip)
    return (
      <div className="px-6 py-16">
        <h1 className="display text-4xl">No trip yet</h1>
        <Link to="/trips/new" className="mt-6 inline-block text-xs uppercase tracking-[0.18em] text-accent">
          Start one →
        </Link>
      </div>
    );

  const coverFor = (cityId: string) =>
    entries.data?.find((e) => e.city_id === cityId && e.entry_photos?.length)?.entry_photos?.[0]
      ?.storage_path;

  const points: MapPoint[] = (cities.data ?? [])
    .filter((c) => c.lat != null && c.lng != null)
    .map((c) => ({ id: c.id, name: c.name, lat: Number(c.lat), lng: Number(c.lng) }));

  return (
    <div>
      {points.length > 0 && (
        <div className="h-64 w-full overflow-hidden border-b border-rule">
          <ClientOnly fallback={<div className="h-full w-full bg-muted/30" />}>
            <Suspense fallback={<div className="h-full w-full bg-muted/30" />}>
              <JourneyMap points={points} />
            </Suspense>
          </ClientOnly>
        </div>
      )}
      <header className="px-6 pt-10">
        <span className="eyebrow">Current trip</span>
        <h1 className="display mt-5 text-[3rem]">{trip.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {fmtRange(trip.start_date, trip.end_date)} · {cities.data?.length ?? 0} cities ·{" "}
          {entries.data?.length ?? 0} memories
        </p>
      </header>

      <ol className="mt-10">
        {cities.data?.map((c, i) => {
          const cover = coverFor(c.id);
          return (
            <li key={c.id} className="px-6">
              <Link
                to="/city/$cityId"
                params={{ cityId: c.id }}
                className="block border-t border-rule py-6"
              >
                <div className={i % 2 === 0 ? "" : "pl-10"}>
                  <span className="timecode">{String(i + 1).padStart(2, "0")}</span>
                  <h2 className="display mt-1 text-4xl">{c.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {c.country ? `${c.country} · ` : ""}
                    {fmtRange(c.start_date, c.end_date)}
                  </p>
                  {cover && (
                    <Photo
                      path={cover}
                      alt={c.name}
                      className={i % 2 === 0 ? "mt-4 aspect-[3/2] w-full" : "mt-4 aspect-square w-2/3"}
                    />
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="px-6 py-10">
        <Link to="/trips/new" className="text-xs uppercase tracking-[0.18em] text-accent">
          + Start another trip
        </Link>
        {archiveTrips.length > 0 && (
          <section className="mt-12">
            <h2 className="eyebrow">Travel Archive</h2>
            <div className="-mx-6 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-3">
              {archiveTrips.map((archiveTrip) => {
                const cover = archiveCovers.data?.get(archiveTrip.id);
                const isSwitching = switchingId === archiveTrip.id;
                return (
                  <Button
                    key={archiveTrip.id}
                    type="button"
                    variant="ghost"
                    disabled={switchingId !== null}
                    onClick={() => activateTrip(archiveTrip.id)}
                    className="group h-auto w-[78%] shrink-0 snap-start flex-col items-stretch justify-start gap-0 overflow-hidden rounded-sm border border-rule bg-paper p-0 text-left whitespace-normal transition duration-300 hover:-translate-y-1 hover:bg-paper hover:shadow-lg sm:w-[62%]"
                  >
                    {cover ? (
                      <Photo path={cover} alt={archiveTrip.title} className="aspect-[3/2] w-full" />
                    ) : (
                      <div className="flex aspect-[3/2] w-full items-center justify-center bg-muted">
                        <span className="display text-5xl text-muted-foreground/35">
                          {archiveTrip.title.slice(0, 1)}
                        </span>
                      </div>
                    )}
                    <span className="flex w-full items-end justify-between gap-4 px-4 py-4">
                      <span className="min-w-0">
                        <span className="display block text-2xl leading-tight text-foreground">
                          {archiveTrip.title}
                        </span>
                        <span className="timecode mt-2 block">
                          {fmtRange(archiveTrip.start_date, archiveTrip.end_date) || "Dates not set"}
                        </span>
                      </span>
                      <ArrowRight
                        className="mb-1 size-5 shrink-0 text-accent transition-transform duration-300 group-hover:translate-x-1"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </span>
                    {isSwitching && <span className="sr-only">Opening trip</span>}
                  </Button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
