import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Share2 } from "lucide-react";
import { AddCityDialog } from "@/components/AddCityDialog";
import { AppShell } from "@/components/AppShell";
import { EditorialPhotoMosaic } from "@/components/EditorialPhotoMosaic";
import { Require } from "@/components/Require";
import { PhotoGrid } from "@/components/PhotoGrid";
import { RankedPlaceCard } from "@/components/RankedPlaceCard";
import { GhostEntry, ItineraryImporter, SavedIdeas } from "@/components/Planned";
import { ShareCityGuideDialog } from "@/components/ShareCityGuideDialog";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { TIER_LIMITS, useTierAccess } from "@/lib/tiers";
import {
  fmtRange,
  fmtTime,
  useActiveTrip,
  useCities,
  useCity,
  useEntries,
  useTrips,
  type Kind,
} from "@/lib/touri";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/city/$cityId")({
  head: () => ({
    meta: [
      { title: "City chapter — Touri" },
      {
        name: "description",
        content: "A day-by-day timeline of photos, jots, landmarks and meals in this city.",
      },
      { property: "og:title", content: "City chapter — Touri" },
      {
        property: "og:description",
        content: "A day-by-day timeline of photos, jots, landmarks and meals in this city.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Require>
      <AppShell>
        <CityPage />
      </AppShell>
    </Require>
  ),
});

const FILTERS: { key: Kind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "jot", label: "Jots" },
  { key: "landmark", label: "Landmarks" },
  { key: "photo", label: "Photos" },
  { key: "restaurant", label: "Restaurants" },
];

