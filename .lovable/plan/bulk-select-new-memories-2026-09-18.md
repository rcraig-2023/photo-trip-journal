# Bulk-select New Memories

## What will change
- Replace the New Memories vertical review feed with a dense three-column square photo grid.
- Let each thumbnail toggle selection, with a clear checkmark and restrained selected treatment.
- Add an info control per thumbnail that opens a bottom sheet with the larger photo, recognition state, suggested place, confidence, and explanation.
- Show a bottom floating action bar only while items are selected, with bulk confirm and discard actions.

## Bulk behavior
- Confirm all selected entries in one database update.
- For recognized entries, promote the AI suggestion to the title and change the kind to landmark; other selected entries keep their existing title and kind.
- Reuse or create the appropriate landmark records for recognized entries so these confirmations remain consistent with single-item confirmation.
- Discard selected entries in one delete operation after an explicit confirmation prompt.
- Keep selections and controls stable while saving, show errors without losing the photos, then refresh the inbox after success.

## Technical notes
- Keep the existing detailed single-memory editor available inside the inspection sheet for users who need to edit one item.
- Use the existing Photo, Button, Sheet, and alert dialog controls and current editorial design tokens.
- Preserve the existing Everything so far tab and its filters unchanged.
- Verify the mobile grid, sheet, bulk action bar, and database updates in the signed-in preview.
