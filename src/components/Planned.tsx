import { fetchGoogleRatings } from "@/lib/ai.functions";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, CheckCircle, Loader2, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { KIND_LABEL, PRICE_LABEL, fmtTime, type City, type Entry, type Trip } from "@/lib/touri";
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

function useMarkDone(entry: Entry) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  async function markDone() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("entries")
        // Keep the scheduled occurred_at exactly as planned.
        .update({ status: "confirmed", date_unknown: false })
        .eq("id", entry.id);
      if (error) throw error;
      if (entry.kind === "restaurant") setReviewing(true);
      else {
        toast.success("Marked as done.");
        await qc.invalidateQueries();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark this as done.");
    } finally {
      setBusy(false);
    }
  }

  const review = (
    <MealReview
      entry={entry}
      open={reviewing}
      onClose={async () => {
        setReviewing(false);
        await qc.invalidateQueries();
      }}
    />
  );
  return { markDone, busy, review };
}

function MealReview({ entry, open, onClose }: { entry: Entry; open: boolean; onClose: () => void }) {
  const [priceTier, setPriceTier] = useState<number | null>(entry.price_tier);
  const [rating, setRating] = useState<number>(Number(entry.personal_rating ?? 7));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("entries")
      .update({ price_tier: priceTier, personal_rating: rating })
      .eq("id", entry.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Meal reviewed.");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="bg-paper">
        <DialogHeader>
          <span className="eyebrow">Restaurant · Done</span>
          <DialogTitle className="display text-3xl font-normal">{entry.title}</DialogTitle>
          <DialogDescription>How was it? You can add a photo later.</DialogDescription>
        </DialogHeader>
        <div>
          <span className="eyebrow">Price</span>
          <div className="mt-2 flex gap-2">
            {[1, 2, 3, 4].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPriceTier(priceTier === t ? null : t)}
                className={cn(
                  "flex-1 border border-rule py-2 text-sm tabular-nums text-muted-foreground",
                  priceTier === t && "border-accent text-accent",
                )}
              >
                {PRICE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Rating</span>
            <span className="display text-3xl tabular-nums text-accent">{rating.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--accent)]"
            aria-label="Rating out of 10"
          />
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={saving}>
            Skip
          </Button>
          <Button className="flex-1" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Save review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function EditTime({ entry, open, onClose }: { entry: Entry; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [when, setWhen] = useState(entry.date_unknown ? "" : toLocalInput(entry.occurred_at));
  const [saving, setSaving] = useState(false);

  async function save() {
    const d = new Date(when);
    if (!when || isNaN(d.getTime())) return;
    setSaving(true);
    const { error } = await supabase
      .from("entries")
      .update({ occurred_at: d.toISOString(), date_unknown: false })
      .eq("id", entry.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(entry.date_unknown ? "Scheduled on the timeline." : "Time updated.");
    onClose();
    await qc.invalidateQueries();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="bg-paper">
        <DialogHeader>
          <span className="eyebrow">{entry.date_unknown ? "Schedule idea" : "Edit time"}</span>
          <DialogTitle className="display text-3xl font-normal">{entry.title}</DialogTitle>
          <DialogDescription>Pick a day and time for this plan.</DialogDescription>
        </DialogHeader>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="w-full border-b border-rule bg-transparent py-2 text-base outline-none focus:border-accent"
          aria-label="Date and time"
        />
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={saving || !when}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanMenu({ entry, size }: { entry: Entry; size: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  async function remove() {
    const { error } = await supabase.from("entries").delete().eq("id", entry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plan deleted.");
    await qc.invalidateQueries();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="More options" className="p-1">
            <MoreVertical className={size} strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-paper">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            {entry.date_unknown ? "Schedule…" : "Edit time"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={remove} className="text-destructive focus:text-destructive">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && <EditTime entry={entry} open={editing} onClose={() => setEditing(false)} />}
    </>
  );
}

function PlanActions({ entry, size = "size-4" }: { entry: Entry; size?: string }) {
  const photo = usePhotoAttach(entry.id);
  const done = useMarkDone(entry);
  const busy = photo.busy || done.busy;
  return (
    <span className="flex shrink-0 items-center gap-3 text-accent">
      {photo.el}
      {done.review}
      {busy ? (
        <Loader2 className={cn(size, "animate-spin")} />
      ) : (
        <>
          <button type="button" onClick={photo.open} aria-label="Add a photo" className="p-1">
            <Camera className={size} strokeWidth={1.5} />
          </button>
          <button type="button" onClick={done.markDone} aria-label="Mark as done" className="p-1">
            <CheckCircle className={size} strokeWidth={1.5} />
          </button>
          <PlanMenu entry={entry} size={size} />
        </>
      )}
    </span>
  );
}

/** Dashed, muted timeline entry for a planned item. Add a photo or mark it done. */
export function GhostEntry({ entry }: { entry: Entry }) {
  return (
    <div className="my-3 flex w-full gap-4 border border-dashed border-rule px-4 py-4 text-left">
      <span className="timecode w-12 shrink-0 pt-1 opacity-60">{fmtTime(entry.occurred_at)}</span>
      <span className="min-w-0 flex-1 opacity-60">
        <span className="eyebrow block">Planned · {KIND_LABEL[entry.kind]}</span>
        <span className="display mt-1 block text-2xl leading-tight">{entry.title}</span>
        {entry.place_name && (
          <span className="mt-0.5 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {entry.place_name}
          </span>
        )}
        {entry.body && <span className="mt-2 block text-sm text-muted-foreground">{entry.body}</span>}
      </span>
      <span className="self-center">
        <PlanActions entry={entry} />
      </span>
    </div>
  );
}

function IdeaCard({ entry }: { entry: Entry }) {
  return (
    <div className="flex w-48 shrink-0 snap-start flex-col border border-dashed border-rule px-4 py-3 text-left">
      <span className="eyebrow">{KIND_LABEL[entry.kind]}</span>
      <span className="display mt-1 line-clamp-2 text-xl leading-tight">{entry.title}</span>
      {entry.place_name && (
        <span className="mt-1 truncate text-xs text-muted-foreground">{entry.place_name}</span>
      )}
      <span className="mt-auto pt-3">
        <PlanActions entry={entry} />
      </span>
    </div>
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
      const { data: inserted, error } = await supabase
        .from("entries")
        .insert(rows)
        .select("id, kind");
      if (error) throw error;
      const restaurantIds = (inserted ?? []).filter((r) => r.kind === "restaurant").map((r) => r.id);
      if (restaurantIds.length)
        void fetchGoogleRatings({ data: { entryIds: restaurantIds } })
          .then(() => qc.invalidateQueries())
          .catch(() => {});
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
