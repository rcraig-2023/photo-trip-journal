import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MapPin, Share2, UtensilsCrossed } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { Photo } from "@/components/Photo";
import { ShareCityGuideDialog } from "@/components/ShareCityGuideDialog";
import { PRICE_LABEL, fmtReviewCount, useDirectoryPlaces, type Entry } from "@/lib/touri";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dining")({
  head: () => ({
    meta: [
      { title: "Dining & Places — Touri" },
      {
        name: "description",
        content: "Every restaurant and landmark from your travels, with ratings and destination guides.",
      },
      { property: "og:title", content: "Dining & Places — Touri" },
      {
        property: "og:description",
        content: "Every restaurant and landmark from your travels, with ratings and destination guides.",
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

type Sort = "recent" | "rated" | "google";
type CategoryFilter = "all" | "restaurant" | "landmark";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DiningPage() {
  const list = useDirectoryPlaces();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [city, setCity] = useState<string | "all">("all");
  const [cuisine, setCuisine] = useState<string | "all">("all");
  const [price, setPrice] = useState<number | "all">("all");
  const [sort, setSort] = useState<Sort>("rated");
  const [shareOpen, setShareOpen] = useState(false);

  const all = useMemo(() => (list.data ?? []) as Entry[], [list.data]);

  const cities = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of all) if (e.cities) m.set(e.cities.id, e.cities.name);
    return [...m.entries()];
  }, [all]);

  const activeCityName = useMemo(
    () => (city === "all" ? null : (cities.find(([id]) => id === city)?.[1] ?? null)),
    [city, cities],
  );

  const cuisines = useMemo(
    () => [...new Set(all.map((e) => e.cuisine_type).filter(Boolean) as string[])].sort(),
    [all],
  );

  const items = useMemo(() => {
    const out = all
      .filter((e) => category === "all" || e.kind === category)
      .filter((e) => city === "all" || e.city_id === city)
      .filter((e) => cuisine === "all" || e.cuisine_type === cuisine)
      .filter((e) => price === "all" || e.price_tier === price);
    return out.sort((a, b) =>
      sort === "rated"
        ? (b.personal_rating ?? -1) - (a.personal_rating ?? -1)
        : sort === "google"
          ? (b.google_rating ?? -1) - (a.google_rating ?? -1) ||
            (b.google_review_count ?? 0) - (a.google_review_count ?? 0)
          : b.occurred_at.localeCompare(a.occurred_at),
    );
  }, [all, category, city, cuisine, price, sort]);

  return (
    <div>
      <header className="px-6 pt-12 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="eyebrow">The table & directory</span>
            <h1 className="display mt-4 text-[3.2rem] leading-[0.95]">Dining & Places</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? "place" : "places"}
              {activeCityName ? ` in ${activeCityName}` : " across every trip"}
            </p>
          </div>
          {all.length > 0 && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="mt-3 inline-flex items-center gap-2 border border-accent bg-accent/10 px-4 py-2.5 text-xs uppercase tracking-[0.16em] text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Share2 className="size-3.5" />
              {activeCityName ? `Share ${activeCityName} List` : "Share City List"}
            </button>
          )}
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-rule bg-paper/90 backdrop-blur-md">
        <div className="flex gap-2 overflow-x-auto px-6 py-3">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            All places
          </Chip>
          <Chip active={category === "restaurant"} onClick={() => setCategory("restaurant")}>
            Dining
          </Chip>
          <Chip active={category === "landmark"} onClick={() => setCategory("landmark")}>
            Landmarks & Sights
          </Chip>
          <span className="my-1 w-px shrink-0 bg-rule" />
          <Chip active={sort === "rated"} onClick={() => setSort("rated")}>
            Highest rated
          </Chip>
          <Chip active={sort === "google"} onClick={() => setSort("google")}>
            Top rated on Google
          </Chip>
          <Chip active={sort === "recent"} onClick={() => setSort("recent")}>
            Most recent
          </Chip>
        </div>
        <div className="flex gap-2 overflow-x-auto px-6 pb-3">
          <Chip active={city === "all"} onClick={() => setCity("all")}>
            All destinations
          </Chip>
          {cities.map(([id, name]) => (
            <Chip key={id} active={city === id} onClick={() => setCity(id)}>
              {name}
            </Chip>
          ))}
          {category !== "landmark" && (
            <>
              <span className="my-1 w-px shrink-0 bg-rule" />
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
            </>
          )}
        </div>
      </div>

      {list.isLoading ? (
        <p className="eyebrow px-6 py-12">Loading…</p>
      ) : items.length === 0 ? (
        <p className="px-6 py-12 text-sm text-muted-foreground">
          Nothing here yet. Add a restaurant or landmark from the + button.
        </p>
      ) : (
        <ul className="px-6">
          {items.map((e) => {
            const isRestaurant = e.kind === "restaurant";
            return (
              <li key={e.id} className="border-b border-rule">
                <Link
                  to="/entry/$entryId"
                  params={{ entryId: e.id }}
                  className="flex items-stretch gap-4 py-5"
                >
                  {e.entry_photos?.[0] ? (
                    <Photo
                      path={e.entry_photos[0].storage_path}
                      alt={e.title ?? (isRestaurant ? "Restaurant" : "Landmark")}
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
                      <div className="min-w-0">
                        <span className="eyebrow inline-flex items-center gap-1 text-[0.62rem]">
                          {isRestaurant ? (
                            <UtensilsCrossed className="size-3 text-accent" />
                          ) : (
                            <MapPin className="size-3 text-accent" />
                          )}
                          {isRestaurant ? "Restaurant" : "Landmark"}
                        </span>
                        <h2 className="display mt-1 text-2xl leading-tight">
                          {e.title ?? "Untitled"}
                        </h2>
                      </div>
                      {(e.personal_rating != null || e.google_rating != null) && (
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {e.personal_rating != null && (
                            <span className="bg-accent px-2.5 py-1 text-xs font-semibold tabular-nums text-accent-foreground">
                              {Number(e.personal_rating).toFixed(1)}/10
                            </span>
                          )}
                          {e.google_rating != null && (
                            <span className="timecode border border-rule px-2 py-0.5 text-[0.68rem] tabular-nums text-foreground">
                              ★ {Number(e.google_rating).toFixed(1)}
                              {e.google_review_count
                                ? ` (${fmtReviewCount(e.google_review_count)})`
                                : ""}{" "}
                              Google
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="timecode mt-1.5 text-xs text-muted-foreground">
                      {[
                        e.cities?.name,
                        isRestaurant ? e.cuisine_type : e.place_name,
                        isRestaurant && e.price_tier ? PRICE_LABEL[e.price_tier] : null,
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
            );
          })}
        </ul>
      )}

      <ShareCityGuideDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        entries={all}
        initialCityId={city}
      />
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
