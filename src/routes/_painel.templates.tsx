import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, FileText, Loader2, Megaphone, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { PageHeader } from "@/components/PageHeader";
import { TemplateForm } from "@/components/TemplateForm";
import { WhatsAppPreview } from "@/components/WhatsAppPreview";
import { formatDate } from "@/lib/format";
import { SAMPLE_CONTACT } from "@/lib/template";
import { renderTemplate, type Template } from "@/services/mock-data";
import { isOpen, templatesRepo } from "@/services/repository";
import { useStore } from "@/services/store";

export const Route = createFileRoute("/_painel/templates")({
  head: () => ({
    meta: [
      { title: "Templates — Disparador WhatsApp" },
      { name: "description", content: "Templates de mensagem usados nas campanhas." },
      { property: "og:title", content: "Templates — Disparador WhatsApp" },
      { property: "og:description", content: "Templates de mensagem usados nas campanhas." },
    ],
  }),
  component: Templates,
});

function Templates() {
  const { templates, campaigns } = useStore();
  const [busca, setBusca] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Template | undefined>();
  const [excluir, setExcluir] = useState<Template | null>(null);

  const visiveis = templates.filter((t) => `${t.nome} ${t.conteudo}`.toLowerCase().includes(busca.toLowerCase()));
  const abrirForm = (t?: Template) => { setEditing(t); setFormOpen(true); };
  const usoTexto = (id: string) => {
    const n = campaigns.filter((c) => c.templateId === id).length;
    return n === 0 ? "Nenhuma campanha" : n === 1 ? "1 campanha" : `${n} campanhas`;
  };

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Crie as mensagens que serão usadas nas campanhas"
        action={<Button onClick={() => abrirForm()}><Plus /> Novo template</Button>}
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar template..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {visiveis.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((t) => (
            <Card key={t.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => abrirForm(t)}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => abrirForm(t)}>{t.nome}</button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1" title="Data de criação">
                        <CalendarDays className="size-3.5" /> Criado em {formatDate(t.criadoEm)}
                      </span>
                      <span className="inline-flex items-center gap-1" title="Campanhas que usam este template">
                        <Megaphone className="size-3.5" /> {usoTexto(t.id)}
                      </span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="-mr-2 -mt-1 shrink-0" aria-label={`Mais ações de ${t.nome}`} onClick={(e) => e.stopPropagation()}><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    {/* O menu é renderizado em portal, mas o clique ainda "borbulha" até o card: por isso o stopPropagation. */}
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onSelect={() => abrirForm(t)}><Pencil className="size-4" /> Editar</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setExcluir(t)}><Trash2 className="size-4" /> Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <WhatsAppPreview compacto mensagem={renderTemplate(t.conteudo, SAMPLE_CONTACT)} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="mx-auto mb-2 h-6 w-6" />
            {templates.length ? "Nenhum template encontrado." : "Você ainda não criou nenhum template."}
          </CardContent>
        </Card>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar template" : "Novo template"}</DialogTitle>
            <DialogDescription>Defina o nome e a mensagem que será usada nas campanhas</DialogDescription>
          </DialogHeader>
          <TemplateForm key={editing?.id ?? "novo"} template={editing} onDone={() => setFormOpen(false)} />
        </DialogContent>
      </Dialog>

      <DeleteDialog
        template={excluir}
        emUso={excluir ? campaigns.filter((c) => c.templateId === excluir.id && isOpen(c.status)).length : 0}
        onClose={() => setExcluir(null)}
      />
    </>
  );
}

function DeleteDialog({ template, emUso, onClose }: { template: Template | null; emUso: number; onClose: () => void }) {
  const [excluindo, setExcluindo] = useState(false);
  const confirmar = async () => {
    if (!template) return;
    setExcluindo(true);
    try {
      await templatesRepo.remove(template.id);
      toast.success("Template excluído");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o template.");
    } finally {
      setExcluindo(false);
    }
  };
  return (
    <AlertDialog open={!!template} onOpenChange={(o) => !o && !excluindo && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir template?</AlertDialogTitle>
          <AlertDialogDescription>
            {emUso > 0
              ? `“${template?.nome}” é usado em ${emUso} campanha(s) em aberto. Conclua ou cancele essas campanhas antes de excluir.`
              : `“${template?.nome}” será excluído. Campanhas já concluídas ou canceladas continuam no histórico.`}
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
