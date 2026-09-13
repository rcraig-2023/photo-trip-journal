import { Photo } from "@/components/Photo";
import { cn } from "@/lib/utils";

/**
 * Editorial bento-box photo grid.
 *
 * 1 photo  → full-bleed large aspect
 * 2 photos → 50/50 side-by-side
 * 3 photos → hero on top, two squares below
 * 4+ photos → clean 2×2 grid (first four only)
 *
 * No borders, no cards — just the photographs and a hairline gap.
 */
export function PhotoGrid({
  photos,
  alt,
  className,
}: {
  photos: { id: string; storage_path: string }[];
  alt: string;
  className?: string;
}) {
  const n = photos.length;
  if (n === 0) return null;

  const shown = photos.slice(0, 4);

  if (n === 1) {
    return (
      <div className={cn("grid grid-cols-1 gap-[2px]", className)}>
        <Photo path={shown[0].storage_path} alt={alt} className="aspect-[4/5] w-full" />
      </div>
    );
  }

  if (n === 2) {
    return (
      <div className={cn("grid grid-cols-2 gap-[2px]", className)}>
        {shown.map((p) => (
          <Photo key={p.id} path={p.storage_path} alt={alt} className="aspect-[3/4] w-full" />
        ))}
      </div>
    );
  }

  if (n === 3) {
    return (
      <div className={cn("grid grid-cols-2 gap-[2px]", className)}>
        <Photo
          path={shown[0].storage_path}
          alt={alt}
          className="col-span-2 aspect-[3/2] w-full"
        />
        <Photo path={shown[1].storage_path} alt={alt} className="aspect-square w-full" />
        <Photo path={shown[2].storage_path} alt={alt} className="aspect-square w-full" />
      </div>
    );
  }

  // 4+ photos → 2×2 grid of the first four
  return (
    <div className={cn("grid grid-cols-2 gap-[2px]", className)}>
      {shown.map((p) => (
        <Photo key={p.id} path={p.storage_path} alt={alt} className="aspect-square w-full" />
      ))}
    </div>
  );
}
