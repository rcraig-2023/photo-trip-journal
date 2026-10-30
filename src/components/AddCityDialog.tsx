import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Compass } from "lucide-react";
import { toast } from "sonner";
import { CityAutocomplete } from "@/components/CityAutocomplete";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { addGuestCity } from "@/lib/guestStore";
import { useSession } from "@/lib/session";
import { useCities, type Trip } from "@/lib/touri";

export function AddCityDialog({
  open,
  onOpenChange,
  trip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Pick<Trip, "id" | "title"> | null | undefined;
}) {
  const { user } = useSession();
  const cities = useCities(trip?.id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setCountry("");
      setStart("");
      setEnd("");
      setLat(null);
      setLng(null);
      setSaving(false);
    }
  }, [open]);

  if (!trip) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!trip || !name.trim() || saving) return;

    setSaving(true);
    try {
      let createdCityId: string;

      if (!user || trip.id.startsWith("guest-")) {
        const guestCity = addGuestCity({
          trip_id: trip.id,
          name: name.trim(),
          country: country.trim() || null,
          start_date: start || null,
          end_date: end || null,
          lat,
          lng,
        });
        createdCityId = guestCity.id;
      } else {
        const nextSortOrder = (cities.data ?? []).length;
        const { data, error } = await supabase
          .from("cities")
          .insert({
            user_id: user.id,
            trip_id: trip.id,
            name: name.trim(),
            country: country.trim() || null,
            start_date: start || null,
            end_date: end || null,
            sort_order: nextSortOrder,
            lat,
            lng,
          })
          .select("id")
          .single();

        if (error || !data) throw error ?? new Error("Could not add city chapter.");
        createdCityId = data.id;
      }

      await qc.invalidateQueries();
      toast.success(`Added ${name.trim()} to ${trip.title}`);
      onOpenChange(false);
      navigate({ to: "/city/$cityId", params: { cityId: createdCityId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add city.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-rule bg-background p-6">
        <DialogHeader>
          <span className="eyebrow inline-flex items-center gap-1.5 text-accent">
            <Compass className="size-3.5" /> {trip.title}
          </span>
          <DialogTitle className="display mt-1 text-2xl font-normal">
            Add a city chapter
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Add the next destination in your current trip so you can group its photos, jots, and places into its own chapter.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="mt-4 space-y-5">
          <div>
            <span className="eyebrow block">Destination</span>
            <CityAutocomplete
              value={name}
              onChange={(v) => {
                setName(v);
                setCountry("");
                setLat(null);
                setLng(null);
              }}
              onPick={(hit) => {
                setName(hit.name);
                setCountry(hit.country ?? "");
                setLat(hit.lat);
                setLng(hit.lng);
              }}
              placeholder="Kyoto, Paris, Philadelphia…"
              className="display mt-2 w-full border-b border-rule bg-transparent pb-2 text-2xl outline-none placeholder:text-muted-foreground/45"
            />
            {country && (
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {country}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="eyebrow block">Arrival (optional)</span>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1.5 w-full border-b border-rule bg-transparent pb-1.5 text-xs outline-none"
              />
            </label>
            <label className="block">
              <span className="eyebrow block">Departure (optional)</span>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1.5 w-full border-b border-rule bg-transparent pb-1.5 text-xs outline-none"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="border border-rule px-4 py-2.5 text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="bg-primary px-5 py-2.5 text-xs uppercase tracking-[0.16em] text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add chapter →"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
