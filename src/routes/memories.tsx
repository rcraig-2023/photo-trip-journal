import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { Photo } from "@/components/Photo";
import { identifyLandmark } from "@/lib/ai.functions";
import {
  fmtTime,
  signedUrl,
  useActiveTrip,
  useCities,
  useEntries,
  type Entry,
  type Kind,
} from "@/lib/touri";
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

async function toDataUrl(path: string) {
  const url = await signedUrl(path);
  const blob = await fetch(url).then((r) => r.blob());
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

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
        <ul>
          {pending.data?.length ? (
            pending.data.map((e) => <InboxItem key={e.id} entry={e} />)
          ) : (
            <li className="px-6 py-16 text-sm text-muted-foreground">
              Nothing waiting. Tap + → Photos to bring in a batch from your phone.
            </li>
          )}
        </ul>
      ) : (
        <>
          <div className="flex gap-5 overflow-x-auto px-6 py-4 text-xs uppercase tracking-[0.14em]">
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
          <ul>
            {confirmed.map((e, i) => (
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
                      className={cn("mt-3 w-full", i % 4 === 0 ? "aspect-[4/5]" : "aspect-[3/2]")}
                    />
                  )}
                </Link>
              </li>
            ))}
            {!confirmed.length && (
              <li className="px-6 py-16 text-sm text-muted-foreground">Nothing here yet.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function InboxItem({ entry }: { entry: Entry }) {
  const { trip } = useActiveTrip();
  const cities = useCities(trip?.id);
  const qc = useQueryClient();
  const identify = useServerFn(identifyLandmark);
  const [title, setTitle] = useState(entry.title ?? "");
  const [kind, setKind] = useState<Kind>(entry.kind);
  const [cityId, setCityId] = useState<string | null>(entry.city_id);
  const [thinking, setThinking] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(entry.ai_suggestion);

  const photo = entry.entry_photos?.[0]?.storage_path;

  async function ask() {
    if (!photo) return;
    setThinking(true);
    try {
      const result = await identify({ data: { imageDataUrl: await toDataUrl(photo) } });
      if (!result.name) toast("Touri couldn't place this one — name it yourself.");
      else {
        setSuggestion(result.name);
        setKind(result.kind === "photo" ? "photo" : result.kind);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI could not run.");
    } finally {
      setThinking(false);
    }
  }

  async function confirm() {
    await supabase
      .from("entries")
      .update({
        title: (title || suggestion || null) as string | null,
        kind,
        city_id: cityId,
        status: "confirmed",
        ai_suggestion: suggestion,
      })
      .eq("id", entry.id);
    qc.invalidateQueries();
  }

  async function discard() {
    await supabase.from("entries").delete().eq("id", entry.id);
    qc.invalidateQueries();
  }

  return (
    <li className="border-t border-rule px-6 py-6">
      {photo && <Photo path={photo} alt="New memory" className="aspect-[4/5] w-full" />}
      <span className="timecode mt-3 block">
        {new Date(entry.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
        · {fmtTime(entry.occurred_at)}
      </span>

      {suggestion && (
        <p className="mt-2 text-sm text-accent">
          Touri thinks this is <span className="display text-lg">{suggestion}</span>
        </p>
      )}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={suggestion || "Name this memory"}
        className="display mt-2 w-full border-b border-rule bg-transparent pb-2 text-2xl outline-none placeholder:text-muted-foreground/40"
      />

      <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em]">
        {(["photo", "landmark", "restaurant", "jot"] as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn("border border-rule px-3 py-1.5", kind === k && "border-accent text-accent")}
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
            className={cn("border border-rule px-3 py-1.5", cityId === c.id && "border-accent text-accent")}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-4">
        <button
          onClick={confirm}
          className="flex-1 bg-primary py-3 text-xs uppercase tracking-[0.18em] text-primary-foreground"
        >
          Keep
        </button>
        <button
          onClick={ask}
          disabled={thinking || !photo}
          className="flex items-center gap-2 border border-rule px-4 py-3 text-xs uppercase tracking-[0.18em] disabled:opacity-40"
        >
          <Sparkles className="size-4 text-accent" strokeWidth={1.5} />
          {thinking ? "Looking…" : "Identify"}
        </button>
        <button onClick={discard} className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Discard
        </button>
      </div>
    </li>
  );
}
