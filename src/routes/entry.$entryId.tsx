import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { Photo } from "@/components/Photo";
import { KIND_LABEL, fmtTime, useEntry, type Kind } from "@/lib/touri";

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

  useEffect(() => {
    if (entry.data) {
      setTitle(entry.data.title ?? "");
      setPlace(entry.data.place_name ?? "");
      setBody(entry.data.body ?? "");
    }
  }, [entry.data]);

  if (!entry.data) return <div className="px-6 py-12 eyebrow">Loading…</div>;
  const e = entry.data;

  async function save() {
    const { error } = await supabase
      .from("entries")
      .update({ title: title || null, place_name: place || null, body: body || null })
      .eq("id", entryId);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      qc.invalidateQueries();
    }
  }

  async function remove() {
    await supabase.from("entries").delete().eq("id", entryId);
    qc.invalidateQueries();
    navigate({ to: "/memories" });
  }

  return (
    <div>
      {!!e.entry_photos?.length && (
        <Photo path={e.entry_photos[0].storage_path} alt={e.title ?? "Memory"} className="aspect-[4/5] w-full" />
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

        {e.entry_photos && e.entry_photos.length > 1 && (
          <div className="mt-6 grid grid-cols-2 gap-1">
            {e.entry_photos.slice(1).map((p) => (
              <Photo key={p.id} path={p.storage_path} alt="Memory" className="aspect-square w-full" />
            ))}
          </div>
        )}

        <div className="mt-10 flex items-center gap-6">
          <button
            onClick={save}
            className="flex-1 bg-primary py-4 text-xs uppercase tracking-[0.18em] text-primary-foreground"
          >
            Save
          </button>
          <button onClick={remove} className="text-xs uppercase tracking-[0.18em] text-destructive">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
