import { useEffect, useMemo, useState } from "react";
import { Check, Copy, MapPin, Share2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRICE_LABEL, type Entry } from "@/lib/touri";
import { cn } from "@/lib/utils";

type Preset = "9plus" | "8plus" | "all";

function shouldSelectForPreset(entry: Entry, preset: Preset): boolean {
  if (preset === "all") return true;
  const minScore = preset === "9plus" ? 9 : 8;
  if (entry.personal_rating != null) {
    return Number(entry.personal_rating) >= minScore;
  }
  // Unrated landmarks are included in 8+ by default so sights aren't hidden unless explicitly rated low
  return preset === "8plus" && entry.kind === "landmark";
}

export function formatDestinationShareText(opts: {
  cityName: string;
  country?: string | null;
  entries: Entry[];
}): string {
  const { cityName, country, entries } = opts;
  const header = `My ${cityName}${country ? `, ${country}` : ""} Recommendations — via Touri`;
  const restaurants = entries
    .filter((e) => e.kind === "restaurant")
    .sort((a, b) => (b.personal_rating ?? -1) - (a.personal_rating ?? -1));
  const landmarks = entries
    .filter((e) => e.kind === "landmark")
    .sort((a, b) => (b.personal_rating ?? -1) - (a.personal_rating ?? -1));

  const sections: string[] = [header];

  if (restaurants.length) {
    const lines = restaurants.map((r, i) => {
      const meta = [
        r.personal_rating != null ? `${Number(r.personal_rating).toFixed(1)}/10` : null,
        r.cuisine_type,
        r.price_tier ? PRICE_LABEL[r.price_tier] : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const note = r.body ? `\n   “${r.body.trim()}”` : "";
      return `${i + 1}. ${r.title ?? "Untitled"}${meta ? ` (${meta})` : ""}${note}`;
    });
    sections.push(`WHERE TO EAT & DRINK\n${lines.join("\n")}`);
  }

  if (landmarks.length) {
    const lines = landmarks.map((l, i) => {
      const meta = [
        l.personal_rating != null ? `${Number(l.personal_rating).toFixed(1)}/10` : null,
        l.place_name && l.place_name !== l.title ? l.place_name : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const note = l.body ? `\n   “${l.body.trim()}”` : "";
      return `${i + 1}. ${l.title ?? "Untitled"}${meta ? ` (${meta})` : ""}${note}`;
    });
    sections.push(`PLACES & THINGS TO DO\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
}

export function ShareCityGuideDialog({
  open,
  onOpenChange,
  entries,
  initialCityId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: Entry[];
  initialCityId?: string | "all";
}) {
  const cities = useMemo(() => {
    const map = new Map<string, { id: string; name: string; country: string | null }>();
    for (const e of entries) {
      if (e.cities && e.city_id) {
        map.set(e.city_id, {
          id: e.city_id,
          name: e.cities.name,
          country: e.cities.country ?? null,
        });
      }
    }
    return [...map.values()];
  }, [entries]);

  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [preset, setPreset] = useState<Preset>("8plus");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    const targetCity =
      initialCityId && initialCityId !== "all"
        ? initialCityId
        : (cities[0]?.id ?? "");
    setSelectedCityId(targetCity);
  }, [open, initialCityId, cities]);

  const cityEntries = useMemo(() => {
    if (!selectedCityId) return [];
    return entries
      .filter(
        (e) =>
          e.city_id === selectedCityId &&
          (e.kind === "restaurant" || e.kind === "landmark") &&
          Boolean(e.title),
      )
      .slice()
      .sort((a, b) => (b.personal_rating ?? -1) - (a.personal_rating ?? -1));
  }, [entries, selectedCityId]);

  useEffect(() => {
    const matching = cityEntries
      .filter((e) => shouldSelectForPreset(e, preset))
      .map((e) => e.id);
    // Fallback: if 8+ filter yielded 0 items (e.g. nothing rated yet), pre-select all in that city
    if (matching.length === 0 && preset === "8plus") {
      setSelectedIds(new Set(cityEntries.map((e) => e.id)));
    } else {
      setSelectedIds(new Set(matching));
    }
  }, [cityEntries, preset]);

  const activeCity = cities.find((c) => c.id === selectedCityId) ?? null;
  const chosenEntries = cityEntries.filter((e) => selectedIds.has(e.id));

  function toggleEntry(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleShare(copyOnly = false) {
    if (!activeCity || !chosenEntries.length) return;
    const text = formatDestinationShareText({
      cityName: activeCity.name,
      country: activeCity.country,
      entries: chosenEntries,
    });

    if (!copyOnly && typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${activeCity.name} Recommendations`,
          text,
        });
        onOpenChange(false);
        return;
      } catch {
        // Fall through to clipboard copy if user cancels or share fails
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success(
        `Copied ${chosenEntries.length} ${activeCity.name} ${chosenEntries.length === 1 ? "recommendation" : "recommendations"} to clipboard.`,
      );
      onOpenChange(false);
    } catch {
      toast.error("Could not copy list.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-lg overflow-y-auto rounded-sm border-rule bg-paper p-6">
        <DialogHeader className="text-left">
          <span className="eyebrow text-accent">Curated Destination Guide</span>
          <DialogTitle className="display mt-1 text-3xl font-normal leading-tight">
            {activeCity ? `Share ${activeCity.name} List` : "Share Destination List"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Pick one destination and curate only the dining & sights you genuinely recommend. Places rated below 8/10 are unchecked by default.
          </DialogDescription>
        </DialogHeader>

        {/* Destination Picker (strictly 1 destination per share list) */}
        {cities.length > 1 && (
          <div className="mt-3">
            <span className="eyebrow block text-[0.62rem]">1. Destination</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {cities.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCityId(c.id)}
                  className={cn(
                    "border px-3 py-1.5 text-xs uppercase tracking-[0.12em]",
                    selectedCityId === c.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-rule text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Smart Curation Presets */}
        <div className="mt-3">
          <span className="eyebrow block text-[0.62rem]">
            {cities.length > 1 ? "2. Auto-Select Favorites" : "Auto-Select Favorites"}
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                { id: "9plus", label: "9.0+ Must-Visits" },
                { id: "8plus", label: "8.0+ Recommended" },
                { id: "all", label: "Select All" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={cn(
                  "border px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.12em]",
                  preset === p.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-rule text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Checklist of Places in this Destination */}
        <div className="mt-4 max-h-64 divide-y divide-rule overflow-y-auto border border-rule bg-background/50">
          {cityEntries.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              No confirmed restaurants or landmarks logged for this destination yet.
            </p>
          ) : (
            cityEntries.map((entry) => {
              const checked = selectedIds.has(entry.id);
              const isRestaurant = entry.kind === "restaurant";
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => toggleEntry(entry.id)}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-paper"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center border",
                      checked
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-rule bg-paper",
                    )}
                  >
                    {checked && <Check className="size-3.5" strokeWidth={2.5} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isRestaurant ? (
                        <UtensilsCrossed className="size-3 text-accent" />
                      ) : (
                        <MapPin className="size-3 text-accent" />
                      )}
                      <span className="display truncate text-lg leading-tight">
                        {entry.title}
                      </span>
                    </div>
                    <p className="timecode mt-0.5 truncate text-[0.68rem] text-muted-foreground">
                      {[
                        isRestaurant ? (entry.cuisine_type ?? "Restaurant") : "Landmark",
                        isRestaurant && entry.price_tier ? PRICE_LABEL[entry.price_tier] : null,
                        entry.body ? `“${entry.body}”` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {entry.personal_rating != null ? (
                    <span
                      className={cn(
                        "shrink-0 px-2 py-1 text-xs font-semibold tabular-nums",
                        Number(entry.personal_rating) >= 8
                          ? "bg-accent text-accent-foreground"
                          : "border border-rule text-muted-foreground",
                      )}
                    >
                      {Number(entry.personal_rating).toFixed(1)}/10
                    </span>
                  ) : (
                    <span className="timecode shrink-0 text-[0.65rem] text-muted-foreground">
                      Unrated
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={chosenEntries.length === 0}
            onClick={() => handleShare(false)}
            className="inline-flex flex-1 items-center justify-center gap-2 bg-primary py-3.5 text-xs uppercase tracking-[0.16em] text-primary-foreground disabled:opacity-40"
          >
            <Share2 className="size-3.5" />
            Share {chosenEntries.length} {chosenEntries.length === 1 ? "Place" : "Places"}
          </button>
          <button
            type="button"
            disabled={chosenEntries.length === 0}
            onClick={() => handleShare(true)}
            className="inline-flex items-center justify-center gap-1.5 border border-rule px-4 py-3.5 text-xs uppercase tracking-[0.14em] text-foreground disabled:opacity-40"
          >
            <Copy className="size-3.5" /> Copy
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
