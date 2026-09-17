import { Link } from "@tanstack/react-router";
import { Photo } from "@/components/Photo";
import type { Entry } from "@/lib/touri";
import { cn } from "@/lib/utils";

type MosaicPhoto = {
  id: string;
  storagePath: string;
  entryId: string;
  alt: string;
};

type MosaicGroup =
  | { pattern: "hero"; photos: MosaicPhoto[] }
  | { pattern: "portraits"; photos: MosaicPhoto[] }
  | { pattern: "asymmetric"; photos: MosaicPhoto[] };

function groupPhotos(photos: MosaicPhoto[]) {
  const groups: MosaicGroup[] = [];
  let cursor = 0;
  let pattern = 0;

  while (cursor < photos.length) {
    const remaining = photos.length - cursor;
    const preferredSize = pattern === 0 ? 1 : pattern === 1 ? 2 : 3;
    const size = Math.min(preferredSize, remaining);
    const kind = pattern === 0 ? "hero" : pattern === 1 ? "portraits" : "asymmetric";
    groups.push({ pattern: kind, photos: photos.slice(cursor, cursor + size) } as MosaicGroup);
    cursor += size;
    pattern = (pattern + 1) % 3;
  }

  return groups;
}

function PhotoLink({ photo, className }: { photo: MosaicPhoto; className?: string }) {
  return (
    <Link
      to="/entry/$entryId"
      params={{ entryId: photo.entryId }}
      aria-label={`Open ${photo.alt}`}
      className={cn("block min-h-0 overflow-hidden", className)}
    >
      <Photo path={photo.storagePath} alt={photo.alt} className="h-full w-full" />
    </Link>
  );
}

export function EditorialPhotoMosaic({
  entries,
  className,
}: {
  entries: Entry[];
  className?: string;
}) {
  const photos = entries.flatMap((entry) =>
    (entry.entry_photos ?? []).map((photo) => ({
      id: photo.id,
      storagePath: photo.storage_path,
      entryId: entry.id,
      alt: entry.title ?? entry.place_name ?? "Travel memory",
    })),
  );

  if (!photos.length) return null;

  return (
    <div className={cn("space-y-4 px-3 py-4", className)}>
      {groupPhotos(photos).map((group, index) => {
        if (group.pattern === "hero" || group.photos.length === 1) {
          const photo = group.photos[0];
          if (!photo) return null;
          return (
            <PhotoLink
              key={`${group.pattern}-${photo.id}`}
              photo={photo}
              className="aspect-[3/2] w-full"
            />
          );
        }

        if (group.pattern === "portraits" || group.photos.length === 2) {
          return (
            <div key={`${group.pattern}-${index}`} className="grid grid-cols-2 gap-3">
              {group.photos.map((photo) => (
                <PhotoLink key={photo.id} photo={photo} className="aspect-[3/4]" />
              ))}
            </div>
          );
        }

        const lead = group.photos[0];
        const small = group.photos.slice(1);
        if (!lead) return null;

        return (
          <div
            key={`${group.pattern}-${lead.id}`}
            className="grid aspect-[4/3] grid-cols-3 grid-rows-2 gap-3"
          >
            <PhotoLink photo={lead} className="col-span-2 row-span-2" />
            <div className="col-span-1 row-span-2 grid min-h-0 grid-rows-2 gap-3">
              {small.map((photo) => (
                <PhotoLink key={photo.id} photo={photo} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}