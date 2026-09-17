# Sticky filters and editorial photo mosaics

## Build
- Add a shared photo-only mosaic that groups images into a repeating editorial rhythm: landscape hero, portrait pair, then a two-thirds image beside a stacked one-third column.
- Preserve each image’s natural ratio with contained grid placement, existing loading states, and a direct link from every photo to its memory detail.
- In the city chapter, switch to the mosaic only when Photos is selected; keep the existing dated timeline for every other filter.
- In Memories, switch the “Everything so far” Photos filter to the same photo-only mosaic and remove dates, titles, and notes from that mode.
- Make both content filter bars sticky with the requested translucent paper treatment, bottom rule, typography, and active state.

## Technical details
- Flatten each photo with its parent entry ID before composing repeating mosaic groups.
- Use stable responsive grid dimensions so mixed image counts remain balanced without generic uniform columns.
- Keep the existing `Photo` component for signed image loading and placeholders.
- Verify the preview build and both mobile/desktop layouts.
