import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { groupsRepo } from "@/services/repository";
import { useContacts } from "@/services/use-contacts";

/** Busca contatos (HubSpot) e adiciona ao grupo. Quem já está no grupo aparece marcado e desabilitado. */
export function ContactPicker({ open, onOpenChange, grupoId, atuais }: { open: boolean; onOpenChange: (v: boolean) => void; grupoId: string; atuais: string[] }) {
  const { contacts, loading, error, reload } = useContacts();
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const q = busca.toLowerCase();
  const filtrados = contacts.filter((c) => [c.nome, c.email, c.empresa, c.telefone].some((v) => v.toLowerCase().includes(q)));
  const livres = filtrados.filter((c) => !atuais.includes(c.id));
  const todosMarcados = livres.length > 0 && livres.every((c) => sel.includes(c.id));
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleTodos = () =>
    setSel((s) => (todosMarcados ? s.filter((id) => !livres.some((c) => c.id === id)) : [...new Set([...s, ...livres.map((c) => c.id)])]));

  const fechar = (v: boolean) => {
    if (salvando) return;
    if (!v) { setSel([]); setBusca(""); }
    onOpenChange(v);
  };

  const adicionar = async () => {
    setSalvando(true);
    try {
      const r = await groupsRepo.addContacts(grupoId, contacts.filter((c) => sel.includes(c.id)));
      toast.success(`${r.added} contato(s) adicionado(s) ao grupo`);
      fechar(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível adicionar os contatos.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar contatos</DialogTitle>
          <DialogDescription>Os contatos vêm do HubSpot. Adicionar ao grupo não altera o cadastro original.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, e-mail, empresa ou telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : error ? (
          <div className="py-6 text-center text-sm">
            <p className="mb-3 text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={reload}>Tentar novamente</Button>
          </div>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-3 px-2 text-sm text-muted-foreground">
              <Checkbox checked={todosMarcados} disabled={!livres.length} onCheckedChange={toggleTodos} />
              Selecionar todos os resultados ({livres.length})
            </label>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {filtrados.map((c) => {
                const jaNoGrupo = atuais.includes(c.id);
                return (
                  <label key={c.id} className={`flex items-center gap-3 rounded-md p-2 ${jaNoGrupo ? "opacity-50" : "cursor-pointer hover:bg-muted"}`}>
                    <Checkbox checked={jaNoGrupo || sel.includes(c.id)} disabled={jaNoGrupo} onCheckedChange={() => toggle(c.id)} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-medium">{c.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">{c.empresa} · {c.telefone}</span>
                    </span>
                    {jaNoGrupo && <span className="text-xs text-muted-foreground">Já no grupo</span>}
                  </label>
                );
              })}
              {!filtrados.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</p>}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => fechar(false)} disabled={salvando}>Cancelar</Button>
          <Button disabled={!sel.length || salvando} onClick={() => void adicionar()}>
            {salvando && <Loader2 className="animate-spin" />}Adicionar ({sel.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
