import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { Require } from "@/components/Require";
import { Photo } from "@/components/Photo";
import { RankedPlaceCard } from "@/components/RankedPlaceCard";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { fmtDay, fmtRange, fmtTime, type City, type Entry, type Trip } from "@/lib/touri";

type Layout = "standard" | "compact";

/**
 * Read-only, print-ready Timelined Album. No app shell, no nav, no filters.
 * Reach it from the Trip overview ("Download as PDF →").
 */
export const Route = createFileRoute("/trip/$tripId/export")({
  head: () => ({
    meta: [
      { title: "Trip album — Touri" },
      {
        name: "description",
        content: "A read-only, print-ready timeline album of your trip.",
      },
      { property: "og:title", content: "Trip album — Touri" },
      {
        property: "og:description",
        content: "A read-only, print-ready timeline album of your trip.",
      },
    ],
  }),
  component: () => (
    <Require>
      <ExportPage />
    </Require>
  ),
});

function ExportPage() {
  const { tripId } = Route.useParams();

  const tripQ = useQuery({
    queryKey: ["export-trip", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId)
        .maybeSingle();
      if (error) throw error;
      return data as Trip | null;
    },
  });

  const citiesQ = useQuery({
    queryKey: ["export-cities", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cities")
        .select("*")
        .eq("trip_id", tripId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as City[];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["export-entries", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("*, entry_photos(id, storage_path, sha256)")
        .eq("trip_id", tripId)
        .eq("status", "confirmed")
        .order("occurred_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  if (tripQ.isLoading || citiesQ.isLoading || entriesQ.isLoading) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-2xl bg-paper px-6 py-24">
        <p className="eyebrow">Preparing your album…</p>
      </div>
    );
  }

  const trip = tripQ.data;
  if (!trip) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-2xl bg-paper px-6 py-24 print:hidden">
        <h1 className="display text-4xl">Trip not found</h1>
        <Link
          to="/trip"
          className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-accent"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to your trip
        </Link>
      </div>
    );
  }

  const cities = citiesQ.data ?? [];
  const entries = entriesQ.data ?? [];

  const byCity = new Map<string, Entry[]>();
  const loose: Entry[] = [];
  for (const e of entries) {
    if (e.city_id) {
      const list = byCity.get(e.city_id);
      if (list) list.push(e);
      else byCity.set(e.city_id, [e]);
    } else {
      loose.push(e);
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl bg-paper">
      {/* Screen-only toolbar */}
      <div className="sticky top-0 z-20 border-b border-rule bg-paper/95 backdrop-blur print:hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-3">
          <Link
            to="/trip"
            className="inline-flex shrink-0 items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground"
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} /> Trip
          </Link>

          <div className="flex items-center gap-2">
            {entries.length > 1 && (
              <div
                role="group"
                aria-label="Album layout"
                className="flex border border-rule bg-paper"
              >
                {(["standard", "compact"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={layout === l}
                    onClick={() => setLayout(l)}
                    className={cn(
                      "px-3 py-2 text-[0.6875rem] uppercase tracking-[0.14em] transition-colors",
                      layout === l
                        ? "bg-foreground text-paper"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {l === "standard" ? "Standard" : "Compact grid"}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex shrink-0 items-center gap-2 bg-foreground px-4 py-2.5 text-xs uppercase tracking-[0.14em] text-paper transition-opacity hover:opacity-85"
            >
              <Printer className="size-4" strokeWidth={1.5} /> Download as PDF
            </button>
          </div>
        </div>
      </div>

      {/* Masthead */}
      <header className="break-inside-avoid px-6 pb-10 pt-14 print:pt-4">
        <span className="eyebrow">Touri · Travel journal</span>
        <h1 className="display mt-5 text-[3rem]">{trip.title}</h1>
        <p className="timecode mt-4">
          {[
            fmtRange(trip.start_date, trip.end_date) || "Dates not set",
            `${cities.length} ${cities.length === 1 ? "city" : "cities"}`,
            `${entries.length} ${entries.length === 1 ? "memory" : "memories"}`,
          ].join(" · ")}
        </p>
      </header>

      {entries.length === 0 && (
        <p className="px-6 pb-24 text-sm text-muted-foreground">
          No confirmed memories in this trip yet — nothing to export.
        </p>
      )}

      {cities.map((c, i) => {
        const cityEntries = byCity.get(c.id) ?? [];
        if (!cityEntries.length) return null;
        return (
          <section key={c.id} className="px-6 pb-12">
            <div className="break-inside-avoid border-t border-rule pt-6">
              <span className="timecode">{String(i + 1).padStart(2, "0")}</span>
              <h2 className="display mt-1 text-4xl">{c.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {c.country ? `${c.country} · ` : ""}
                {fmtRange(c.start_date, c.end_date)}
              </p>
            </div>
            <DayGroups entries={cityEntries} />
          </section>
        );
      })}

      {loose.length > 0 && (
        <section className="px-6 pb-12">
          <div className="break-inside-avoid border-t border-rule pt-6">
            <h2 className="display text-4xl">Along the way</h2>
          </div>
          <DayGroups entries={loose} />
        </section>
      )}

      <footer className="break-inside-avoid px-6 pb-20 pt-4 text-center">
        <span className="timecode">Made with Touri</span>
      </footer>
    </div>
  );
}

function DayGroups({ entries }: { entries: Entry[] }) {
  const groups: { day: string; items: Entry[] }[] = [];
  for (const e of entries) {
    const day = e.occurred_at.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <div className="mt-6 space-y-10">
      {groups.map((g) => (
        <div key={g.day}>
          <h3 className="eyebrow break-inside-avoid">{fmtDay(g.items[0]!.occurred_at)}</h3>
          <div className="mt-5 space-y-9">
            {g.items.map((e) => (
              <ExportEntry key={e.id} entry={e} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExportEntry({ entry: e }: { entry: Entry }) {
  if (e.kind === "restaurant" || e.kind === "landmark") {
    return (
      <div className="break-inside-avoid">
        <RankedPlaceCard entry={e} />
      </div>
    );
  }

  const photos = e.entry_photos ?? [];
  return (
    <article className="break-inside-avoid border-t border-rule pt-5">
      <span className="timecode">{fmtTime(e.occurred_at)}</span>
      {e.title && <h4 className="display mt-1 text-2xl">{e.title}</h4>}
      {e.body && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {e.body}
        </p>
      )}
      {photos.length > 0 && (
        <div className={photos.length === 1 ? "mt-4" : "mt-4 grid grid-cols-2 gap-[2px]"}>
          {photos.slice(0, 4).map((p) => (
            <Photo
              key={p.id}
              path={p.storage_path}
              alt={e.title ?? "Travel memory"}
              className={photos.length === 1 ? "aspect-[4/3] w-full" : "aspect-square w-full"}
            />
          ))}
        </div>
      )}
    </article>
  );
}
