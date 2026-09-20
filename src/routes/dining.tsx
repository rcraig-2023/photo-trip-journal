import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { Photo } from "@/components/Photo";
import { PRICE_LABEL, useRestaurants, type Entry } from "@/lib/touri";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dining")({
  head: () => ({
    meta: [
      { title: "Dining — Touri" },
      {
        name: "description",
        content: "Every restaurant from your travels, with cuisine, price and your own rating.",
      },
      { property: "og:title", content: "Dining — Touri" },
      {
        property: "og:description",
        content: "Every restaurant from your travels, with cuisine, price and your own rating.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Require>
      <AppShell>
        <DiningPage />
      </AppShell>
    </Require>
  ),
});

type Sort = "recent" | "rated";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DiningPage() {
  const list = useRestaurants();
  const [city, setCity] = useState<string | "all">("all");
  const [cuisine, setCuisine] = useState<string | "all">("all");
  const [price, setPrice] = useState<number | "all">("all");
  const [sort, setSort] = useState<Sort>("recent");

  const all = useMemo(() => (list.data ?? []) as Entry[], [list.data]);

  const cities = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of all) if (e.cities) m.set(e.cities.id, e.cities.name);
    return [...m.entries()];
  }, [all]);

  const cuisines = useMemo(
    () => [...new Set(all.map((e) => e.cuisine_type).filter(Boolean) as string[])].sort(),
    [all],
  );

  const items = useMemo(() => {
    const out = all
      .filter((e) => city === "all" || e.city_id === city)
      .filter((e) => cuisine === "all" || e.cuisine_type === cuisine)
      .filter((e) => price === "all" || e.price_tier === price);
    return out.sort((a, b) =>
      sort === "rated"
        ? (b.personal_rating ?? -1) - (a.personal_rating ?? -1)
        : b.occurred_at.localeCompare(a.occurred_at),
    );
  }, [all, city, cuisine, price, sort]);

  return (
    <div>
      <header className="px-6 pt-12 pb-6">
        <span className="eyebrow">The table</span>
        <h1 className="display mt-4 text-[3.2rem] leading-[0.95]">Dining</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {all.length} {all.length === 1 ? "place" : "places"} across every trip
        </p>
      </header>

      <div className="sticky top-0 z-20 border-b border-rule bg-paper/90 backdrop-blur-md">
        <div className="flex gap-2 overflow-x-auto px-6 py-3">
          <Chip active={sort === "recent"} onClick={() => setSort("recent")}>
            Most recent
          </Chip>
          <Chip active={sort === "rated"} onClick={() => setSort("rated")}>
            Highest rated
          </Chip>
          <span className="my-1 w-px shrink-0 bg-rule" />
          <Chip active={city === "all"} onClick={() => setCity("all")}>
            All cities
          </Chip>
          {cities.map(([id, name]) => (
            <Chip key={id} active={city === id} onClick={() => setCity(id)}>
              {name}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto px-6 pb-3">
          <Chip active={cuisine === "all"} onClick={() => setCuisine("all")}>
            Any cuisine
          </Chip>
          {cuisines.map((c) => (
            <Chip key={c} active={cuisine === c} onClick={() => setCuisine(c)}>
              {c}
            </Chip>
          ))}
          <span className="my-1 w-px shrink-0 bg-rule" />
          <Chip active={price === "all"} onClick={() => setPrice("all")}>
            Any price
          </Chip>
          {[1, 2, 3, 4].map((t) => (
            <Chip key={t} active={price === t} onClick={() => setPrice(t)}>
              {"$".repeat(t)}
            </Chip>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <p className="eyebrow px-6 py-12">Loading…</p>
      ) : items.length === 0 ? (
        <p className="px-6 py-12 text-sm text-muted-foreground">
          Nothing here yet. Add a restaurant from the + button.
        </p>
      ) : (
        <ul className="px-6">
          {items.map((e) => (
            <li key={e.id} className="border-b border-rule">
              <Link
                to="/entry/$entryId"
                params={{ entryId: e.id }}
                className="flex items-stretch gap-4 py-5"
              >
                {e.entry_photos?.[0] ? (
                  <Photo
                    path={e.entry_photos[0].storage_path}
                    alt={e.title ?? "Restaurant"}
                    className="aspect-[3/4] w-24 shrink-0"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-24 shrink-0 items-center justify-center bg-muted">
                    <span className="display text-3xl text-muted-foreground/35">
                      {(e.title ?? "·").charAt(0)}
                    </span>
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="display text-2xl leading-tight">{e.title ?? "Untitled"}</h2>
                    {e.personal_rating != null && (
                      <span className="display shrink-0 text-2xl text-accent">
                        {Number(e.personal_rating).toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="timecode mt-1 text-xs text-muted-foreground">
                    {[
                      e.cities?.name,
                      e.cuisine_type,
                      e.price_tier ? PRICE_LABEL[e.price_tier] : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {e.body && (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {e.body}
                    </p>
                  )}
                  <p className="mt-auto pt-2 text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
                    {fmtDate(e.occurred_at)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap border-b pb-1 text-xs uppercase tracking-[0.14em]",
        active ? "border-accent text-accent" : "border-transparent text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
