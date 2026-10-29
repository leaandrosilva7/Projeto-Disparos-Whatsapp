import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { phoneIssueLabel } from "@/lib/phone";
import { hubspotService } from "@/services/integrations";
import type { HubspotList } from "@/services/hubspot";
import type { Contact } from "@/services/mock-data";
import { groupsRepo } from "@/services/repository";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const msg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

type Status = "loading" | "ok" | "error";

/**
 * Importa contatos de uma lista do HubSpot para um grupo, em duas telas:
 * 1) escolher a lista (busca por nome, quantidade de contatos); 2) escolher os contatos.
 * Contatos sem telefone válido aparecem desabilitados e nunca entram na seleção.
 */
export function HubspotListImport({ open, onOpenChange, grupoId, atuais }: { open: boolean; onOpenChange: (v: boolean) => void; grupoId: string; atuais: string[] }) {
  const [step, setStep] = useState<"listas" | "contatos">("listas");

  // --- listas ---
  const [query, setQuery] = useState("");
  const [queryAtiva, setQueryAtiva] = useState("");
  const [listas, setListas] = useState<HubspotList[]>([]);
  const [totalListas, setTotalListas] = useState(0);
  const [proximaListas, setProximaListas] = useState<number | null>(null);
  const [statusListas, setStatusListas] = useState<Status>("loading");
  const [erroListas, setErroListas] = useState("");
  const [maisListas, setMaisListas] = useState(false);
  const reqListas = useRef(0);

  // --- contatos da lista escolhida ---
  const [lista, setLista] = useState<HubspotList | null>(null);
  const [contatos, setContatos] = useState<Contact[]>([]);
  const [proximoContatos, setProximoContatos] = useState<string | null>(null);
  const [totalContatos, setTotalContatos] = useState<number | null>(null);
  const [statusContatos, setStatusContatos] = useState<Status>("loading");
  const [erroContatos, setErroContatos] = useState("");
  const [maisContatos, setMaisContatos] = useState(false);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const reqContatos = useRef(0);

  /* busca de listas com atraso de 350 ms após parar de digitar */
  useEffect(() => {
    const t = setTimeout(() => setQueryAtiva(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const carregarListas = useCallback(async (q: string, offset: number) => {
    const id = ++reqListas.current;
    if (offset) setMaisListas(true);
    else setStatusListas("loading");
    try {
      const page = await hubspotService.searchLists(q, offset);
      if (id !== reqListas.current) return;
      setListas((prev) => (offset ? [...prev, ...page.listas] : page.listas));
      setTotalListas(page.total);
      setProximaListas(page.proximo);
      setStatusListas("ok");
    } catch (e) {
      if (id !== reqListas.current) return;
      setErroListas(msg(e, "Não foi possível carregar as listas."));
      setStatusListas("error");
    } finally {
      if (id === reqListas.current) setMaisListas(false);
    }
  }, []);

  useEffect(() => {
    if (open && step === "listas") void carregarListas(queryAtiva, 0);
  }, [open, step, queryAtiva, carregarListas]);

  const carregarContatos = useCallback(async (listId: string, after?: string) => {
    const id = ++reqContatos.current;
    if (after) setMaisContatos(true);
    else setStatusContatos("loading");
    try {
      const page = await hubspotService.getListContacts(listId, after);
      if (id !== reqContatos.current) return;
      setContatos((prev) => (after ? [...prev, ...page.contatos] : page.contatos));
      setProximoContatos(page.proximo);
      if (page.total !== null) setTotalContatos(page.total);
      setStatusContatos("ok");
    } catch (e) {
      if (id !== reqContatos.current) return;
      setErroContatos(msg(e, "Não foi possível carregar os contatos da lista."));
      // se já havia contatos carregados, mantém a tela e só avisa
      if (after) toast.error(msg(e, "Não foi possível carregar mais contatos."));
      else setStatusContatos("error");
    } finally {
      if (id === reqContatos.current) setMaisContatos(false);
    }
  }, []);

  const abrirLista = (l: HubspotList) => {
    reqContatos.current++;
    setLista(l);
    setStep("contatos");
    setContatos([]);
    setProximoContatos(null);
    setTotalContatos(l.tamanho);
    setSel([]);
    setBusca("");
    void carregarContatos(l.id);
  };

  const voltarParaListas = () => {
    reqContatos.current++;
    setStep("listas");
    setLista(null);
  };

  const fechar = (v: boolean) => {
    if (salvando) return;
    if (!v) {
      reqListas.current++;
      reqContatos.current++;
      setStep("listas");
      setQuery("");
      setQueryAtiva("");
      setLista(null);
      setContatos([]);
      setSel([]);
      setBusca("");
    }
    onOpenChange(v);
  };

  /* --- seleção --- */
  const q = busca.toLowerCase();
  const filtrados = contatos.filter((c) => [c.nome, c.email, c.empresa, c.telefone].some((v) => v.toLowerCase().includes(q)));
  const selecionaveis = filtrados.filter((c) => !c.telefoneErro && !atuais.includes(c.id));
  const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((c) => sel.includes(c.id));
  const semTelefone = contatos.filter((c) => c.telefoneErro).length;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleTodos = () =>
    setSel((s) => (todosMarcados ? s.filter((id) => !selecionaveis.some((c) => c.id === id)) : [...new Set([...s, ...selecionaveis.map((c) => c.id)])]));

  const adicionar = async () => {
    setSalvando(true);
    try {
      const r = await groupsRepo.addContacts(grupoId, contatos.filter((c) => sel.includes(c.id)));
      toast.success(`${r.added} contato(s) adicionado(s) ao grupo`);
      setSalvando(false);
      fechar(false);
    } catch (e) {
      toast.error(msg(e, "Não foi possível adicionar os contatos."));
      setSalvando(false);
    }
  };

  const Skeletons = () => <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  const Erro = ({ texto, onRetry }: { texto: string; onRetry: () => void }) => (
    <div className="py-6 text-center text-sm">
      <p className="mb-3 text-destructive">{texto}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>Tentar novamente</Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{step === "listas" ? "Importar do HubSpot" : lista?.nome}</DialogTitle>
          <DialogDescription>
            {step === "listas"
              ? "Escolha uma lista do HubSpot para ver os contatos. Importar não altera nada no HubSpot."
              : "Selecione os contatos que entrarão no grupo. Só é possível adicionar quem tem telefone válido."}
          </DialogDescription>
        </DialogHeader>

        {!hubspotService.configured && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Modo demonstração: dados fictícios, pois o token do HubSpot ainda não foi configurado.
          </p>
        )}

        {step === "listas" ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar lista pelo nome..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {statusListas === "loading" ? (
              <Skeletons />
            ) : statusListas === "error" ? (
              <Erro texto={erroListas} onRetry={() => void carregarListas(queryAtiva, 0)} />
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {listas.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    disabled={l.tamanho === 0}
                    onClick={() => abrirLista(l)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{l.nome}</span>
                      <span className="block text-xs text-muted-foreground">
                        {l.tamanho === null ? "Quantidade indisponível" : l.tamanho === 0 ? "Sem contatos" : `${fmt(l.tamanho)} contatos`}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
                {!listas.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma lista encontrada.</p>}
                {proximaListas !== null && (
                  <Button variant="outline" size="sm" className="w-full" disabled={maisListas} onClick={() => void carregarListas(queryAtiva, proximaListas)}>
                    {maisListas && <Loader2 className="animate-spin" />}Carregar mais listas ({fmt(listas.length)} de {fmt(totalListas)})
                  </Button>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => fechar(false)}>Cancelar</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar nos contatos carregados..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            {statusContatos === "loading" ? (
              <Skeletons />
            ) : statusContatos === "error" ? (
              <Erro texto={erroContatos} onRetry={() => lista && void carregarContatos(lista.id)} />
            ) : (
              <>
                <label className="flex cursor-pointer items-center gap-3 px-2 text-sm text-muted-foreground">
                  <Checkbox checked={todosMarcados} disabled={!selecionaveis.length} onCheckedChange={toggleTodos} />
                  Selecionar todos os disponíveis ({selecionaveis.length})
                </label>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {filtrados.map((c) => {
                    const jaNoGrupo = atuais.includes(c.id);
                    const bloqueado = !!c.telefoneErro || jaNoGrupo;
                    const detalhe = [c.telefoneErro ? null : c.telefone, c.nome ? c.email : null, c.empresa].filter(Boolean).join(" · ");
                    return (
                      <label key={c.id} className={`flex items-center gap-3 rounded-md p-2 ${bloqueado ? "cursor-not-allowed" : "cursor-pointer hover:bg-muted"}`}>
                        <Checkbox checked={jaNoGrupo || sel.includes(c.id)} disabled={bloqueado} onCheckedChange={() => toggle(c.id)} />
                        <span className={`min-w-0 flex-1 text-sm ${bloqueado ? "opacity-60" : ""}`}>
                          <span className="block truncate font-medium">{c.nome || c.email || "Contato sem nome"}</span>
                          {detalhe && <span className="block truncate text-xs text-muted-foreground">{detalhe}</span>}
                        </span>
                        {c.telefoneErro ? (
                          <Badge variant="outline" className="shrink-0 border-destructive/40 text-destructive">{phoneIssueLabel[c.telefoneErro]}</Badge>
                        ) : jaNoGrupo ? (
                          <span className="shrink-0 text-xs text-muted-foreground">Já no grupo</span>
                        ) : null}
                      </label>
                    );
                  })}
                  {!filtrados.length && <p className="py-6 text-center text-sm text-muted-foreground">{contatos.length ? "Nenhum contato encontrado." : "Esta lista não tem contatos."}</p>}
                </div>
                {semTelefone > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {semTelefone} contato(s) carregado(s) sem telefone válido não podem ser adicionados ao grupo.
                  </p>
                )}
                {proximoContatos !== null && (
                  <Button variant="outline" size="sm" disabled={maisContatos} onClick={() => lista && void carregarContatos(lista.id, proximoContatos)}>
                    {maisContatos && <Loader2 className="animate-spin" />}
                    Carregar mais contatos ({fmt(contatos.length)}{totalContatos !== null ? ` de ${fmt(totalContatos)}` : ""})
                  </Button>
                )}
                {proximoContatos !== null && (
                  <p className="text-xs text-muted-foreground">Os contatos são carregados 100 por vez. A seleção vale apenas para os já carregados.</p>
                )}
              </>
            )}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" onClick={voltarParaListas} disabled={salvando}><ArrowLeft /> Voltar às listas</Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => fechar(false)} disabled={salvando}>Cancelar</Button>
                <Button disabled={!sel.length || salvando} onClick={() => void adicionar()}>
                  {salvando && <Loader2 className="animate-spin" />}Adicionar ({sel.length})
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
