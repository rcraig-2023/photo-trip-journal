import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MODEL = "google/gemini-3.8-flash";

async function askGemini(body: unknown) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured yet.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const message = await res.text();
    if (res.status === 429) throw new Error("Too many requests — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are used up for this workspace.");
    throw new Error(message.slice(0, 200) || "AI request failed");
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

function parseJson<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

const IdentifyInput = z.object({ imageDataUrl: z.string().min(32).max(6_000_000) });

export const identifyLandmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdentifyInput.parse(d))
  .handler(async ({ data }) => {
    const raw = await askGemini({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            'You identify places in travel photos. Reply with strict JSON only: {"name": string, "kind": "landmark"|"restaurant"|"photo", "place": string, "confidence": number between 0 and 1, "explanation": string}. "place" is "City, Country". "explanation" is one short sentence starting "This photo appears to show". If you cannot recognise a specific place, use name "" , kind "photo", confidence 0 and an empty explanation. Never guess.',
        },
        {
          role: "user",
          content: [
            { type: "text", text: "What place is this? JSON only." },
            { type: "image_url", image_url: { url: data.imageDataUrl } },
          ],
        },
      ],
    });

    const parsed = parseJson<{
      name?: string;
      kind?: string;
      place?: string;
      confidence?: number;
      explanation?: string;
    }>(raw);

    const empty = { name: "", kind: "photo" as const, place: "", confidence: 0, explanation: "" };
    if (!parsed) return empty;

    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));
    return {
      name: parsed.name ?? "",
      kind: (parsed.kind === "restaurant"
        ? "restaurant"
        : parsed.kind === "landmark"
          ? "landmark"
          : "photo") as "restaurant" | "landmark" | "photo",
      place: parsed.place ?? "",
      confidence,
      explanation: parsed.explanation ?? "",
    };
  });

const EnrichInput = z.object({
  name: z.string().min(1).max(200),
  place: z.string().max(200).optional(),
});

/** Runs once per landmark, after the traveller confirms it. */
export const enrichLandmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EnrichInput.parse(d))
  .handler(async ({ data }) => {
    const raw = await askGemini({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            'You write short, warm travel-journal notes. Reply with strict JSON only: {"description": string, "history": string, "culture": string, "fun_fact": string, "caption": string}. Each field is one or two plain sentences, no markdown, no lists. "caption" is a short first-person caption a traveller could use.',
        },
        {
          role: "user",
          content: `Write notes about ${data.name}${data.place ? ` in ${data.place}` : ""}. JSON only.`,
        },
      ],
    });

    const parsed = parseJson<{
      description?: string;
      history?: string;
      culture?: string;
      fun_fact?: string;
      caption?: string;
    }>(raw);
    if (!parsed) throw new Error("Could not write notes for this place.");

    return {
      description: parsed.description ?? "",
      history: parsed.history ?? "",
      culture: parsed.culture ?? "",
      fun_fact: parsed.fun_fact ?? "",
      caption: parsed.caption ?? "",
    };
  });

const ItineraryInput = z.object({
  text: z.string().min(3).max(20_000),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  cities: z.array(z.string().max(120)).max(50),
});

export type ItineraryItem = {
  title: string;
  kind: "landmark" | "restaurant" | "jot";
  place: string;
  city: string;
  note: string;
  occurred_at: string | null;
};

/** Turns messy pasted itinerary text into planned entries anchored to the trip dates. */
export const parseItinerary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ItineraryInput.parse(d))
  .handler(async ({ data }) => {
    const raw = await askGemini({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You turn unstructured travel itineraries into structured plans. The text may be out of order, abbreviated or missing dates.
Trip start date: ${data.startDate ?? "unknown"}. Trip end date: ${data.endDate ?? "unknown"}.
Cities on this trip: ${data.cities.join(", ") || "unknown"}.
Reply with strict JSON only: {"items": [{"title": string, "kind": "landmark"|"restaurant"|"jot", "place": string, "city": string, "note": string, "occurred_at": string|null}]}.
Rules:
- One item per distinct place or activity. "restaurant" for food/drink places, "landmark" for sights/museums/places, "jot" for anything else (transfers, reminders).
- Anchor relative terms ("Day 1", "Friday", "the next morning", "last night") to the trip dates. Day 1 = trip start date. Weekdays refer to the first matching day within the trip range.
- occurred_at is local time as "YYYY-MM-DDTHH:MM". If a day is implied but no time, use a sensible time (breakfast 09:00, lunch 13:00, dinner 20:00, sights 11:00).
- If no date is implied at all, occurred_at MUST be null. Never invent dates.
- "city" must be one of the listed cities when it clearly matches, otherwise "".
- "note" is a short plain sentence from the source text, or "".`,
        },
        { role: "user", content: data.text },
      ],
    });

    const parsed = parseJson<{ items?: Partial<ItineraryItem>[] }>(raw);
    if (!parsed?.items) throw new Error("Could not read that itinerary. Try pasting it again.");

    return parsed.items
      .filter((i) => i.title && typeof i.title === "string")
      .slice(0, 80)
      .map<ItineraryItem>((i) => ({
        title: String(i.title).slice(0, 200),
        kind: i.kind === "restaurant" || i.kind === "landmark" ? i.kind : "jot",
        place: String(i.place ?? "").slice(0, 200),
        city: String(i.city ?? ""),
        note: String(i.note ?? "").slice(0, 500),
        occurred_at:
          typeof i.occurred_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(i.occurred_at)
            ? i.occurred_at.slice(0, 16)
            : null,
      }));
  });
