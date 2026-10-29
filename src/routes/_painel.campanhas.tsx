import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarClock, CalendarOff, Loader2, Megaphone, MoreHorizontal, Pause, Pencil, Play, Plus, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CampaignForm } from "@/components/CampaignForm";
import { PageHeader, StatusBadge, allStatuses } from "@/components/PageHeader";
import { formatDateTime } from "@/lib/format";
import type { Campaign } from "@/services/mock-data";
import { campaignsRepo, canDo } from "@/services/repository";
import { useStore } from "@/services/store";

export const Route = createFileRoute("/_painel/campanhas")({
  head: () => ({
    meta: [
      { title: "Campanhas — Disparador WhatsApp" },
      { name: "description", content: "Lista de campanhas de WhatsApp." },
      { property: "og:title", content: "Campanhas — Disparador WhatsApp" },
      { property: "og:description", content: "Lista de campanhas de WhatsApp." },
    ],
  }),
  component: Campanhas,
});

type Pending = { campaign: Campaign; action: "start" | "cancel" };

function Campanhas() {
  const { campaigns } = useStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | undefined>();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visiveis = campaigns.filter(
    (c) => (filtro === "todos" || c.status === filtro) && c.nome.toLowerCase().includes(busca.toLowerCase()),
  );

  const abrirForm = (c?: Campaign) => { setEditing(c); setFormOpen(true); };

  const executar = async (c: Campaign, action: "start" | "pause" | "resume" | "cancel") => {
    setBusyId(c.id);
    const msgs = { start: "Campanha iniciada", pause: "Campanha pausada", resume: "Campanha retomada", cancel: "Campanha cancelada" };
    try {
      await campaignsRepo[action](c.id);
      toast.success(msgs[action]);
      setPending(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir a operação.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader title="Campanhas" subtitle="Crie, agende e acompanhe seus disparos" action={<Button onClick={() => abrirForm()}><Plus /> Nova campanha</Button>} />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar campanha..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {allStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead className="text-center">Enviados</TableHead>
                <TableHead className="hidden text-center md:table-cell">Agendamento</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((c) => {
                const busy = busyId === c.id;
                const principal = !c.podeEditar ? null : canDo(c.status, "start") ? "start" : canDo(c.status, "pause") ? "pause" : canDo(c.status, "resume") ? "resume" : null;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.templateNome ?? "Sem template"}{c.contaNome && !c.podeEditar ? ` · Setor: ${c.contaNome}` : ""}</p>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {c.enviados.toLocaleString("pt-BR")}/{c.totalContatos.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="hidden text-center md:table-cell">
                      {c.agendadaPara ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                          <CalendarClock className="size-4 text-primary" /> {formatDateTime(c.agendadaPara)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-foreground/70">
                          <CalendarOff className="size-4" /> Sem agendamento
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center"><StatusBadge status={c.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {principal === "start" && <Button size="sm" className="w-28" disabled={busy} onClick={() => setPending({ campaign: c, action: "start" })}><Play /> Iniciar</Button>}
                        {principal === "pause" && <Button size="sm" variant="outline" className="w-28" disabled={busy} onClick={() => void executar(c, "pause")}>{busy ? <Loader2 className="animate-spin" /> : <Pause />} Pausar</Button>}
                        {principal === "resume" && <Button size="sm" variant="outline" className="w-28" disabled={busy} onClick={() => void executar(c, "resume")}>{busy ? <Loader2 className="animate-spin" /> : <Play />} Retomar</Button>}
                        {c.podeEditar && (canDo(c.status, "edit") || canDo(c.status, "cancel")) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" disabled={busy} aria-label={`Mais ações de ${c.nome}`}><MoreHorizontal /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canDo(c.status, "edit") && <DropdownMenuItem onSelect={() => abrirForm(c)}><Pencil className="size-4" /> Editar</DropdownMenuItem>}
                              {canDo(c.status, "edit") && canDo(c.status, "cancel") && <DropdownMenuSeparator />}
                              {canDo(c.status, "cancel") && (
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setPending({ campaign: c, action: "cancel" })}>
                                  <XCircle className="size-4" /> Cancelar campanha
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!visiveis.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    <Megaphone className="mx-auto mb-2 h-6 w-6" />
                    {campaigns.length ? "Nenhuma campanha encontrada." : "Você ainda não criou nenhuma campanha."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar campanha" : "Nova campanha"}</DialogTitle>
            <DialogDescription>Defina o público, a mensagem e quando enviar</DialogDescription>
          </DialogHeader>
          <CampaignForm key={editing?.id ?? "nova"} campaign={editing} onDone={() => setFormOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && busyId === null && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.action === "start" ? "Iniciar campanha?" : "Cancelar campanha?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "start"
                ? `“${pending.campaign.nome}” começará a enviar mensagens para os contatos dos grupos selecionados.`
                : `“${pending?.campaign.nome}” será cancelada e não poderá ser retomada.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Voltar</AlertDialogCancel>
            <Button
              variant={pending?.action === "cancel" ? "destructive" : "default"}
              disabled={busyId !== null}
              onClick={() => pending && void executar(pending.campaign, pending.action)}
            >
              {busyId !== null && <Loader2 className="animate-spin" />}
              {pending?.action === "start" ? "Confirmar e iniciar" : "Cancelar campanha"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
