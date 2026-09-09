import { useQuery } from "@tanstack/react-query";
import { signedUrl } from "@/lib/touri";
import { cn } from "@/lib/utils";

export function Photo({
  path,
  alt,
  className,
}: {
  path?: string | null;
  alt: string;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["photo", path],
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
    queryFn: () => signedUrl(path!),
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
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" />
      )}
    </div>
  );
}
