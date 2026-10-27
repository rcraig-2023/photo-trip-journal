import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TIER_LIMITS, useTierAccess } from "@/lib/tiers";
import { cn } from "@/lib/utils";

export function UpgradeDialog({
  open,
  onOpenChange,
  tripId,
  tripTitle,
  reason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId?: string | null | undefined;
  tripTitle?: string | null | undefined;
  reason?: string | null | undefined;
}) {
  const access = useTierAccess(tripId);
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<"trip_pass" | "pro">("trip_pass");
  const [busy, setBusy] = useState(false);

  // Stage 0: Guest user -> Nudge to create a free account first
  if (!access.isAuthenticated) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md rounded-sm border-rule bg-paper p-6">
          <DialogHeader className="text-left">
            <span className="eyebrow flex items-center gap-1.5 text-accent">
              <Sparkles className="size-3.5" /> Guest Preview · {access.photosUsed}/{TIER_LIMITS.guest.maxPhotos} Local Photos
            </span>
            <DialogTitle className="display mt-2 text-3xl font-normal leading-tight">
              Save your journal to the cloud
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {reason ??
                "Your memories are currently stored only in this browser tab. Create a free account to back them up permanently and unlock AI place recognition."}
            </DialogDescription>
          </DialogHeader>

          <ul className="mt-4 space-y-2.5 border-y border-rule py-4 text-xs text-foreground">
            <li className="flex items-center gap-2.5">
              <Check className="size-4 shrink-0 text-accent" />
              <span>Automatically sync your {access.photosUsed} guest photos to your account</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Check className="size-4 shrink-0 text-accent" />
              <span>Expand to {TIER_LIMITS.free.maxPhotos} cloud photos + {TIER_LIMITS.free.maxAiScans} AI landmark & restaurant scans</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Check className="size-4 shrink-0 text-accent" />
              <span>Access your travel journal from your phone and desktop</span>
            </li>
          </ul>

          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                navigate({ to: "/auth" });
              }}
              className="w-full bg-primary py-3.5 text-xs uppercase tracking-[0.18em] text-primary-foreground"
            >
              Create Free Account →
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground"
            >
              Keep browsing guest preview
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  async function handleUnlock() {
    setBusy(true);
    try {
      await access.updatePlan(selectedPlan, tripId);
      toast.success(
        selectedPlan === "pro"
          ? "Touri Pro unlocked — enjoy unlimited trips, AI recognition & PDF exports."
          : `Trip Pass unlocked for ${tripTitle ?? "this trip"}!`,
      );
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-sm border-rule bg-paper p-6">
        <DialogHeader className="text-left">
          <span className="eyebrow flex items-center gap-1.5 text-accent">
            <Lock className="size-3.5" /> Touri Membership
          </span>
          <DialogTitle className="display mt-2 text-3xl font-normal leading-tight">
            Keep writing every chapter of your trip
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {reason ??
              `Free Explorer includes 1 city, ${TIER_LIMITS.free.maxPhotos} photos, and ${TIER_LIMITS.free.maxAiScans} AI recognitions. Unlock a Trip Pass or Touri Pro for the full experience.`}
          </DialogDescription>
        </DialogHeader>

        {/* Current Free Usage Bar */}
        <div className="mt-3 grid grid-cols-2 gap-3 border border-rule bg-background/60 px-3.5 py-2.5 text-xs">
          <div>
            <span className="eyebrow block text-[0.6rem]">Cloud Photos</span>
            <span className="timecode mt-0.5 block text-foreground">
              {access.photosUsed} / {access.limits.maxPhotos} used
            </span>
          </div>
          <div>
            <span className="eyebrow block text-[0.6rem]">AI Place Scans</span>
            <span className="timecode mt-0.5 block text-foreground">
              {access.aiScansUsed} / {access.limits.maxAiScans} used
            </span>
          </div>
        </div>

        {/* Plan Selector */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setSelectedPlan("trip_pass")}
            className={cn(
              "flex flex-col border p-4 text-left transition-colors",
              selectedPlan === "trip_pass"
                ? "border-accent bg-accent/5"
                : "border-rule bg-paper hover:border-foreground/40",
            )}
          >
            <div className="flex w-full items-baseline justify-between">
              <span className="eyebrow text-accent">Single Trip Pass</span>
              <span className="display text-2xl">$9</span>
            </div>
            <p className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
              One-time · {tripTitle ? `For “${tripTitle}”` : "For 1 full trip"}
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-foreground">
              <li className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <span>Unlimited cities & up to 500 photos on this trip</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <span>Full AI landmark, restaurant & itinerary import</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <span>Print-ready Editorial PDF & Shareable Album link</span>
              </li>
            </ul>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPlan("pro")}
            className={cn(
              "flex flex-col border p-4 text-left transition-colors",
              selectedPlan === "pro"
                ? "border-accent bg-accent/5"
                : "border-rule bg-paper hover:border-foreground/40",
            )}
          >
            <div className="flex w-full items-baseline justify-between">
              <span className="eyebrow text-accent">Touri Pro</span>
              <span className="display text-2xl">$29</span>
            </div>
            <p className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
              Per year · All trips & archive
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-foreground">
              <li className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <span>Unlimited trips & cities all year</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <span>Unlimited AI recognition & Google Places ratings</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <span>Editorial PDF export & sharing on every trip</span>
              </li>
            </ul>
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleUnlock}
            className="w-full bg-primary py-3.5 text-xs uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-50"
          >
            {busy
              ? "Unlocking…"
              : selectedPlan === "pro"
                ? "Unlock Touri Pro — $29/yr"
                : "Unlock Single Trip Pass — $9"}
          </button>
          <p className="text-center text-[0.68rem] text-muted-foreground">
            Instant preview activation enabled · Switch plans anytime in Settings.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
