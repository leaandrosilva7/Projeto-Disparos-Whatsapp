import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Eye, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ManualContactDialog } from "@/components/ManualContactDialog";
import { HubspotListImport } from "@/components/HubspotListImport";
import { PageHeader } from "@/components/PageHeader";
import { phoneIssueLabel } from "@/lib/phone";
import { isOpen, groupsRepo } from "@/services/repository";
import type { ContactGroup } from "@/services/mock-data";
import { useStore } from "@/services/store";
import { useGroupContacts } from "@/services/use-contacts";

export const Route = createFileRoute("/_painel/grupos")({
  head: () => ({
    meta: [
      { title: "Grupos de Contatos — Disparador WhatsApp" },
      { name: "description", content: "Grupos de contatos usados nas campanhas." },
      { property: "og:title", content: "Grupos de Contatos — Disparador WhatsApp" },
      { property: "og:description", content: "Grupos de contatos usados nas campanhas." },
    ],
  }),
  component: Grupos,
});

function Grupos() {
  const { groups, campaigns } = useStore();
  const [busca, setBusca] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<ContactGroup | undefined>();
  const [verId, setVerId] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<ContactGroup | null>(null);

  const visiveis = groups.filter((g) => `${g.nome} ${g.descricao}`.toLowerCase().includes(busca.toLowerCase()));
  const ver = groups.find((g) => g.id === verId);

  return (
    <>
      <PageHeader
        title="Grupos de Contatos"
        subtitle="Organize seus contatos em grupos para usar nas campanhas"
        action={<Button onClick={() => { setEditando(undefined); setFormOpen(true); }}><Plus /> Novo grupo</Button>}
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar grupo..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grupo</TableHead>
                <TableHead className="text-center">Contatos</TableHead>
                <TableHead className="w-28 text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((g) => (
                <TableRow key={g.id} className="cursor-pointer" onClick={() => setVerId(g.id)}>
                  <TableCell>
                    <button className="text-left font-medium hover:underline" onClick={() => setVerId(g.id)}>{g.nome}</button>
                    {g.descricao && <p className="max-w-md truncate text-xs text-muted-foreground">{g.descricao}</p>}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{g.contatoIds.length}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label={`Mais ações de ${g.nome}`} onClick={(e) => e.stopPropagation()}><MoreHorizontal /></Button>
                        </DropdownMenuTrigger>
                        {/* O menu é renderizado em portal, mas o clique ainda "borbulha" até a linha: por isso o stopPropagation. */}
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onSelect={() => setVerId(g.id)}><Eye className="size-4" /> Visualizar contatos</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { setEditando(g); setFormOpen(true); }}><Pencil className="size-4" /> Editar</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setExcluir(g)}><Trash2 className="size-4" /> Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {!visiveis.length && (
                <TableRow>
                  <TableCell colSpan={3} className="py-12 text-center text-muted-foreground">
                    <Users className="mx-auto mb-2 h-6 w-6" />
                    {groups.length ? "Nenhum grupo encontrado." : "Crie seu primeiro grupo para usá-lo nas campanhas."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <GroupFormDialog key={editando?.id ?? "novo"} open={formOpen} onOpenChange={setFormOpen} grupo={editando} onCreated={(g) => setVerId(g.id)} />
      <GroupSheet grupo={ver} onClose={() => setVerId(null)} />
      <DeleteDialog
        grupo={excluir}
        emUso={excluir ? campaigns.filter((c) => c.grupoIds.includes(excluir.id) && isOpen(c.status)).length : 0}
        onClose={() => setExcluir(null)}
      />
    </>
  );
}

/** Criar (sem `grupo`) ou editar nome/descrição. */
function GroupFormDialog({ open, onOpenChange, grupo, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; grupo?: ContactGroup | undefined; onCreated: (g: ContactGroup) => void }) {
  const [nome, setNome] = useState(grupo?.nome ?? "");
  const [descricao, setDescricao] = useState(grupo?.descricao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!nome.trim()) return setErro("Informe o nome do grupo.");
    setSalvando(true);
    setErro(null);
    try {
      if (grupo) {
        await groupsRepo.update(grupo.id, { nome, descricao });
        toast.success("Grupo atualizado");
      } else {
        const g = await groupsRepo.create({ nome, descricao });
        toast.success("Grupo criado. Agora adicione contatos.");
        onCreated(g);
      }
      onOpenChange(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o grupo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !salvando && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{grupo ? "Editar grupo" : "Novo grupo"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="g-nome">Nome</Label>
            <Input id="g-nome" autoFocus placeholder="Ex.: Clientes VIP" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void salvar()} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-desc">Descrição <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="g-desc" rows={3} placeholder="Para que serve este grupo?" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>{salvando && <Loader2 className="animate-spin" />}{grupo ? "Salvar" : "Criar grupo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Painel lateral com os contatos do grupo. */
function GroupSheet({ grupo, onClose }: { grupo?: ContactGroup | undefined; onClose: () => void }) {
  const { byId, loading } = useGroupContacts(grupo?.contatoIds ?? []);
  const [busca, setBusca] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const q = busca.toLowerCase();
  const membros = (grupo?.contatoIds ?? []).map((id) => ({ id, c: byId(id) }));
  const visiveis = membros.filter(({ c }) => !c || [c.nome, c.email, c.empresa, c.telefone].some((v) => v.toLowerCase().includes(q)));

  const remover = async (id: string) => {
    if (!grupo) return;
    setRemovendo(id);
    try {
      await groupsRepo.removeContacts(grupo.id, [id]);
      toast.success("Contato removido do grupo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover o contato.");
    } finally {
      setRemovendo(null);
    }
  };

  return (
    <>
      <Sheet open={!!grupo} onOpenChange={(o) => { if (!o) { setBusca(""); onClose(); } }}>
        <SheetContent className="flex w-full flex-col gap-4 sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{grupo?.nome}</SheetTitle>
            <SheetDescription>{grupo?.descricao || `${grupo?.contatoIds.length ?? 0} contato(s) neste grupo`}</SheetDescription>
          </SheetHeader>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar neste grupo..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => setImportOpen(true)}><Download /> Importar do HubSpot</Button>
            <Button onClick={() => setAddOpen(true)}><UserPlus /> Adicionar</Button>
          </div>
          <div className="-mx-1 flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Contato</TableHead><TableHead className="hidden sm:table-cell">Telefone</TableHead><TableHead className="w-12" /></TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>}
                {!loading && visiveis.map(({ id, c }) => (
                  <TableRow key={id}>
                    <TableCell>
                      <p className="font-medium">{c ? c.nome || c.email || "Contato sem nome" : "Contato indisponível"}</p>
                      <p className="text-xs text-muted-foreground">{c ? [c.empresa, c.nome ? c.email : ""].filter(Boolean).join(" · ") : "Não encontrado no HubSpot"}</p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {c?.telefoneErro ? <span className="text-destructive">{phoneIssueLabel[c.telefoneErro]}</span> : c?.telefone || "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" disabled={removendo === id} aria-label="Remover do grupo" onClick={() => void remover(id)}>
                        {removendo === id ? <Loader2 className="animate-spin" /> : <UserMinus className="text-destructive" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && !visiveis.length && (
                  <TableRow><TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                    <Users className="mx-auto mb-2 h-6 w-6" />{membros.length ? "Nenhum contato encontrado." : "Este grupo ainda não tem contatos."}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>
      {grupo && <ManualContactDialog key={grupo.id} open={addOpen} onOpenChange={setAddOpen} grupoId={grupo.id} />}
      {grupo && <HubspotListImport key={`hs-${grupo.id}`} open={importOpen} onOpenChange={setImportOpen} grupoId={grupo.id} atuais={grupo.contatoIds} />}
    </>
  );
}

function DeleteDialog({ grupo, emUso, onClose }: { grupo: ContactGroup | null; emUso: number; onClose: () => void }) {
  const [excluindo, setExcluindo] = useState(false);
  const confirmar = async () => {
    if (!grupo) return;
    setExcluindo(true);
    try {
      await groupsRepo.remove(grupo.id);
      toast.success("Grupo excluído");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o grupo.");
    } finally {
      setExcluindo(false);
    }
  };
  return (
    <AlertDialog open={!!grupo} onOpenChange={(o) => !o && !excluindo && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir grupo?</AlertDialogTitle>
          <AlertDialogDescription>
            {emUso > 0
              ? `“${grupo?.nome}” é usado em ${emUso} campanha(s) em aberto. Conclua ou cancele essas campanhas antes de excluir.`
              : `“${grupo?.nome}” será excluído. Os contatos continuam no HubSpot, nada é apagado de lá.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={excluindo || emUso > 0} onClick={() => void confirmar()}>
            {excluindo && <Loader2 className="animate-spin" />}Excluir
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
