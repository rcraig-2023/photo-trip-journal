import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route: /trip/$tripId/export and future sub-routes render here.
// The /trip page itself lives in trip.index.tsx.
export const Route = createFileRoute("/trip")({
  component: () => <Outlet />,
});
