import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { Photo } from "@/components/Photo";
import { fmtRange, useActiveTrip, useCities, useEntries, useTrips } from "@/lib/touri";

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
  const { trip } = useActiveTrip();
  const all = useTrips();
  const cities = useCities(trip?.id);
  const entries = useEntries({ tripId: trip?.id, limit: 60 });

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

  return (
    <div>
      <header className="px-6 pt-12">
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
        {(all.data?.length ?? 0) > 1 && (
          <ul className="mt-6">
            {all.data
              ?.filter((t) => t.id !== trip.id)
              .map((t) => (
                <li key={t.id} className="hairline py-3 text-sm text-muted-foreground">
                  {t.title} · {fmtRange(t.start_date, t.end_date)}
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
