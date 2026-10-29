import { useEffect, useSyncExternalStore } from "react";
import { apiFetch } from "./api";
import type { Campaign, Contact, ContactGroup, Template } from "./mock-data";

/**
 * Cache local dos dados do servidor (grupos, campanhas, templates, contatos manuais).
 * A fonte da verdade é o banco: nada é gravado no navegador. `repository.ts` chama `refresh` após cada mutação.
 */
export type State = {
  groups: ContactGroup[];
  campaigns: Campaign[];
  templates: Template[];
  manualContacts: Contact[];
  loaded: boolean;
  error: string | null;
};
export type Slice = "groups" | "campaigns" | "templates" | "manualContacts";

type RawCampaign = Omit<Campaign, "grupoIds" | "templateId" | "agendadaPara" | "contaId"> & {
  accountId: string;
  templateId: string | null;
  agendadaPara: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** ISO (UTC) do servidor -> "YYYY-MM-DDTHH:mm" no fuso local, formato que a interface já usa. */
export function isoToLocal(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function toCampaign(r: RawCampaign): Campaign {
  const { accountId, ...rest } = r;
  return { ...rest, contaId: accountId, grupoIds: r.grupos.map((g) => g.id), templateId: r.templateId ?? "", agendadaPara: isoToLocal(r.agendadaPara) };
}

const empty: State = { groups: [], campaigns: [], templates: [], manualContacts: [], loaded: false, error: null };
let state: State = empty;
const listeners = new Set<() => void>();
const emit = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};

const fetchers: Record<Slice, () => Promise<Partial<State>>> = {
  groups: async () => ({ groups: (await apiFetch<{ grupos: ContactGroup[] }>("/api/grupos")).grupos }),
  templates: async () => ({ templates: (await apiFetch<{ templates: Template[] }>("/api/templates")).templates }),
  campaigns: async () => ({ campaigns: (await apiFetch<{ campanhas: RawCampaign[] }>("/api/campanhas")).campanhas.map(toCampaign) }),
  manualContacts: async () => ({ manualContacts: (await apiFetch<{ contatos: Contact[] }>("/api/contatos-manuais")).contatos }),
};

let loading: Promise<void> | null = null;

export const store = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,
  getServer: () => empty,
  /** Recarrega do servidor as partes indicadas (ou tudo). */
  async refresh(slices: Slice[] = ["groups", "campaigns", "templates", "manualContacts"]) {
    try {
      const parts = await Promise.all(slices.map((s) => fetchers[s]()));
      emit({ ...state, ...Object.assign({}, ...parts), loaded: true, error: null });
    } catch (e) {
      emit({ ...state, loaded: true, error: e instanceof Error ? e.message : "Não foi possível carregar os dados." });
    }
  },
  ensureLoaded() {
    if (!state.loaded && !loading) loading = store.refresh().finally(() => (loading = null));
  },
  /** Usado ao sair da conta e nos testes. */
  reset() {
    emit(empty);
  },
};

export function useStore() {
  const s = useSyncExternalStore(store.subscribe, store.get, store.getServer);
  useEffect(() => store.ensureLoaded(), []);
  return s;
}
