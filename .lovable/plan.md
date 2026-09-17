# Travel Archive

## Build
- Replace the plain past-trip list with a horizontal row of wide journal-cover buttons under a “Travel Archive” eyebrow heading.
- Load one available memory photo for each past trip and use the existing photo loader; show a restrained muted cover when a trip has no image.
- Set the selected trip as active, clear the previous active state, refresh trip-related content, and smoothly return to the top.
- Add display titles, compact dates, a right-arrow cue, and subtle motion while preserving Touri’s editorial style.

## Technical details
- Query only the past-trip IDs for cover candidates and map the first photo to each trip.
- Disable archive controls during switching and surface any save failure without changing the current screen.
- Verify type safety, preview health, and the archive at mobile and desktop sizes.
