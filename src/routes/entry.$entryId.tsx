import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { Photo } from "@/components/Photo";
import { deleteGuestEntries, updateGuestEntry } from "@/lib/guestStore";
import { KIND_LABEL, PRICE_LABEL, fmtTime, useEntry, type Kind } from "@/lib/touri";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/entry/$entryId")({
  head: () => ({
    meta: [
      { title: "Memory — Touri" },
      { name: "description", content: "A single memory from your travel journal." },
      { property: "og:title", content: "Memory — Touri" },
      { property: "og:description", content: "A single memory from your travel journal." },
    ],
  }),
  component: () => (
    <Require>
      <AppShell>
        <EntryPage />
      </AppShell>
    </Require>
  ),
});

function EntryPage() {
  const { entryId } = Route.useParams();
  const entry = useEntry(entryId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [body, setBody] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [priceTier, setPriceTier] = useState<number | null>(null);
  const [rating, setRating] = useState<number>(8);
  const [rated, setRated] = useState<boolean>(false);

  useEffect(() => {
    if (entry.data) {
      setTitle(entry.data.title ?? "");
      setPlace(entry.data.place_name ?? "");
      setBody(entry.data.body ?? "");
      setCuisine(entry.data.cuisine_type ?? "");
      setPriceTier(entry.data.price_tier ?? null);
      if (entry.data.personal_rating != null) {
        setRating(Number(entry.data.personal_rating));
        setRated(true);
      } else {
        setRating(8);
        setRated(false);
      }
    }
  }, [entry.data]);

  if (!entry.data) return <div className="px-6 py-12 eyebrow">Loading…</div>;
  const e = entry.data;
  const isRateable = e.kind === "restaurant" || e.kind === "landmark";

  async function save() {
    const patch = {
      title: title || null,
      place_name: place || null,
      body: body || null,
      ...(e.kind === "restaurant"
        ? {
            cuisine_type: cuisine.trim() || null,
            price_tier: priceTier,
            personal_rating: rated ? rating : null,
          }
        : e.kind === "landmark"
          ? {
              personal_rating: rated ? rating : null,
            }
          : {}),
    };
    if (entryId.startsWith("guest-")) {
      updateGuestEntry(entryId, patch);
      toast.success("Saved");
      qc.invalidateQueries();
      return;
    }
    const { error } = await supabase
      .from("entries")
      .update(patch)
      .eq("id", entryId);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      qc.invalidateQueries();
    }
  }

  async function revertToPlanned() {
    if (entryId.startsWith("guest-")) {
      updateGuestEntry(entryId, { status: "planned" });
      toast.success("Back to planned.");
      qc.invalidateQueries();
      return;
    }
    // Status only — occurred_at keeps its scheduled date and time.
    const { error } = await supabase.from("entries").update({ status: "planned" }).eq("id", entryId);
    if (error) return void toast.error(error.message);
    toast.success("Back to planned.");
    qc.invalidateQueries();
  }

  async function remove() {
    if (entryId.startsWith("guest-")) {
      deleteGuestEntries([entryId]);
      qc.invalidateQueries();
      navigate({ to: "/memories" });
      return;
    }
    await supabase.from("entries").delete().eq("id", entryId);
    qc.invalidateQueries();
    navigate({ to: "/memories" });
  }

  return (
    <div>
      {!!e.entry_photos?.length && (
        <Photo path={e.entry_photos[0]?.storage_path} alt={e.title ?? "Memory"} className="aspect-[4/5] w-full" />
      )}
      <div className="px-6 pt-8">
        <span className="eyebrow">
          {KIND_LABEL[e.kind as Kind]} · {fmtTime(e.occurred_at)}
          {e.cities ? ` · ${e.cities.name}` : ""}
        </span>
        <input
          value={title}
          onChange={(ev) => setTitle(ev.target.value)}
          placeholder="Give it a name"
          className="display mt-4 w-full bg-transparent text-[2.4rem] outline-none placeholder:text-muted-foreground/40"
        />
        <input
          value={place}
          onChange={(ev) => setPlace(ev.target.value)}
          placeholder="Where was this?"
          className="mt-3 w-full border-b border-rule bg-transparent pb-2 text-xs uppercase tracking-[0.14em] outline-none"
        />
        <textarea
          value={body}
          onChange={(ev) => setBody(ev.target.value)}
          rows={5}
          placeholder="Write something down…"
          className="mt-6 w-full resize-none bg-transparent text-[1.05rem] leading-relaxed outline-none"
        />

        {e.kind === "restaurant" && (
          <div className="mt-6 border-t border-rule pt-6">
            <h2 className="eyebrow">Cuisine</h2>
            <input
              value={cuisine}
              onChange={(ev) => setCuisine(ev.target.value)}
              placeholder="Sicilian, ramen, small plates…"
              className="mt-2 w-full border-b border-rule bg-transparent pb-2 text-sm outline-none placeholder:text-muted-foreground/40"
            />

            <h2 className="eyebrow mt-6">Price</h2>
            <div className="mt-2 flex gap-2">
              {[1, 2, 3, 4].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPriceTier(priceTier === t ? null : t)}
                  className={cn(
                    "border border-rule px-4 py-2 text-sm tracking-[0.08em]",
                    priceTier === t && "border-accent text-accent",
                  )}
                >
                  {PRICE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        )}

        {isRateable && (
          <div className="mt-6 border-t border-rule pt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="eyebrow">Your Rating</h2>
              <div className="flex items-baseline gap-3">
                {rated && (
                  <button
                    type="button"
                    onClick={() => setRated(false)}
                    className="text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground underline"
                  >
                    Clear
                  </button>
                )}
                <span className="display text-2xl text-accent">
                  {rated ? rating.toFixed(1) : "—"}
                  <span className="text-sm text-muted-foreground">/10</span>
                </span>
              </div>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={rating}
              onChange={(ev) => {
                setRated(true);
                setRating(Number(ev.target.value));
              }}
              className="mt-3 w-full accent-[var(--color-accent,currentColor)]"
              aria-label="Rating out of 10"
            />
          </div>
        )}

        {e.entry_photos && e.entry_photos.length > 1 && (
          <div className="mt-6 grid grid-cols-2 gap-1">
            {e.entry_photos.slice(1).map((p) => (
              <Photo key={p.id} path={p.storage_path} alt="Memory" className="aspect-square w-full" />
            ))}
          </div>
        )}

        {e.landmarks && (e.landmarks.description || e.landmarks.history) && (
          <section className="mt-10 border-t border-rule pt-6">
            <span className="eyebrow">About {e.landmarks.name}</span>
            {e.landmarks.description && (
              <p className="mt-3 text-[1.02rem] leading-relaxed">{e.landmarks.description}</p>
            )}
            {e.landmarks.history && (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {e.landmarks.history}
              </p>
            )}
            {e.landmarks.culture && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {e.landmarks.culture}
              </p>
            )}
            {e.landmarks.fun_fact && (
              <p className="mt-4 border-l-2 border-accent pl-4 text-sm leading-relaxed">
                {e.landmarks.fun_fact}
              </p>
            )}
          </section>
        )}


        <div className="mt-10 flex items-center gap-6">
          <button
            onClick={save}
            className="flex-1 bg-primary py-4 text-xs uppercase tracking-[0.18em] text-primary-foreground"
          >
            Save
          </button>
          {e.status === "confirmed" && (
            <button
              onClick={revertToPlanned}
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Revert to planned
            </button>
          )}
          <button onClick={remove} className="text-xs uppercase tracking-[0.18em] text-destructive">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