function CityPage() {
  const { cityId } = Route.useParams();
  const city = useCity(cityId);
  const { trip: activeTrip } = useActiveTrip();
  const allTrips = useTrips();
  const tripId = city.data?.trip_id ?? activeTrip?.id;
  const tripForCity =
    (allTrips.data ?? []).find((t) => t.id === tripId) ?? activeTrip ?? null;
  const tripCities = useCities(tripId);
  const access = useTierAccess(tripId);
  const entries = useEntries({ cityId });
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [shareOpen, setShareOpen] = useState(false);
  const [addCityOpen, setAddCityOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const hash = useLocation({ select: (l) => l.hash });

  const isSingleCityTrip = (tripCities.data?.length ?? 0) === 1;

  useEffect(() => {
    const cleanHash = hash.replace(/^#/, "");
    if (!cleanHash.startsWith("entry-") || entries.isLoading) return;
    const entryId = cleanHash.slice("entry-".length);
    if (!entryId) return;

    const timer = window.setTimeout(() => {
      const el = document.getElementById(`entry-${entryId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedId(entryId);
      }
    }, 80);

    const clearTimer = window.setTimeout(() => {
      setHighlightedId((curr) => (curr === entryId ? null : curr));
    }, 2600);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [hash, entries.isLoading, entries.data?.length]);

  const shareableEntries = (entries.data ?? [])
    .filter(
      (e) =>
        e.status === "confirmed" &&
        (e.kind === "restaurant" || e.kind === "landmark"),
    )
    .map((e) => ({
      ...e,
      cities: city.data
        ? { id: city.data.id, name: city.data.name, country: city.data.country }
        : (e.cities ?? null),
    }));

  const items = (entries.data ?? [])
    .filter((e) => e.status !== "pending" && !(e.status === "planned" && e.date_unknown))
    .filter((e) => filter !== "photo" || e.status !== "planned")
    .filter((e) =>
      filter === "all" ||
      (filter === "photo" ? !!e.entry_photos?.length : e.kind === filter),
    )
    .slice()
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const ideas = (entries.data ?? []).filter((e) => e.status === "planned" && e.date_unknown);
  const days = new Map<string, typeof items>();
  for (const e of items) {
    const k = e.occurred_at.slice(0, 10);
    days.set(k, [...(days.get(k) ?? []), e]);
  }

  return (
    <div>
      <header className="px-6 pt-12">
        {isSingleCityTrip ? (
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="eyebrow">
              {tripForCity?.title ?? city.data?.trips?.title ?? "Current trip"}
            </span>
            <Link
              to="/trip"
              search={{ overview: "1" }}
              className="eyebrow underline underline-offset-4"
            >
              Switch Trip →
            </Link>
          </div>
        ) : (
          <Link to="/trip" className="eyebrow">
            ← Trip
          </Link>
        )}
        <h1 className="display mt-5 text-[3.4rem]">{city.data?.name ?? ""}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {city.data?.country ? `${city.data.country} · ` : ""}
          {fmtRange(city.data?.start_date, city.data?.end_date)}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <Link
            to="/add/photos"
            search={{
              city: cityId,
              cityId,
              returnTo: `/city/${cityId}`,
            }}
            className="inline-block text-xs uppercase tracking-[0.14em] text-accent"
          >
            + Add photos here
          </Link>
          {shareableEntries.length > 0 && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-accent"
            >
              <Share2 className="size-3.5" /> Share {city.data?.name ?? "City"} List
            </button>
          )}
          {isSingleCityTrip && tripForCity && (
            <>
              <ItineraryImporter
                trip={tripForCity}
                cities={tripCities.data ?? (city.data ? [city.data] : [])}
                label="Paste Itinerary"
                className="mt-0 tracking-[0.14em]"
              />
              <Link
                to="/trip/$tripId/export"
                params={{ tripId: tripForCity.id }}
                className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-accent"
              >
                Export Album
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (access.canAddCity) {
                    setAddCityOpen(true);
                  } else {
                    setUpgradeReason(
                      !access.isAuthenticated
                        ? "Guest preview includes 1 city chapter. Create a free account or unlock a Trip Pass to plan multi-city journeys."
                        : `Free Explorer includes ${TIER_LIMITS.free.maxCitiesPerTrip} city chapter per trip. Unlock a Single Trip Pass ($9) or Touri Pro ($29/yr) to add unlimited cities.`,
                    );
                    setUpgradeOpen(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-accent"
              >
                + Add City
                {!access.canAddCity && <Lock className="size-3" />}
              </button>
              <Link
                to="/trip"
                search={{ overview: "1" }}
                className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              >
                Switch Trip
              </Link>
            </>
          )}
        </div>
      </header>

      <ShareCityGuideDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        entries={shareableEntries}
        initialCityId={cityId}
      />

      <AddCityDialog
        open={addCityOpen}
        onOpenChange={setAddCityOpen}
        trip={tripForCity}
      />

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={(next) => {
          setUpgradeOpen(next);
          if (!next) setUpgradeReason(null);
        }}
        tripId={tripForCity?.id}
        tripTitle={tripForCity?.title}
        reason={upgradeReason}
      />


      <SavedIdeas entries={ideas} />

      <div className="sticky top-0 z-20 mt-8 flex gap-5 overflow-x-auto border-b border-rule bg-paper/90 px-6 py-3 text-xs uppercase tracking-[0.14em] backdrop-blur-md">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "whitespace-nowrap text-muted-foreground",
              filter === f.key && "text-accent",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filter === "photo" ? (
        <EditorialPhotoMosaic entries={items} />
      ) : (
        [...days.entries()].map(([day, list]) => (
        <section key={day} className="mt-10">
          <h2 className="eyebrow px-6">
            {new Date(day + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h2>
          <ol className="mt-2">
            {list.map((e) => (
              <li
                key={e.id}
                id={`entry-${e.id}`}
                className={cn(
                  "scroll-mt-24 px-6 transition-all duration-500",
                  highlightedId === e.id &&
                    "bg-accent/5 ring-2 ring-inset ring-accent/70",
                )}
              >
                {e.status === "planned" ? (
                  <GhostEntry entry={e} />
                ) : e.kind === "restaurant" || e.kind === "landmark" ? (
                  <div className="py-3">
                    <RankedPlaceCard entry={e} />
                  </div>
                ) : (
                  <Link
                    to="/entry/$entryId"
                    params={{ entryId: e.id }}
                    className="flex gap-4 border-t border-rule py-5"
                  >
                    <span className="timecode w-12 shrink-0 pt-1">{fmtTime(e.occurred_at)}</span>
                    <div className="min-w-0 flex-1">
                      {e.kind !== "jot" && (
                        <h3 className="display text-[1.75rem] leading-tight">
                          {e.title ?? "Untitled"}
                        </h3>
                      )}
                      {e.place_name && (
                        <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          {e.place_name}
                        </p>
                      )}
                      {e.body && (
                        <p
                          className={cn(
                            "text-sm leading-relaxed",
                            e.kind === "jot"
                              ? "font-[var(--font-display)] text-lg italic leading-snug"
                              : "mt-2 text-muted-foreground",
                          )}
                        >
                          {e.kind === "jot" ? `“${e.body}”` : e.body}
                        </p>
                      )}
                      {!!e.entry_photos?.length && (
                        <PhotoGrid
                          photos={e.entry_photos}
                          alt={e.title ?? "Memory"}
                          className="mt-3"
                        />
                      )}
                    </div>
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
        ))
      )}

      {!items.length && (
        <p className="px-6 py-16 text-sm text-muted-foreground">
          This chapter is still blank. Tap + to add photos, a jot, a landmark or a meal.
        </p>
      )}
    </div>
  );
}
