import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { useActiveTrip, useCities, type Kind } from "@/lib/touri";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/add/$kind")({
  validateSearch: (search: Record<string, unknown>) => ({
    city: typeof search["city"] === "string" ? (search["city"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "New entry — Touri" },
      { name: "description", content: "Write a jot or note a landmark or restaurant." },
      { property: "og:title", content: "New entry — Touri" },
      { property: "og:description", content: "Write a jot or note a landmark or restaurant." },
    ],
  }),
  component: () => (
    <Require>
      <AppShell>
        <AddEntry />
      </AppShell>
    </Require>
  ),
});

const COPY: Record<string, { heading: string; titlePh: string; bodyPh: string }> = {
  jot: { heading: "A few lines", titlePh: "", bodyPh: "Walked along the Thames…" },
  landmark: { heading: "A landmark", titlePh: "Tower Bridge", bodyPh: "What it felt like…" },
  restaurant: { heading: "A restaurant", titlePh: "Dishoom", bodyPh: "What you ate…" },
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocal() {
  return toLocalInput(new Date());
}

function AddEntry() {
  const { kind } = Route.useParams();
  const { city: cityParam } = Route.useSearch();
  const k: Kind = kind === "landmark" || kind === "restaurant" ? kind : "jot";
  const copy = COPY[k]!;
  const { trip } = useActiveTrip();
  const cities = useCities(trip?.id);
  const [cityId, setCityId] = useState<string | null>(cityParam ?? null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState(nowLocal);
  const [cuisine, setCuisine] = useState("");
  const [priceTier, setPriceTier] = useState<number | null>(null);
  const [rating, setRating] = useState(7);
  const [rated, setRated] = useState(false);
  const [busy, setBusy] = useState(false);
  const touchedWhen = useRef(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const chosenCity = cityId ?? cities.data?.[0]?.id ?? null;
  const city = cities.data?.find((c) => c.id === chosenCity) ?? null;

  // While reading a city chapter, start the clock at that chapter's first day.
  useEffect(() => {
    if (touchedWhen.current) return;
    if (city?.start_date) setWhen(`${city.start_date}T12:00`);
    else setWhen(nowLocal());
  }, [city?.start_date]);

  async function save() {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    setBusy(true);
    const occurred = when ? new Date(when) : new Date();
    const { error } = await supabase.from("entries").insert({
      user_id: uid,
      trip_id: trip?.id ?? null,
      city_id: chosenCity,
      kind: k,
      title: title.trim() || null,
      body: body.trim() || null,
      status: "confirmed",
      occurred_at: (isNaN(occurred.getTime()) ? new Date() : occurred).toISOString(),
      ...(k === "restaurant"
        ? {
            cuisine_type: cuisine.trim() || null,
            price_tier: priceTier,
            personal_rating: rated ? rating : null,
          }
        : {}),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries();
    if (chosenCity) navigate({ to: "/city/$cityId", params: { cityId: chosenCity } });
    else navigate({ to: "/" });
  }

  return (
    <div className="px-6 pt-12">
      <span className="eyebrow">{copy.heading}</span>
      {k !== "jot" && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={copy.titlePh}
          className="display mt-5 w-full bg-transparent text-[2.6rem] outline-none placeholder:text-muted-foreground/40"
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={7}
        placeholder={copy.bodyPh}
        className={cn(
          "mt-6 w-full resize-none bg-transparent outline-none",
          k === "jot"
            ? "font-[var(--font-display)] text-2xl leading-snug placeholder:text-muted-foreground/40"
            : "text-[1.05rem] leading-relaxed",
        )}
      />

      <h2 className="eyebrow mt-8">When</h2>
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => {
          touchedWhen.current = true;
          setWhen(e.target.value);
        }}
        className="mt-2 w-full border-b border-rule bg-transparent pb-2 outline-none"
      />

      <h2 className="eyebrow mt-8">City</h2>
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
      </div>

      <button
        onClick={save}
        disabled={busy || (!body.trim() && !title.trim())}
        className="mt-10 w-full bg-primary py-4 text-xs uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-40"
      >
        Add to the journal
      </button>
    </div>
  );
}
