import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { parseItinerary } from "@/lib/ai.functions";
import { confirmPlannedWithPhoto } from "@/lib/planned";
import { KIND_LABEL, fmtTime, type City, type Entry, type Trip } from "@/lib/touri";
import { cn } from "@/lib/utils";

function usePhotoAttach(entryId: string) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const el = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setBusy(true);
        try {
          await confirmPlannedWithPhoto(entryId, file);
          toast.success("Planned place is now a memory.");
          await qc.invalidateQueries();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not add that photo.");
        } finally {
          setBusy(false);
        }
      }}
    />
  );
  return { el, busy, open: () => input.current?.click() };
}

/** Dashed, muted timeline entry for a planned item. Tap to add a photo. */
export function GhostEntry({ entry }: { entry: Entry }) {
  const { el, busy, open } = usePhotoAttach(entry.id);
  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="my-3 flex w-full gap-4 border border-dashed border-rule px-4 py-4 text-left opacity-60 transition-opacity hover:opacity-90"
    >
      {el}
      <span className="timecode w-12 shrink-0 pt-1">{fmtTime(entry.occurred_at)}</span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block">Planned · {KIND_LABEL[entry.kind]}</span>
        <span className="display mt-1 block text-2xl leading-tight">{entry.title}</span>
        {entry.place_name && (
          <span className="mt-0.5 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {entry.place_name}
          </span>
        )}
        {entry.body && <span className="mt-2 block text-sm text-muted-foreground">{entry.body}</span>}
      </span>
      <span className="self-center text-accent">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" strokeWidth={1.5} />}
      </span>
    </button>
  );
}

function IdeaCard({ entry }: { entry: Entry }) {
  const { el, busy, open } = usePhotoAttach(entry.id);
  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="flex w-48 shrink-0 snap-start flex-col border border-dashed border-rule px-4 py-3 text-left"
    >
      {el}
      <span className="eyebrow">{KIND_LABEL[entry.kind]}</span>
      <span className="display mt-1 line-clamp-2 text-xl leading-tight">{entry.title}</span>
      {entry.place_name && (
        <span className="mt-1 truncate text-xs text-muted-foreground">{entry.place_name}</span>
      )}
      <span className="mt-3 flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-accent">
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3" strokeWidth={1.5} />}
        Add photo
      </span>
    </button>
  );
}

export function SavedIdeas({ entries }: { entries: Entry[] }) {
  if (!entries.length) return null;
  return (
    <section className="mt-8">
      <h2 className="eyebrow px-6">Saved Ideas</h2>
      <div className="mt-3 flex snap-x gap-3 overflow-x-auto px-6 pb-2">
        {entries.map((e) => (
          <IdeaCard key={e.id} entry={e} />
        ))}
      </div>
    </section>
  );
}

export function ItineraryImporter({ trip, cities }: { trip: Trip; cities: City[] }) {
  const qc = useQueryClient();
  const parse = useServerFn(parseItinerary);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const items = await parse({
        data: {
          text,
          startDate: trip.start_date,
          endDate: trip.end_date,
          cities: cities.map((c) => c.name),
        },
      });
      if (!items.length) {
        toast.error("No places found in that text.");
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Please sign in again.");
      const fallback = trip.start_date ? `${trip.start_date}T12:00` : null;
      const rows = items.map((i) => {
        const city = cities.find((c) => c.name.toLowerCase() === i.city.toLowerCase());
        const when = i.occurred_at ?? fallback;
        return {
          user_id: uid,
          trip_id: trip.id,
          city_id: city?.id ?? null,
          kind: i.kind,
          title: i.title,
          body: i.note || null,
          place_name: i.place || null,
          status: "planned",
          date_unknown: !i.occurred_at,
          ...(when ? { occurred_at: new Date(when).toISOString() } : {}),
        };
      });
      const { error } = await supabase.from("entries").insert(rows);
      if (error) throw error;
      const undated = rows.filter((r) => r.date_unknown).length;
      toast.success(
        `Added ${rows.length} planned ${rows.length === 1 ? "place" : "places"}${undated ? ` · ${undated} saved as ideas` : ""}.`,
      );
      setText("");
      setOpen(false);
      await qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import that itinerary.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 text-xs uppercase tracking-[0.18em] text-accent"
      >
        Paste itinerary
      </button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="bg-paper">
          <DialogHeader>
            <DialogTitle className="display text-3xl font-normal">Paste itinerary</DialogTitle>
            <DialogDescription>
              Paste notes, emails or lists in any order. Dated items join the timeline as plans;
              the rest become saved ideas.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={"Day 1 – Louvre in the morning\nFriday dinner at Le Comptoir\nMust try: Berthillon ice cream"}
            className={cn("resize-none bg-background", busy && "opacity-60")}
            disabled={busy}
          />
          <Button onClick={submit} disabled={busy || text.trim().length < 3}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Reading your plans…
              </>
            ) : (
              "Import plans"
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
