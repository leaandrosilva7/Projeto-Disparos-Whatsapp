import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/services/api";

export const Route = createFileRoute("/_painel/usuarios")({
  // A tela é só para ADMIN; o servidor também recusa qualquer chamada de OPERADOR.
  beforeLoad: ({ context }) => {
    if (context.user.role !== "ADMIN") throw redirect({ to: "/dashboard" });
  },
  component: Usuarios,
});

type Usuario = { id: string; nome: string; email: string; role: string; ativo: boolean; ultimoLoginEm: string | null; conta: { id: string; nome: string } };
type Setor = { id: string; nome: string; ativo: boolean; whatsappNumero: string | null; totalUsuarios: number; temAdmin: boolean };

const msg = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");

function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [userForm, setUserForm] = useState<Partial<Usuario> | null>(null);
  const [setorForm, setSetorForm] = useState<Partial<Setor> | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [u, s] = await Promise.all([
        apiFetch<{ usuarios: Usuario[] }>("/api/admin/usuarios"),
        apiFetch<{ setores: Setor[] }>("/api/admin/setores"),
      ]);
      setUsuarios(u.usuarios);
      setSetores(s.setores);
    } catch (e) {
      toast.error(msg(e));
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);

  const patchUsuario = async (id: string, body: object, ok: string) => {
    try {
      await apiFetch(`/api/admin/usuarios/${id}`, { method: "PATCH", body });
      toast.success(ok);
      await carregar();
    } catch (e) {
      toast.error(msg(e));
    }
  };
  const patchSetor = async (id: string, body: object, ok: string) => {
    try {
      await apiFetch(`/api/admin/setores/${id}`, { method: "PATCH", body });
      toast.success(ok);
      await carregar();
    } catch (e) {
      toast.error(msg(e));
    }
  };

  return (
    <>
      <PageHeader title="Usuários e setores" subtitle="Gerencie as contas de operadores e os setores (somente administradores)." />
      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="setores">Setores</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => setUserForm({})}>Novo operador</Button></div>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nome</TableHead><TableHead>E-mail</TableHead><TableHead>Setor</TableHead><TableHead>Papel</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.nome}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.conta.nome}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell><Badge variant={u.ativo ? "default" : "secondary"}>{u.ativo ? "Ativo" : "Desativado"}</Badge></TableCell>
                  <TableCell className="space-x-2 text-right">
                    {u.role === "OPERADOR" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setUserForm(u)}>Editar</Button>
                        <Button size="sm" variant="outline" onClick={() => void patchUsuario(u.id, { ativo: !u.ativo }, u.ativo ? "Usuário desativado." : "Usuário reativado.")}>
                          {u.ativo ? "Desativar" : "Reativar"}
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="setores" className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => setSetorForm({})}>Novo setor</Button></div>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Setor</TableHead><TableHead>Usuários</TableHead><TableHead>WhatsApp</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {setores.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.nome}</TableCell>
                  <TableCell>{s.totalUsuarios}</TableCell>
                  <TableCell>{s.whatsappNumero ?? "—"}</TableCell>
                  <TableCell><Badge variant={s.ativo ? "default" : "secondary"}>{s.ativo ? "Ativo" : "Desativado"}</Badge></TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setSetorForm(s)}>Editar</Button>
                    {!s.temAdmin && (
                      <Button size="sm" variant="outline" onClick={() => void patchSetor(s.id, { ativo: !s.ativo }, s.ativo ? "Setor desativado." : "Setor reativado.")}>
                        {s.ativo ? "Desativar" : "Reativar"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <UsuarioDialog value={userForm} setores={setores.filter((s) => s.ativo)} onClose={() => setUserForm(null)} onSaved={carregar} />
      <SetorDialog value={setorForm} onClose={() => setSetorForm(null)} onSaved={carregar} />
    </>
  );
}

function UsuarioDialog({ value, setores, onClose, onSaved }: { value: Partial<Usuario> | null; setores: Setor[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ nome: "", email: "", senha: "", setorId: "" });
  const editando = !!value?.id;
  useEffect(() => {
    if (value) setF({ nome: value.nome ?? "", email: value.email ?? "", senha: "", setorId: value.conta?.id ?? "" });
  }, [value]);

  const salvar = async () => {
    try {
      if (editando) {
        await apiFetch(`/api/admin/usuarios/${value!.id}`, { method: "PATCH", body: { nome: f.nome, email: f.email, setorId: f.setorId, ...(f.senha ? { senha: f.senha } : {}) } });
      } else {
        await apiFetch("/api/admin/usuarios", { method: "POST", body: f });
      }
      toast.success(editando ? "Usuário atualizado." : "Operador criado.");
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(msg(e));
    }
  };

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editando ? "Editar operador" : "Novo operador"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="u-nome">Nome</Label><Input id="u-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
          <div><Label htmlFor="u-email">E-mail</Label><Input id="u-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div>
            <Label>Setor</Label>
            <Select value={f.setorId} onValueChange={(v) => setF({ ...f, setorId: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
              <SelectContent>{setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="u-senha">{editando ? "Nova senha (deixe em branco para manter)" : "Senha"}</Label>
            <Input id="u-senha" type="password" autoComplete="new-password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} />
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void salvar()}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SetorDialog({ value, onClose, onSaved }: { value: Partial<Setor> | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const editando = !!value?.id;
  useEffect(() => {
    if (value) {
      setNome(value.nome ?? "");
      setNumero(value.whatsappNumero ?? "");
    }
  }, [value]);

  const salvar = async () => {
    try {
      if (editando) {
        await apiFetch(`/api/admin/setores/${value!.id}`, { method: "PATCH", body: { nome, whatsappNumero: numero.trim() ? numero : null } });
      } else {
        await apiFetch("/api/admin/setores", { method: "POST", body: { nome } });
      }
      toast.success(editando ? "Setor atualizado." : "Setor criado.");
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(msg(e));
    }
  };

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editando ? "Editar setor" : "Novo setor"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="s-nome">Nome</Label><Input id="s-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          {editando && (
            <div><Label htmlFor="s-num">Número do WhatsApp</Label><Input id="s-num" placeholder="(11) 91234-5678" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void salvar()}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
