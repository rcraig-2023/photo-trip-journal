import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EditorialPhotoMosaic } from "@/components/EditorialPhotoMosaic";
import { Require } from "@/components/Require";
import { PhotoGrid } from "@/components/PhotoGrid";
import { fmtRange, fmtTime, useCity, useEntries, type Kind } from "@/lib/touri";
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
  const entries = useEntries({ cityId });
  const [filter, setFilter] = useState<Kind | "all">("all");

  const items = (entries.data ?? [])
    .filter((e) => e.status !== "pending")
    .filter((e) => filter === "all" || e.kind === filter)
    .slice()
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const days = new Map<string, typeof items>();
  for (const e of items) {
    const k = e.occurred_at.slice(0, 10);
    days.set(k, [...(days.get(k) ?? []), e]);
  }

  return (
    <div>
      <header className="px-6 pt-12">
        <Link to="/trip" className="eyebrow">
          ← Trip
        </Link>
        <h1 className="display mt-5 text-[3.4rem]">{city.data?.name ?? ""}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {city.data?.country ? `${city.data.country} · ` : ""}
          {fmtRange(city.data?.start_date, city.data?.end_date)}
        </p>
        <Link
          to="/add/photos"
          search={{ city: cityId }}
          className="mt-4 inline-block text-xs uppercase tracking-[0.14em] text-accent"
        >
          + Add photos here
        </Link>
      </header>


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
              <li key={e.id} className="px-6">
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
