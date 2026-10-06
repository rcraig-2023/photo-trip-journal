import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { signedUrl } from "@/lib/touri";
import { blobToDataUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

function isHeicPath(path: string) {
  return /\.hei[cf](\?|$)/i.test(path);
}

/** Resolve a storage path to a renderable URL, converting HEIC/HEIF to JPEG. */
async function renderableUrl(path: string): Promise<string> {
  const url = await signedUrl(path);
  if (!isHeicPath(path)) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    let out: Blob | undefined;
    try {
      // Newer libheif-based decoder — handles iPhone HEVC variants heic2any can't.
      const { heicTo } = await import("heic-to");
      out = await heicTo({ blob, type: "image/jpeg", quality: 0.85 });
    } catch {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({ blob, toType: "image/jpeg", quality: 0.85 });
      out = Array.isArray(converted) ? converted[0] : converted;
    }
    if (!out) throw new Error("conversion failed");
    return await blobToDataUrl(out);
  } catch {
    // Could not convert — return the raw URL and let <img> try anyway.
    return url;
  }
}

export function Photo({
  path,
  alt,
  className,
}: {
  path?: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const { data, isError } = useQuery({
    queryKey: ["photo", path],
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: () => renderableUrl(path!),
  });

  return (
    <div className={cn("overflow-hidden bg-muted", className)}>
      {data ? (
        <img
          src={data}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : isError ? (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <ImageOff className="size-5 text-muted-foreground/50" strokeWidth={1.5} />
        </div>
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" />
      )}
    </div>
  );
}
