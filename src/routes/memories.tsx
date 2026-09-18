import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Info, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { EditorialPhotoMosaic } from "@/components/EditorialPhotoMosaic";
import { Require } from "@/components/Require";
import { Photo } from "@/components/Photo";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ensureEnrichment, findOrCreateLandmark } from "@/lib/landmarks";
import { retryRecognition } from "@/lib/uploadQueue";
import { fmtTime, useActiveTrip, useCities, useEntries, type Entry, type Kind } from "@/lib/touri";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/memories")({
  head: () => ({
    meta: [
      { title: "Memories — Touri" },
      {
        name: "description",
        content: "Confirm freshly uploaded photos and browse every memory across your trips.",
      },
      { property: "og:title", content: "Memories — Touri" },
      {
        property: "og:description",
        content: "Confirm freshly uploaded photos and browse every memory across your trips.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Require>
      <AppShell>
        <MemoriesPage />
      </AppShell>
    </Require>
  ),
});

const FILTERS: { key: Kind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "photo", label: "Photos" },
  { key: "jot", label: "Jots" },
  { key: "landmark", label: "Landmarks" },
  { key: "restaurant", label: "Restaurants" },
];


function MemoriesPage() {
  const { trip } = useActiveTrip();
  const pending = useEntries({ status: "pending" });
  const all = useEntries({ tripId: trip?.id, limit: 200 });
  const [tab, setTab] = useState<"new" | "all">("new");
  const [filter, setFilter] = useState<Kind | "all">("all");

  const confirmed = (all.data ?? []).filter(
    (e) => e.status !== "pending" && (filter === "all" || e.kind === filter),
  );

  return (
    <div>
      <header className="px-6 pt-12">
        <span className="eyebrow">Memories</span>
        <h1 className="display mt-5 text-[3rem]">
          {tab === "new" ? "New memories" : "Everything so far"}
        </h1>
      </header>

      <div className="mt-6 flex gap-6 border-y border-rule px-6 py-3 text-xs uppercase tracking-[0.14em]">
        <button
          onClick={() => setTab("new")}
          className={cn("text-muted-foreground", tab === "new" && "text-accent")}
        >
          Inbox {pending.data?.length ? `(${pending.data.length})` : ""}
        </button>
        <button
          onClick={() => setTab("all")}
          className={cn("text-muted-foreground", tab === "all" && "text-accent")}
        >
          All memories
        </button>
      </div>

      {tab === "new" ? (
        <InboxTriage entries={pending.data ?? []} />
      ) : (
        <>
          <div className="sticky top-0 z-20 flex gap-5 overflow-x-auto border-b border-rule bg-paper/90 px-6 py-4 text-xs uppercase tracking-[0.14em] backdrop-blur-md">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "whitespace-nowrap text-muted-foreground",
                  filter === f.key && "text-accent",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {filter === "photo" ? (
            <EditorialPhotoMosaic entries={confirmed} />
          ) : (
          <ul>
            {confirmed.map((e) => (
              <li key={e.id} className="px-6">
                <Link
                  to="/entry/$entryId"
                  params={{ entryId: e.id }}
                  className="block border-t border-rule py-5"
                >
                  <span className="timecode">
                    {new Date(e.occurred_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {fmtTime(e.occurred_at)}
                  </span>
                  <h2 className="display mt-1 text-2xl">
                    {e.title ?? (e.kind === "jot" ? "Jot" : "Untitled")}
                  </h2>
                  {e.body && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{e.body}</p>
                  )}
                  {!!e.entry_photos?.length && (
                    <Photo
                      path={e.entry_photos[0]?.storage_path}
                      alt={e.title ?? "Memory"}
                      className="mt-3 aspect-[3/2] w-full"
                    />
                  )}
                </Link>
              </li>
            ))}
            {!confirmed.length && (
              <li className="px-6 py-16 text-sm text-muted-foreground">Nothing here yet.</li>
            )}
          </ul>
          )}
        </>
      )}
    </div>
  );
}

function InboxTriage({ entries }: { entries: Entry[] }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [inspection, setInspection] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedEntries = entries.filter((entry) => selected.has(entry.id));

  useEffect(() => {
    const visibleIds = new Set(entries.map((entry) => entry.id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [entries]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmSelected() {
    if (!selectedEntries.length || busy) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Please sign in again to confirm these memories.");

      const recognized = selectedEntries.filter((entry) => !!entry.ai_suggestion);
      const ordinaryIds = selectedEntries
        .filter((entry) => !entry.ai_suggestion)
        .map((entry) => entry.id);

      if (ordinaryIds.length) {
        const { error } = await supabase
          .from("entries")
          .update({ status: "confirmed" })
          .in("id", ordinaryIds);
        if (error) throw error;
      }

      for (const entry of recognized) {
        const suggestion = entry.ai_suggestion;
        if (!suggestion) continue;
        const landmark = await findOrCreateLandmark({
          userId: uid,
          name: suggestion,
          placeName: entry.ai_place,
          tripId: entry.trip_id,
          cityId: entry.city_id,
        });
        const { error } = await supabase
          .from("entries")
          .update({
            title: suggestion,
            kind: "landmark",
            status: "confirmed",
            landmark_id: landmark.id,
            place_name: entry.ai_place ?? entry.place_name,
          })
          .eq("id", entry.id);
        if (error) throw error;
        void ensureEnrichment(landmark).then(() => qc.invalidateQueries());
      }

      setSelected(new Set());
      toast.success(
        `${selectedEntries.length} ${selectedEntries.length === 1 ? "memory" : "memories"} confirmed.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not confirm those memories.");
    } finally {
      await qc.invalidateQueries();
      setBusy(false);
    }
  }

  async function discardSelected() {
    if (!selectedEntries.length || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("entries")
        .delete()
        .in(
          "id",
          selectedEntries.map((entry) => entry.id),
        );
      if (error) throw error;
      setSelected(new Set());
      toast.success(
        `${selectedEntries.length} ${selectedEntries.length === 1 ? "memory" : "memories"} discarded.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not discard those memories.");
    } finally {
      await qc.invalidateQueries();
      setBusy(false);
    }
  }

  if (!entries.length) {
    return (
      <p className="px-6 py-16 text-sm text-muted-foreground">
        Nothing waiting. Tap + → Photos to bring in a batch from your phone.
      </p>
    );
  }

  return (
    <>
      <div className={cn("grid grid-cols-3 gap-[2px]", selected.size > 0 && "pb-24")}>
        {entries.map((entry) => {
          const photo = entry.entry_photos?.[0];
          const isSelected = selected.has(entry.id);
          return (
            <div key={entry.id} className="relative aspect-square overflow-hidden bg-muted">
              <Button
                type="button"
                variant="ghost"
                aria-label={`${isSelected ? "Deselect" : "Select"} memory`}
                aria-pressed={isSelected}
                onClick={() => toggle(entry.id)}
                className={cn(
                  "h-full w-full rounded-none p-0 transition-transform duration-200 hover:bg-transparent",
                  isSelected && "scale-[0.94] ring-2 ring-inset ring-accent",
                )}
              >
                {photo ? (
                  <Photo
                    path={photo.storage_path}
                    alt={entry.ai_suggestion ?? entry.title ?? "New memory"}
                    className="h-full w-full"
                  />
                ) : (
                  <span className="eyebrow">No photo</span>
                )}
              </Button>

              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute left-2 top-2 flex size-6 items-center justify-center rounded-full border border-paper/80 bg-paper/75 text-foreground shadow-sm backdrop-blur-sm transition",
                  isSelected && "border-accent bg-accent text-accent-foreground",
                )}
              >
                {isSelected && <Check className="size-4" strokeWidth={2.5} />}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Inspect memory details"
                onClick={() => setInspection(entry)}
                className="absolute bottom-1.5 right-1.5 size-7 rounded-full bg-paper/80 text-foreground shadow-sm backdrop-blur-sm hover:bg-paper"
              >
                <Info className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <Sheet open={!!inspection} onOpenChange={(open) => !open && setInspection(null)}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto bg-paper px-0 pb-10 pt-6">
          <SheetHeader className="px-6 text-left">
            <span className="eyebrow">Closer look</span>
            <SheetTitle className="display text-3xl">Review this memory</SheetTitle>
            <SheetDescription>Check Touri’s suggestion or edit the details before keeping it.</SheetDescription>
          </SheetHeader>
          {inspection && (
            <InboxItem entry={inspection} onComplete={() => setInspection(null)} />
          )}
        </SheetContent>
      </Sheet>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[4.85rem] z-40 mx-auto w-full max-w-2xl border-t border-rule bg-paper/95 px-4 py-3 shadow-lg backdrop-blur-md">
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={confirmSelected}
              disabled={busy}
              className="h-11 flex-1 rounded-sm text-xs uppercase tracking-[0.08em]"
            >
              Confirm {selected.size} {selected.size === 1 ? "Memory" : "Memories"}
            </Button>
            <AlertDialog>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={busy}
                aria-label={`Discard ${selected.size} selected ${selected.size === 1 ? "memory" : "memories"}`}
                asChild
              >
                <AlertDialogAction className="h-11 w-11 border-destructive bg-transparent text-destructive shadow-none hover:bg-destructive hover:text-destructive-foreground">
                  <Trash2 />
                </AlertDialogAction>
              </Button>
              <AlertDialogContent className="max-w-[calc(100%-2rem)] rounded-sm bg-paper">
                <AlertDialogHeader>
                  <AlertDialogTitle className="display text-2xl">Discard selected memories?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes {selected.size} selected {selected.size === 1 ? "memory" : "memories"}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep them</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={discardSelected}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Discard
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </>
  );
}

function InboxItem({ entry, onComplete }: { entry: Entry; onComplete?: () => void }) {
  const { trip } = useActiveTrip();
  const cities = useCities(trip?.id);
  const qc = useQueryClient();
  const [title, setTitle] = useState(entry.title ?? "");
  const [kind, setKind] = useState<Kind>(entry.kind);
  const [cityId, setCityId] = useState<string | null>(entry.city_id);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [editing, setEditing] = useState(false);

  const photo = entry.entry_photos?.[0];
  const suggestion = entry.ai_suggestion;
  const percent = Math.round((entry.ai_confidence ?? 0) * 100);
  const running = entry.ai_status === "processing";

  async function retry() {
    if (!photo) return;
    setBusy(true);
    await retryRecognition(entry.id, photo.storage_path, photo.sha256 ?? null);
    await qc.invalidateQueries();
    setBusy(false);
  }

  async function confirm(useSuggestion: boolean) {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const finalName = useSuggestion ? (suggestion ?? title) : title;
      const finalKind: Kind = useSuggestion && suggestion ? "landmark" : kind;
      let landmarkId: string | null = null;

      if (finalKind === "landmark" && finalName) {
        const landmark = await findOrCreateLandmark({
          userId: uid,
          name: finalName,
          placeName: entry.ai_place ?? null,
          tripId: entry.trip_id,
          cityId,
        });
        landmarkId = landmark.id;
        void ensureEnrichment(landmark).then(() => qc.invalidateQueries());
      }

      await supabase
        .from("entries")
        .update({
          title: finalName || null,
          kind: finalKind,
          city_id: cityId,
          status: "confirmed",
          landmark_id: landmarkId,
          place_name: entry.ai_place ?? entry.place_name,
        })
        .eq("id", entry.id);
      await qc.invalidateQueries();
      onComplete?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    await supabase.from("entries").delete().eq("id", entry.id);
    await qc.invalidateQueries();
    onComplete?.();
  }

  return (
    <div className="mt-6 border-t border-rule px-6 py-6">
      {photo && <Photo path={photo.storage_path} alt="New memory" className="aspect-[4/5] w-full" />}
      <span className="timecode mt-3 block">
        {new Date(entry.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
        · {fmtTime(entry.occurred_at)}
      </span>

      {running && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-accent" strokeWidth={1.5} /> Looking at this one…
        </p>
      )}

      {entry.ai_status === "failed" && (
        <div className="mt-3 flex items-center justify-between gap-3 border-l-2 border-rule pl-3">
          <p className="text-sm text-muted-foreground">
            Touri couldn't look at this one just now. The photo is safe.
          </p>
          <button
            onClick={retry}
            disabled={busy}
            className="whitespace-nowrap text-xs uppercase tracking-[0.14em] text-accent disabled:opacity-40"
          >
            Try again
          </button>
        </div>
      )}

      {entry.ai_status === "done" && !suggestion && (
        <p className="mt-3 text-sm text-muted-foreground">No landmark detected.</p>
      )}

      {entry.ai_status === "done" && suggestion && !rejected && (
        <div className="mt-4 border-l-2 border-accent pl-4">
          <span className="eyebrow">Possible place</span>
          <h3 className="display mt-1 text-2xl">{suggestion}</h3>
          {entry.ai_place && <p className="text-sm text-muted-foreground">{entry.ai_place}</p>}
          {!!percent && <p className="timecode mt-1">{percent}% match</p>}
          {entry.ai_explanation && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {entry.ai_explanation}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.14em]">
            <button
              onClick={() => confirm(true)}
              disabled={busy}
              className="bg-primary px-5 py-2.5 text-primary-foreground disabled:opacity-40"
            >
              Confirm
            </button>
            <button
              onClick={() => {
                setTitle(suggestion);
                setKind("landmark");
                setEditing(true);
              }}
              className="text-muted-foreground"
            >
              Edit
            </button>
            <button
              onClick={() => {
                setRejected(true);
                setEditing(true);
              }}
              className="text-muted-foreground"
            >
              Not this
            </button>
          </div>
        </div>
      )}

      {(editing || !suggestion || rejected || entry.ai_status !== "done") && (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name this memory"
            className="display mt-4 w-full border-b border-rule bg-transparent pb-2 text-2xl outline-none placeholder:text-muted-foreground/40"
          />

          <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em]">
            {(["photo", "landmark", "restaurant", "jot"] as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  "border border-rule px-3 py-1.5",
                  kind === k && "border-accent text-accent",
                )}
              >
                {k}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {cities.data?.map((c) => (
              <button
                key={c.id}
                onClick={() => setCityId(c.id)}
                className={cn(
                  "border border-rule px-3 py-1.5",
                  cityId === c.id && "border-accent text-accent",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-4">
            <button
              onClick={() => confirm(false)}
              disabled={busy}
              className="flex-1 bg-primary py-3 text-xs uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-40"
            >
              Keep
            </button>
            <button
              onClick={discard}
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Discard
            </button>
          </div>
        </>
      )}
    </div>
  );
}

