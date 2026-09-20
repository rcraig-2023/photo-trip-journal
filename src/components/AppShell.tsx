import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Camera, MapPin, PenLine, Plus, UtensilsCrossed, X } from "lucide-react";
import { usePendingCount } from "@/lib/touri";
import { useUploadQueue } from "@/lib/uploadQueue";
import { cn } from "@/lib/utils";

const ADD_OPTIONS = [
  { kind: "photos", label: "Photos", hint: "Pick from your camera roll", icon: Camera },
  { kind: "jot", label: "Jot", hint: "A few lines, right now", icon: PenLine },
  { kind: "landmark", label: "Landmark", hint: "A place you stood in front of", icon: MapPin },
  { kind: "restaurant", label: "Restaurant", hint: "Something you ate", icon: UtensilsCrossed },
] as const;

const QUEUE_COPY: Record<string, string> = {
  preparing: "Preparing photos…",
  optimizing: "Optimizing photos…",
  uploading: "Uploading photos…",
  thinking: "Looking for places…",
};

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pending = usePendingCount();
  const queue = useUploadQueue();
  const pathname = useLocation({ select: (l) => l.pathname });
  const currentCity = pathname.match(/^\/city\/([^/]+)/)?.[1];


  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-background">
      <main className="flex-1 pb-28">{children}</main>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-2xl bg-paper px-5 pt-5 safe-bottom">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">Add to the journal</h2>
            <button aria-label="Close" onClick={() => setOpen(false)} className="p-2">
              <X className="size-5" />
            </button>
          </div>
          <ul className="mt-3">
            {ADD_OPTIONS.map((o) => (
              <li key={o.kind} className="hairline">
                <button
                  className="flex w-full items-center gap-4 py-4 text-left"
                  onClick={() => {
                    setOpen(false);
                    if (o.kind === "photos")
                      navigate({ to: "/add/photos", search: { city: currentCity } });
                    else
                      navigate({
                        to: "/add/$kind",
                        params: { kind: o.kind },
                        search: { city: currentCity },
                      });
                  }}
                >
                  <o.icon className="size-5 text-accent" strokeWidth={1.5} />
                  <span className="flex-1">
                    <span className="block text-[0.95rem]">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="h-3" />
        </div>
      )}

      {queue.running && (
        <div className="fixed inset-x-0 bottom-[4.6rem] z-30 mx-auto w-full max-w-2xl border-t border-rule bg-paper/95 px-6 py-2 backdrop-blur">
          <p className="text-xs tracking-[0.08em] text-muted-foreground">
            {QUEUE_COPY[queue.phase] ?? "Working…"}{" "}
            {queue.phase === "thinking" ? "" : `${queue.uploaded}/${queue.total}`}
          </p>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-2xl border-t border-rule bg-paper/95 backdrop-blur safe-bottom">

        <div className="grid grid-cols-5 items-center px-2 pt-2">
          <NavItem to="/" label="Today" />
          <NavItem to="/trip" label="Trip" />
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex flex-col items-center gap-1 py-1"
            aria-label="Add"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Plus className={cn("size-5 transition-transform", open && "rotate-45")} />
            </span>
            <span className="text-[0.62rem] tracking-[0.14em] uppercase text-muted-foreground">
              Add
            </span>
          </button>
          <NavItem to="/dining" label="Dining" icon={UtensilsCrossed} />
          <NavItem to="/memories" label="Memories" badge={pending.data ?? 0} />
        </div>
      </nav>
    </div>
  );
}

function NavItem({
  to,
  label,
  badge,
  icon: Icon,
}: {
  to: string;
  label: string;
  badge?: number;
  icon?: typeof UtensilsCrossed;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1 py-1 text-muted-foreground"
      activeProps={{ className: "text-foreground" }}
      activeOptions={{ exact: to === "/" }}
    >
      <span className="relative flex size-9 items-center justify-center">
        {Icon ? (
          <Icon className="size-4 opacity-70" strokeWidth={1.5} />
        ) : (
          <span className="size-1.5 rounded-full bg-current opacity-40" />
        )}
        {!!badge && (
          <span className="absolute -right-0.5 top-1 min-w-4 rounded-full bg-accent px-1 text-[0.6rem] leading-4 text-accent-foreground">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[0.62rem] uppercase tracking-[0.14em]">{label}</span>
    </Link>
  );
}
