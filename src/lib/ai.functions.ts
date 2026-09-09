import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ imageDataUrl: z.string().min(32).max(4_000_000) });

export const identifyLandmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured yet.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          {
            role: "system",
            content:
              "You identify places in travel photos. Reply with strict JSON only: {\"name\": string, \"kind\": \"landmark\"|\"restaurant\"|\"photo\", \"place\": string, \"confidence\": number}. If you cannot recognise a specific place, use name \"\" and confidence 0.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "What place is this? JSON only." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const message = await res.text();
      if (res.status === 429) throw new Error("Too many requests — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits are used up for this workspace.");
      throw new Error(message.slice(0, 200) || "AI request failed");
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { name: "", kind: "photo" as const, place: "", confidence: 0 };
    try {
      const parsed = JSON.parse(match[0]) as {
        name?: string;
        kind?: string;
        place?: string;
        confidence?: number;
      };
      return {
        name: parsed.name ?? "",
        kind: (parsed.kind === "restaurant" ? "restaurant" : parsed.kind === "landmark" ? "landmark" : "photo") as
          | "restaurant"
          | "landmark"
          | "photo",
        place: parsed.place ?? "",
        confidence: Number(parsed.confidence ?? 0),
      };
    } catch {
      return { name: "", kind: "photo" as const, place: "", confidence: 0 };
    }
  });
