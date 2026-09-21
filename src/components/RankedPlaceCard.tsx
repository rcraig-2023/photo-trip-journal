import { Link } from "@tanstack/react-router";
import { MapPin, UtensilsCrossed } from "lucide-react";
import { Photo } from "@/components/Photo";
import { PRICE_LABEL, fmtTime, type Entry } from "@/lib/touri";

export function RankedPlaceCard({ entry }: { entry: Entry }) {
  const photo = entry.entry_photos?.[0];
  const isRestaurant = entry.kind === "restaurant";
  const metadata = [
    isRestaurant ? entry.cuisine_type : "Landmark",
    isRestaurant && entry.price_tier ? PRICE_LABEL[entry.price_tier] : null,
    entry.place_name && entry.place_name !== entry.title ? entry.place_name : null,
  ].filter(Boolean);

  return (
    <Link
      to="/entry/$entryId"
      params={{ entryId: entry.id }}
      className="group block overflow-hidden border border-rule bg-paper transition-colors hover:border-accent"
    >
      {photo && (
        <Photo
          path={photo.storage_path}
          alt={entry.title ?? (isRestaurant ? "Restaurant" : "Landmark")}
          className="aspect-[16/9] w-full"
        />
      )}

      <div className="relative p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <span className="eyebrow inline-flex items-center gap-1.5">
              {isRestaurant ? <UtensilsCrossed size={12} /> : <MapPin size={12} />}
              {isRestaurant ? "Restaurant" : "Landmark"}
            </span>
            <h3 className="display mt-2 text-[1.9rem] leading-tight">
              {entry.title ?? (isRestaurant ? "Untitled restaurant" : "Untitled landmark")}
            </h3>
          </div>

          {isRestaurant && entry.personal_rating != null && (
            <span className="shrink-0 bg-accent px-3 py-2 text-sm font-semibold tabular-nums text-accent-foreground">
              {Number(entry.personal_rating).toFixed(1)}/10
            </span>
          )}
        </div>

        {!!metadata.length && (
          <p className="eyebrow mt-3 text-foreground">{metadata.join(" · ")}</p>
        )}

        {entry.body && (
          <p className="mt-4 line-clamp-3 border-t border-rule pt-4 text-sm leading-relaxed text-muted-foreground">
            {entry.body}
          </p>
        )}

        <span className="timecode mt-4 block">{fmtTime(entry.occurred_at)}</span>
      </div>
    </Link>
  );
}