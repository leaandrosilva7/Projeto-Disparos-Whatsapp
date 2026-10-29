import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hubspotService } from "./integrations";
import type { Contact } from "./mock-data";
import { useStore } from "./store";

/** Carrega os contatos avulsos da fonte externa (mock). As telas só conhecem este hook. */
export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    hubspotService
      .listContacts()
      .then(setContacts)
      .catch(() => setError("Não foi possível carregar os contatos."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);
  return { contacts, loading, error, reload: load };
}

/**
 * Resolve os contatos de um grupo a partir dos ids guardados: os do HubSpot são buscados na API
 * (em lote, só os que ainda não foram carregados) e os do mock vêm de `useContacts`.
 */
export function useGroupContacts(ids: string[]) {
  const { contacts: externos, loading: carregandoAvulsos } = useContacts();
  const { manualContacts } = useStore();
  const avulsos = useMemo(() => [...externos, ...manualContacts], [externos, manualContacts]); // manuais nunca vão ao HubSpot
  const [remotos, setRemotos] = useState<Record<string, Contact>>({});
  const [buscando, setBuscando] = useState(false);
  const tentados = useRef(new Set<string>()); // ids já consultados (evita repetir os que o HubSpot não devolveu)

  const faltando = useMemo(
    () => ids.filter((id) => !(id in remotos) && !tentados.current.has(id) && !avulsos.some((c) => c.id === id)),
    [ids, remotos, avulsos],
  );
  const chave = faltando.join(",");

  useEffect(() => {
    if (carregandoAvulsos || !faltando.length) return;
    let ativo = true;
    setBuscando(true);
    hubspotService
      .getContactsByIds(faltando)
      .then((lista) => {
        if (!ativo) return;
        faltando.forEach((id) => tentados.current.add(id));
        // ids que o HubSpot não devolveu ficam fora do mapa e aparecem como "indisponível"
        setRemotos((r) => ({ ...r, ...Object.fromEntries(lista.map((c) => [c.id, c])) }));
      })
      .catch(() => undefined)
      .finally(() => ativo && setBuscando(false));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, carregandoAvulsos]);

  const byId = useCallback((id: string) => remotos[id] ?? avulsos.find((c) => c.id === id), [remotos, avulsos]);
  return { byId, loading: carregandoAvulsos || buscando };
}
