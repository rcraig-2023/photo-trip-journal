export type AlbumMode = "auto" | "feature" | "magazine" | "contact";
export type AlbumDensity = Exclude<AlbumMode, "auto">;

/** Use the larger count so multi-photo memories also influence print density. */
export function albumDensity(mode: AlbumMode, entryCount: number, photoCount: number): AlbumDensity {
  if (mode !== "auto") return mode;
  const count = Math.max(entryCount, photoCount);
  if (count <= 5) return "feature";
  if (count <= 16) return "magazine";
  return "contact";
}