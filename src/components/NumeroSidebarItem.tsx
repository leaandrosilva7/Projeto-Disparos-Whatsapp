import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { pickPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { zapiService, type ConexaoNumero, type ConexaoStatus } from "@/services/integrations";

/** O lucide-react não tem ícones de marcas, então o logo do WhatsApp vem como SVG (Simple Icons, domínio público). */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

const statusInfo: Record<ConexaoStatus, { label: string; dot: string }> = {
  ativo: { label: "Ativo", dot: "bg-emerald-500" },
  bloqueado: { label: "Bloqueado", dot: "bg-red-500" },
  // Z-API ainda não integrada: não afirmamos nem "Ativo" nem "Bloqueado".
  indisponivel: { label: "Não verificado", dot: "bg-muted-foreground/40" },
};

/** Item "Número" da sidebar + modal para ver e trocar o número de WhatsApp usado nos disparos. */
export function NumeroSidebarItem() {
  const [open, setOpen] = useState(false);
  const [conexao, setConexao] = useState<ConexaoNumero | null>(null);
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void zapiService.getConnection().then(setConexao);
  }, []);

  const info = statusInfo[conexao?.status ?? "indisponivel"];
  const numeroAtual = conexao?.numero ? pickPhone({ mobilephone: conexao.numero }) : null;
  const numeroTexto = numeroAtual?.ok ? numeroAtual.formatted : (conexao?.numero ?? null);

  const handleOpenChange = (o: boolean) => {
    if (saving) return;
    setOpen(o);
    if (!o) { setNovo(""); setErro(null); }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = pickPhone({ mobilephone: novo });
    if (!r.ok) {
      setErro("Informe um celular válido com DDD, ex.: (11) 91234-5678.");
      return;
    }
    setSaving(true);
    try {
      await zapiService.saveNumber(r.e164);
      setConexao(await zapiService.getConnection());
      toast.success("Número salvo");
      setOpen(false);
      setNovo("");
      setErro(null);
    } catch {
      toast.error("Não foi possível salvar o número.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip={`Número: ${info.label}`} onClick={() => setOpen(true)}>
          <span className="relative">
            <WhatsAppIcon className="size-4" />
            {/* Com a sidebar recolhida o texto some, então o indicador vai por cima do ícone */}
            <span className={cn("absolute -right-1 -top-1 hidden size-2 rounded-full ring-2 ring-sidebar group-data-[collapsible=icon]:block", info.dot)} />
          </span>
          <span>Número</span>
          <span role="img" aria-label={info.label} title={info.label} className={cn("ml-auto size-2 shrink-0 rounded-full group-data-[collapsible=icon]:hidden", info.dot)} />
        </SidebarMenuButton>
      </SidebarMenuItem>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Número do WhatsApp</DialogTitle>
            <DialogDescription>Número usado nos disparos das campanhas.</DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void salvar(e)} className="grid gap-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Número atual</p>
                <p className="truncate font-semibold tabular-nums">{numeroTexto ?? "Nenhum número cadastrado"}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
                <span className={cn("size-2 rounded-full", info.dot)} /> {info.label}
              </span>
            </div>
            {conexao?.status === "indisponivel" && (
              <p className="-mt-2 text-xs text-muted-foreground">O status real será exibido quando a conexão com a Z-API estiver disponível.</p>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="novo-numero">Novo número</Label>
              <Input
                id="novo-numero"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 91234-5678"
                value={novo}
                onChange={(e) => { setNovo(e.target.value); setErro(null); }}
                aria-invalid={!!erro}
                disabled={saving}
              />
              {erro && <p className="text-xs text-destructive">{erro}</p>}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => handleOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving || !novo.trim()}>
                {saving && <Loader2 className="animate-spin" />} Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
