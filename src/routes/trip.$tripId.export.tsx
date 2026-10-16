import { useCallback, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Require } from "@/components/Require";
import { Photo } from "@/components/Photo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { albumDensity, type AlbumMode, type AlbumDensity } from "@/lib/album";
import { KIND_LABEL, PRICE_LABEL, fmtDay, fmtRange, fmtTime, type City, type Entry, type Trip } from "@/lib/touri";

export const Route = createFileRoute("/trip/$tripId/export")({
  head: () => ({ meta: [
    { title: "Editorial trip album — Touri" },
    { name: "description", content: "Your travels in a photo-led, print-ready journal, arranged by city and day." },
    { property: "og:title", content: "Editorial trip album — Touri" },
    { property: "og:description", content: "Your travels in a photo-led, print-ready journal, arranged by city and day." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <Require><ExportPage /></Require>,
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
        .select("*, entry_photos(*)")
        .eq("trip_id", tripId)
        .eq("status", "confirmed")
        .order("occurred_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  if (tripQ.isLoading || citiesQ.isLoading || entriesQ.isLoading) {
    return <div className="mx-auto min-h-screen max-w-5xl px-6 py-24"><p className="eyebrow">Preparing your album…</p></div>;
  }
  if (tripQ.isError || citiesQ.isError || entriesQ.isError) {
    return <div className="mx-auto max-w-5xl px-6 py-24"><h1 className="display text-4xl">Album couldn’t load</h1><Button variant="outline" className="mt-6" onClick={() => { void tripQ.refetch(); void citiesQ.refetch(); void entriesQ.refetch(); }}>Try again</Button></div>;
  }
  if (!tripQ.data) {
    return <div className="mx-auto max-w-5xl px-6 py-24"><h1 className="display text-4xl">Trip not found</h1><Link to="/trip" className="mt-6 inline-flex items-center gap-2 text-accent"><ArrowLeft size={16} /> Back to your trip</Link></div>;
  }
  return <Album key={tripId} trip={tripQ.data} cities={citiesQ.data ?? []} entries={entriesQ.data ?? []} />;
}

const MODES: { value: AlbumMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "feature", label: "Feature (1-Col)" },
  { value: "magazine", label: "Magazine (2-Col)" },
  { value: "contact", label: "Contact Sheet (3-Col)" },
];

function Album({ trip, cities, entries }: { trip: Trip; cities: City[]; entries: Entry[] }) {
  const [mode, setMode] = useState<AlbumMode>("auto");
  const [photos, setPhotos] = useState<Record<string, "ready" | "error">>({});
  const settle = useCallback((id: string, status: "ready" | "error") => {
    setPhotos(previous => previous[id] === status ? previous : { ...previous, [id]: status });
  }, []);
  const photoIds = entries.flatMap(e => (e.entry_photos ?? []).map(p => p.id));
  const readyCount = photoIds.filter(id => photos[id] === "ready").length;
  const errorCount = photoIds.filter(id => photos[id] === "error").length;
  const printReady = readyCount === photoIds.length;
  const density = albumDensity(mode, entries.length, photoIds.length);
  const byCity = new Map<string, Entry[]>();
  const cityIds = new Set(cities.map(c => c.id));
  const loose: Entry[] = [];
  for (const entry of entries) {
    if (entry.city_id && cityIds.has(entry.city_id)) {
      const items = byCity.get(entry.city_id) ?? [];
      items.push(entry);
      byCity.set(entry.city_id, items);
    } else loose.push(entry);
  }
  const primaryCity = cities.find(c => byCity.has(c.id))?.name ?? trip.title;
  const description = [fmtRange(trip.start_date, trip.end_date), `${entries.length} memories`, `${photoIds.length} photographs`].filter(Boolean).join(" · ");
  async function shareAlbum() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `Check out my trip to ${primaryCity}!`, text: description, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Album link copied — paste it anywhere.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn’t share the album — copy the address from your browser.");
    }
  }
  return (
    <div className={cn("album mx-auto min-h-screen max-w-5xl bg-paper", `album-${density}`)}>
      <div className="album-toolbar sticky top-0 z-20 border-b border-rule bg-paper/95 backdrop-blur print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <Link to="/trip" className="inline-flex items-center gap-2 text-xs uppercase text-muted-foreground"><ArrowLeft size={16} /> Trip</Link>
          <div role="group" aria-label="Album layout" className="flex max-w-full flex-wrap gap-1">
            {MODES.map(option => <Button key={option.value} size="sm" variant="ghost" aria-pressed={mode === option.value} onClick={() => setMode(option.value)} className={cn("rounded-none text-[0.6875rem]", mode === option.value && "bg-foreground text-paper hover:bg-foreground hover:text-paper")}>{option.label}</Button>)}
          </div>
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button variant="outline" size="sm" onClick={shareAlbum} className="rounded-none shadow-none"><Share2 /> Share Digital Album</Button>
            <Button size="sm" disabled={!printReady} onClick={() => window.print()} className="h-auto min-h-8 max-w-full whitespace-normal rounded-none shadow-none">
              {printReady ? <Printer /> : <Loader2 className="animate-spin motion-reduce:animate-none" />}
              {printReady ? "Download / Print PDF" : `Preparing album photos (${readyCount}/${photoIds.length})…`}
            </Button>
          </div>
          {errorCount > 0 && <p role="alert" className="w-full text-xs text-destructive">{errorCount} {errorCount === 1 ? "photo couldn’t" : "photos couldn’t"} load. Reload the album to retry before printing.</p>}
        </div>
      </div>
      <main className="album-content px-5 sm:px-8">
        <header className="album-masthead break-inside-avoid border-b border-rule pb-7 pt-10">
          <div className="flex items-center justify-between gap-4"><span className="eyebrow">Touri · Travel journal</span><span className="timecode">{trip.start_date?.slice(0, 4)}</span></div>
          <h1 className="display mt-5 break-words text-5xl leading-tight sm:text-6xl">{trip.title}</h1>
          {trip.subtitle && <p className="mt-3 max-w-xl text-sm text-muted-foreground">{trip.subtitle}</p>}
          <p className="timecode mt-4">{description}</p>
        </header>
        {entries.length === 0 && <p className="py-12 text-sm text-muted-foreground">No confirmed memories in this trip yet.</p>}
        {cities.map((city, index) => {
          const items = byCity.get(city.id) ?? [];
          if (!items.length) return null;
          return <Chapter key={city.id} number={String(index + 1).padStart(2, "0")} title={city.name} subtitle={[city.country, fmtRange(city.start_date, city.end_date)].filter(Boolean).join(" · ")} entries={items} density={density} settle={settle} />;
        })}
        {loose.length > 0 && <Chapter title="Along the way" entries={loose} density={density} settle={settle} />}
        <footer className="mt-8 flex break-inside-avoid items-center justify-between border-t border-rule py-6"><span className="eyebrow">Made with Touri</span><span className="timecode">{entries.length} memories · {photoIds.length} photographs</span></footer>
      </main>
    </div>
  );
}

type SettlePhoto = (id: string, status: "ready" | "error") => void;
function Chapter({ number, title, subtitle, entries, density, settle }: { number?: string; title: string; subtitle?: string; entries: Entry[]; density: AlbumDensity; settle: SettlePhoto }) {
  const days = new Map<string, Entry[]>();
  for (const entry of entries) {
    const day = entry.occurred_at.slice(0, 10);
    const items = days.get(day) ?? [];
    items.push(entry);
    days.set(day, items);
  }
  return <section className="album-chapter mt-6">
    <header className="album-city-header col-span-full break-inside-avoid break-after-avoid border-t border-rule py-3">
      <h2 className="display flex items-baseline gap-3 text-3xl leading-tight"><span className="timecode">{number}</span>{title}</h2>
      {subtitle && <p className="timecode mt-1">{subtitle}</p>}
    </header>
    {Array.from(days, ([day, items]) => <div key={day} className="album-day mt-3">
      <h3 className="album-day-header eyebrow col-span-full break-inside-avoid break-after-avoid border-b border-rule pb-2">{fmtDay(items[0]?.occurred_at ?? day)}</h3>
      <div className={cn("album-grid mt-3 grid gap-4", density === "feature" ? "grid-cols-1" : density === "magazine" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        {items.map(entry => <AlbumEntry key={entry.id} entry={entry} density={density} settle={settle} />)}
      </div>
    </div>)}
  </section>;
}

function Metadata({ entry }: { entry: Entry }) {
  const category = entry.kind === "restaurant" ? entry.cuisine_type || "Restaurant" : KIND_LABEL[entry.kind];
  return <div className="album-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.625rem] leading-relaxed text-muted-foreground">
    <time className="shrink-0 tabular-nums" dateTime={entry.occurred_at}>{fmtTime(entry.occurred_at)}</time>
    <span className="uppercase">{category}</span>
    {entry.price_tier != null && <span>{PRICE_LABEL[entry.price_tier]}</span>}
    {entry.personal_rating != null && <span className="font-semibold tabular-nums text-accent">Personal {Number(entry.personal_rating).toFixed(1)}/10</span>}
    {entry.google_rating != null && <span className="tabular-nums text-foreground">Google ★ {Number(entry.google_rating).toFixed(1)}</span>}
  </div>;
}

function AlbumPhoto({ photo, title, density, settle }: { photo: NonNullable<Entry["entry_photos"]>[number]; title: string; density: AlbumDensity; settle: SettlePhoto }) {
  const onSettled = useCallback((status: "ready" | "error") => settle(photo.id, status), [photo.id, settle]);
  return <Photo path={photo.storage_path} alt={title} loading="eager" onSettled={onSettled} className={cn("album-photo w-full", density === "feature" ? "aspect-[16/10]" : "aspect-[4/3]")} />;
}

function AlbumEntry({ entry, density, settle }: { entry: Entry; density: AlbumDensity; settle: SettlePhoto }) {
  const photos = entry.entry_photos ?? [];
  const title = entry.title || entry.place_name || "Travel memory";
  if (!photos.length) return <article className="album-strip col-span-full flex break-inside-avoid flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule py-2">
    <h4 className="display min-w-0 break-words text-base leading-snug">{title}</h4>
    <Metadata entry={entry} />
    {entry.body && <p className="album-strip-body text-xs leading-snug text-muted-foreground">{entry.body}</p>}
  </article>;
  // Additional photographs are never dropped: each gets its own compact, unframed plate.
  return <>{photos.map((photo, index) => <article key={photo.id} className="album-card min-w-0 break-inside-avoid">
    <AlbumPhoto photo={photo} title={title} density={density} settle={settle} />
    <div className="album-caption pt-2">
      <Metadata entry={entry} />
      <h4 className={cn("album-card-title display mt-1 break-words leading-tight", density === "feature" ? "text-3xl" : density === "magazine" ? "text-xl" : "text-base")}>{title}{photos.length > 1 && <span className="ml-2 font-sans text-[0.625rem] text-muted-foreground">{index + 1}/{photos.length}</span>}</h4>
      {index === 0 && entry.body && <p className={cn("album-body mt-2 whitespace-pre-wrap leading-relaxed text-muted-foreground", density === "feature" ? "text-sm" : "text-xs")}>{entry.body}</p>}
    </div>
  </article>)}</>;
}
