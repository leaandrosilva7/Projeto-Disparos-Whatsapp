import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services/integrations";
import { getCurrentUser } from "@/services/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entrar — Disparador WhatsApp" },
      { name: "description", content: "Acesse o Disparador WhatsApp e gerencie suas campanhas." },
      { property: "og:title", content: "Entrar — Disparador WhatsApp" },
      { property: "og:description", content: "Acesse o Disparador WhatsApp e gerencie suas campanhas." },
    ],
  }),
  beforeLoad: async () => {
    if (await getCurrentUser()) throw redirect({ to: "/dashboard" });
  },
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <AuthCard title="Entrar" subtitle="Acesse sua conta para continuar">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setEnviando(true);
          try {
            await authService.login(email, senha);
            await navigate({ to: "/dashboard" });
          } catch (err) {
            setErro(err instanceof Error ? err.message : "Não foi possível entrar.");
          } finally {
            setEnviando(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="senha">Senha</Label>
          <Input id="senha" type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <Button type="submit" className="w-full" disabled={enviando}>{enviando ? "Entrando..." : "Entrar"}</Button>
        <p className="text-center text-xs text-muted-foreground">Acesso restrito. Peça a criação da conta a um administrador.</p>
      </form>
    </AuthCard>
  );
}
