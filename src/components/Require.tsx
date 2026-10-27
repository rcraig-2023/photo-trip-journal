import { type ReactNode } from "react";
import { useSession } from "@/lib/session";

export function Require({ children }: { children: ReactNode }) {
  const { loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="eyebrow">Touri</span>
      </div>
    );
  }
  return <>{children}</>;
}
