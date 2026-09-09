import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { useActiveTrip, useCities } from "@/lib/touri";
import { enqueuePhotos, onQueueChange, useUploadQueue } from "@/lib/uploadQueue";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/add/photos")({
  validateSearch: (search: Record<string, unknown>) => ({
    city: typeof search["city"] === "string" ? (search["city"] as string) : undefined,
  }),
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

const PHASE_COPY: Record<string, string> = {
  preparing: "Preparing photos…",
  optimizing: "Optimizing photos…",
  uploading: "Uploading photos…",
  thinking: "Looking for places…",
};

function AddPhotos() {
  const { city: cityFromContext } = Route.useSearch();
  const { trip } = useActiveTrip();
  const cities = useCities(trip?.id);
  const [cityId, setCityId] = useState<string | null>(cityFromContext ?? null);
  const [files, setFiles] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const queue = useUploadQueue();

  useEffect(() => {
    onQueueChange(() => qc.invalidateQueries());
  }, [qc]);

  const chosenCity = cityId ?? cityFromContext ?? cities.data?.[0]?.id ?? null;
  const previews = useMemo(() => files.slice(0, 9).map((f) => URL.createObjectURL(f)), [files]);

  async function start() {
    if (!files.length) return;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const batch = files;
    setFiles([]);
    toast.success(`${batch.length} photo${batch.length > 1 ? "s" : ""} on their way — keep browsing.`);
    navigate({ to: "/memories" });
    await enqueuePhotos(batch, { userId: uid, tripId: trip?.id ?? null, cityId: chosenCity });
    qc.invalidateQueries();
  }

  return (
    <div className="px-6 pt-12">
      <span className="eyebrow">Add</span>
      <h1 className="display mt-5 text-[2.8rem]">Photos from your phone</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Select as many as you like. Touri shrinks them so they travel light, sorts them by the time
        they were taken, and files them in New memories. You can leave this screen while it works.
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

      {!!previews.length && (
        <div className="mt-4 grid grid-cols-3 gap-1">
          {previews.map((src, i) => (
            <img key={i} src={src} alt="" className="aspect-square w-full object-cover" />
          ))}
        </div>
      )}

      {queue.running && (
        <p className="mt-6 text-sm text-muted-foreground">
          {PHASE_COPY[queue.phase] ?? "Working…"} {queue.uploaded}/{queue.total}
        </p>
      )}

      <button
        disabled={!files.length || queue.running}
        onClick={start}
        className="mt-8 w-full bg-primary py-4 text-xs uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-40"
      >
        {queue.running ? "Working…" : "Upload"}
      </button>
    </div>
  );
}
