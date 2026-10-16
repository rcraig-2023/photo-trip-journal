<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- `/trip` is an Outlet-only layout; the overview lives in `trip.index.tsx`, so the print album can omit the app shell.
- Album density is calculated in a browser-safe pure helper using the larger entry/photo count; this keeps thresholds testable and multi-photo albums compact.
- Export uses dedicated unlinked editorial plates and text strips, with every attached photo rendered eagerly; Photo reports decoded or failed state so PDF printing cannot silently omit unresolved images.
