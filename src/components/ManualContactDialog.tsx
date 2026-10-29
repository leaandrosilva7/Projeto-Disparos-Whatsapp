import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { groupsRepo } from "@/services/repository";

/** Cadastra um contato manualmente (nome + celular) e o adiciona ao grupo. Não envia nada ao HubSpot. */
export function ManualContactDialog({ open, onOpenChange, grupoId }: { open: boolean; onOpenChange: (v: boolean) => void; grupoId: string }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const fechar = (v: boolean) => {
    if (salvando) return;
    if (!v) { setNome(""); setTelefone(""); setEmail(""); setEmpresa(""); setErro(null); }
    onOpenChange(v);
  };

  const adicionar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await groupsRepo.addManualContact(grupoId, { nome, telefone, email, empresa });
      toast.success("Contato adicionado ao grupo");
      fechar(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível adicionar o contato.");
    } finally {
      setSalvando(false);
    }
  };

  const enter = (e: React.KeyboardEvent) => e.key === "Enter" && void adicionar();

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar contato</DialogTitle>
          <DialogDescription>Cadastro manual: o contato fica só neste app, nada é criado no HubSpot.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-nome">Nome</Label>
            <Input id="m-nome" autoFocus placeholder="Ex.: Maria Silva" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={enter} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-tel">Celular (WhatsApp)</Label>
            <Input id="m-tel" inputMode="tel" placeholder="(21) 98891-0018" value={telefone} onChange={(e) => setTelefone(e.target.value)} onKeyDown={enter} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-email">E-mail <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="m-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={enter} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-emp">Empresa <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="m-emp" value={empresa} onChange={(e) => setEmpresa(e.target.value)} onKeyDown={enter} />
            </div>
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => fechar(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void adicionar()} disabled={salvando}>{salvando && <Loader2 className="animate-spin" />}Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
