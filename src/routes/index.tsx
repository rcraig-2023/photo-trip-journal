import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { PhotoGrid } from "@/components/PhotoGrid";
import {
  fmtDay,
  fmtRange,
  fmtTime,
  useActiveTrip,
  useCities,
  useEntries,
  usePendingCount,
} from "@/lib/touri";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — Touri travel diary" },
      {
        name: "description",
        content:
          "Touri turns the photos already on your phone into an editorial travel journal, city by city.",
      },
      { property: "og:title", content: "Today — Touri travel diary" },
      {
        property: "og:description",
        content:
          "Touri turns the photos already on your phone into an editorial travel journal, city by city.",
      },
    ],
  }),
  component: () => (
    <Require>
      <AppShell>
        <Today />
      </AppShell>
    </Require>
  ),
});

function Today() {
  const { trip, isLoading } = useActiveTrip();
  const cities = useCities(trip?.id);
  const entries = useEntries({ tripId: trip?.id, limit: 12 });
  const pending = usePendingCount();

  const today = new Date();
  const currentCity =
    cities.data?.find((c) => {
      if (!c.start_date || !c.end_date) return false;
      const iso = today.toISOString().slice(0, 10);
      return c.start_date <= iso && iso >= c.start_date && c.end_date >= iso;
    }) ?? cities.data?.[0];

  if (isLoading) return <div className="px-6 py-10 eyebrow">Opening your journal…</div>;

  if (!trip)
    return (
      <div className="px-6 py-16">
        <span className="eyebrow">Touri</span>
        <h1 className="display mt-6 text-5xl">Nothing written yet.</h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Start a trip, add the cities you'll pass through, then let your camera roll do the rest.
        </p>
        <Link
          to="/trips/new"
          className="mt-8 inline-block bg-primary px-6 py-4 text-xs uppercase tracking-[0.18em] text-primary-foreground"
        >
          Start a trip
        </Link>
      </div>
    );

  return (
    <div>
      <header className="px-6 pt-12">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">{fmtDay(today.toISOString())}</span>
          <Link to="/settings" className="eyebrow underline underline-offset-4">
            Settings
          </Link>
        </div>
        <h1 className="display mt-6 text-[3.2rem]">{currentCity?.name ?? trip.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {currentCity?.country ? `${currentCity.country} · ` : ""}
          {fmtRange(currentCity?.start_date ?? trip.start_date, currentCity?.end_date ?? trip.end_date)}
        </p>
        {currentCity && (
          <Link
            to="/city/$cityId"
            params={{ cityId: currentCity.id }}
            className="mt-4 inline-block text-xs uppercase tracking-[0.18em] text-accent"
          >
            Open the chapter →
          </Link>
        )}
      </header>

      {!!pending.data && (
        <Link
          to="/memories"
          className="mx-6 mt-8 flex items-baseline justify-between border-y border-rule py-4"
        >
          <span className="display text-xl">{pending.data} new memories waiting</span>
          <span className="eyebrow">Sort →</span>
        </Link>
      )}

      <section className="mt-10">
        <h2 className="eyebrow px-6">Lately</h2>
        <ul className="mt-3">
          {entries.data?.length ? (
            entries.data.map((e) => (
              <li key={e.id} className="px-6">
                <Link
                  to="/entry/$entryId"
                  params={{ entryId: e.id }}
                  className="block border-t border-rule py-5"
                >
                  <div className="flex gap-4">
                    <span className="timecode w-12 shrink-0 pt-1">{fmtTime(e.occurred_at)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="display text-2xl">
                        {e.title ?? (e.kind === "jot" ? "Jot" : "Untitled")}
                      </p>
                      {e.body && (
                        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {e.body}
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
                  </div>
                </Link>
              </li>
            ))
          ) : (
            <li className="px-6 text-sm text-muted-foreground">
              Nothing today yet. Tap + to add photos or a jot.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
