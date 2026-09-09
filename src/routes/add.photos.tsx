import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { useActiveTrip, useCities } from "@/lib/touri";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/add/photos")({
  head: () => ({
    meta: [
      { title: "Add photos — Touri" },
      {
        name: "description",
        content: "Pick a batch of photos straight from your phone and let Touri file them.",
      },
      { property: "og:title", content: "Add photos — Touri" },
      {
        property: "og:description",
        content: "Pick a batch of photos straight from your phone and let Touri file them.",
      },
    ],
  }),
  component: () => (
    <Require>
      <AppShell>
        <AddPhotos />
      </AppShell>
    </Require>
  ),
});

function AddPhotos() {
  const { trip } = useActiveTrip();
  const cities = useCities(trip?.id);
  const [cityId, setCityId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const chosenCity = cityId ?? cities.data?.[0]?.id ?? null;

  async function upload() {
    if (!files.length) return;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    setBusy(true);
    setDone(0);

    for (const file of files) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("memories").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (upErr) {
        toast.error(upErr.message);
        continue;
      }
      const { data: entry } = await supabase
        .from("entries")
        .insert({
          user_id: uid,
          trip_id: trip?.id ?? null,
          city_id: chosenCity,
          kind: "photo",
          status: "pending",
          occurred_at: new Date(file.lastModified || Date.now()).toISOString(),
        })
        .select()
        .single();
      if (entry) {
        await supabase
          .from("entry_photos")
          .insert({ user_id: uid, entry_id: entry.id, storage_path: path });
      }
      setDone((d) => d + 1);
    }

    await qc.invalidateQueries();
    setBusy(false);
    toast.success("Filed into New memories.");
    navigate({ to: "/memories" });
  }

  return (
    <div className="px-6 pt-12">
      <span className="eyebrow">Add</span>
      <h1 className="display mt-5 text-[2.8rem]">Photos from your phone</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Select as many as you like. Touri sorts them by the time they were taken and drops them into
        New memories for you to confirm.
      </p>

      <h2 className="eyebrow mt-10">City</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {cities.data?.map((c) => (
          <button
            key={c.id}
            onClick={() => setCityId(c.id)}
            className={cn(
              "border border-rule px-4 py-2 text-sm",
              chosenCity === c.id && "border-accent text-accent",
            )}
          >
            {c.name}
          </button>
        ))}
        {!cities.data?.length && (
          <p className="text-sm text-muted-foreground">Add a city to your trip first.</p>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
      <button
        onClick={() => input.current?.click()}
        className="mt-10 w-full border border-dashed border-rule py-14 text-xs uppercase tracking-[0.18em]"
      >
        {files.length ? `${files.length} photos selected — change` : "Choose photos"}
      </button>

      {!!files.length && (
        <div className="mt-4 grid grid-cols-3 gap-1">
          {files.slice(0, 9).map((f, i) => (
            <img
              key={i}
              src={URL.createObjectURL(f)}
              alt=""
              className="aspect-square w-full object-cover"
            />
          ))}
        </div>
      )}

      <button
        disabled={!files.length || busy}
        onClick={upload}
        className="mt-8 w-full bg-primary py-4 text-xs uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-40"
      >
        {busy ? `Uploading ${done}/${files.length}…` : "Upload"}
      </button>
    </div>
  );
}
