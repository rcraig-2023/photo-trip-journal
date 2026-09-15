import { useEffect, useRef, useState } from "react";

export type PlaceHit = {
  name: string;
  country: string | null;
  label: string;
  lat: number | null;
  lng: number | null;
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

async function searchPlaces(q: string, signal: AbortSignal): Promise<PlaceHit[]> {
  const url =
    "https://photon.komoot.io/api/?limit=6&q=" + encodeURIComponent(q);
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  const hits: PlaceHit[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties ?? {};
    const name = p.city || p.town || p.village || p.name || "";
    if (!name) continue;
    const country = p.country ?? null;
    const key = `${name}|${country ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const region = p.state || p.county;
    const label = [name !== p.name && p.name ? p.name : null, region, country]
      .filter(Boolean)
      .join(", ");
    const coords = f.geometry?.coordinates;
    hits.push({
      name,
      country,
      label: label || name,
      lng: Array.isArray(coords) ? Number(coords[0]) : null,
      lat: Array.isArray(coords) ? Number(coords[1]) : null,
    });
  }
  return hits;
}

export function CityAutocomplete({
  value,
  onChange,
  onPick,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (hit: PlaceHit) => void;
  placeholder?: string;
  className?: string;
}) {
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const found = await searchPlaces(q, ctrl.signal);
        setHits(found);
        setOpen(true);
      } catch {
        /* offline or aborted — typing still works */
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? ""}
        autoComplete="off"
        className={className ?? ""}
      />
      {loading && value.trim().length >= 2 && (
        <span className="absolute right-0 top-2 text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
          Looking…
        </span>
      )}
      {open && !!hits.length && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 border border-rule bg-paper">
          {hits.map((h) => (
            <li key={h.label} className="hairline">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  skip.current = true;
                  onPick(h);
                  setOpen(false);
                  setHits([]);
                }}
                className="block w-full px-4 py-3 text-left"
              >
                <span className="block text-[0.95rem]">{h.name}</span>
                <span className="block text-xs text-muted-foreground">{h.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
