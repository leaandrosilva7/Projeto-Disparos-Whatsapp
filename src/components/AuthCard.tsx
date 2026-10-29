import type { ReactNode } from "react";
import { MessageSquare } from "lucide-react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar text-sidebar-primary-foreground">
            <MessageSquare className="h-5 w-5" />
          </div>
          <span className="font-semibold">Disparador WhatsApp</span>
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
