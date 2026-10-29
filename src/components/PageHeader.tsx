import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CampaignStatus } from "@/services/mock-data";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const statusStyle: Record<CampaignStatus, { badge: string; dot: string }> = {
  Rascunho: { badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30", dot: "bg-slate-400" },
  Agendada: { badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30", dot: "bg-blue-500" },
  "Em andamento": { badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30", dot: "bg-emerald-500 animate-pulse" },
  Pausada: { badge: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30", dot: "bg-amber-500" },
  Concluída: { badge: "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30", dot: "bg-green-600" },
  Cancelada: { badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30", dot: "bg-red-500" },
};

/** Selo de status com largura fixa, para todas as linhas ficarem alinhadas. */
export function StatusBadge({ status }: { status: CampaignStatus }) {
  const s = statusStyle[status];
  return (
    <span className={cn("inline-flex w-32 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", s.badge)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {status}
    </span>
  );
}

export const allStatuses = Object.keys(statusStyle) as CampaignStatus[];
