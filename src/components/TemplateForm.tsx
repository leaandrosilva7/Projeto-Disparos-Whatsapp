import { useRef, useState } from "react";
import { Bold, Code, Italic, List, ListOrdered, Loader2, Plus, Quote, Save, SquareCode, Strikethrough } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WhatsAppPreview } from "@/components/WhatsAppPreview";
import { SAMPLE_CONTACT, TEMPLATE_MAX_LENGTH, TEMPLATE_VARIABLES, validateTemplateContent } from "@/lib/template";
import { toggleInline, toggleLines, type EditResult, type InlineFormat, type LineFormat } from "@/lib/whatsapp-format";
import { cn } from "@/lib/utils";
import { renderTemplate, type Template } from "@/services/mock-data";
import { isOpen, templatesRepo } from "@/services/repository";
import { useStore } from "@/services/store";

/** Criação/edição de template em uma única tela (nome + mensagem + prévia). Se `template` for informado, edita o existente. */
export function TemplateForm({ template, onDone }: { template?: Template | undefined; onDone: () => void }) {
  const { templates, campaigns } = useStore();
  const [nome, setNome] = useState(template?.nome ?? "");
  const [conteudo, setConteudo] = useState(template?.conteudo ?? "");
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const emUso = template ? campaigns.filter((c) => c.templateId === template.id && isOpen(c.status)).length : 0;
  const duplicado = templates.some((t) => t.id !== template?.id && t.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  const erros = {
    nome: !nome.trim() ? "Informe o nome do template." : duplicado ? "Já existe um template com esse nome." : null,
    conteudo: validateTemplateContent(conteudo),
  };
  const previa = conteudo.trim() ? renderTemplate(conteudo.trim(), SAMPLE_CONTACT) : null;

  /** Insere a variável na posição do cursor (ou no fim do texto). */
  const inserir = (chave: string) => {
    const el = areaRef.current;
    const token = `{{${chave}}}`;
    const ini = el?.selectionStart ?? conteudo.length;
    const fim = el?.selectionEnd ?? conteudo.length;
    setConteudo(conteudo.slice(0, ini) + token + conteudo.slice(fim));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + token.length, ini + token.length);
    });
  };

  /** Aplica a edição no texto e restaura a seleção, mantendo o foco no campo. */
  const aplicar = (r: EditResult) => {
    setConteudo(r.text);
    requestAnimationFrame(() => {
      areaRef.current?.focus();
      areaRef.current?.setSelectionRange(r.start, r.end);
    });
  };
  const formatar = (f: InlineFormat) => aplicar(toggleInline(conteudo, areaRef.current?.selectionStart ?? conteudo.length, areaRef.current?.selectionEnd ?? conteudo.length, f));
  const formatarLinhas = (f: LineFormat) => aplicar(toggleLines(conteudo, areaRef.current?.selectionStart ?? conteudo.length, areaRef.current?.selectionEnd ?? conteudo.length, f));

  /** Atalhos: Ctrl/⌘+B negrito, +I itálico, +Shift+X tachado, +E monoespaçado. */
  const atalho = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const f: InlineFormat | null = k === "b" ? "bold" : k === "i" ? "italic" : k === "x" && e.shiftKey ? "strike" : k === "e" ? "mono" : null;
    if (!f) return;
    e.preventDefault();
    formatar(f);
  };

  const salvar = async () => {
    if (erros.nome || erros.conteudo) return setTentou(true);
    setSalvando(true);
    try {
      await templatesRepo.save({ nome, conteudo }, template?.id);
      toast.success(template ? "Template atualizado" : "Template criado");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o template.");
    } finally {
      setSalvando(false);
    }
  };

  const err = (msg: string | null) => (tentou && msg ? <p className="mt-1.5 text-xs text-destructive">{msg}</p> : null);

  return (
    <>
      <div className="grid gap-5 py-2 sm:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-nome">Nome</Label>
            <Input id="t-nome" autoFocus placeholder="Ex.: Boas-vindas" value={nome} onChange={(e) => setNome(e.target.value)} aria-invalid={tentou && !!erros.nome} />
            {err(erros.nome)}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="t-msg">Mensagem</Label>
              {TEMPLATE_VARIABLES.map((v) => (
                <Button key={v.chave} type="button" size="sm" variant="outline" title={v.descricao} onClick={() => inserir(v.chave)}>
                  <Plus /> {`{{${v.chave}}}`}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1" role="toolbar" aria-label="Formatação do WhatsApp">
              {([
                [Bold, "Negrito (Ctrl+B)", () => formatar("bold")],
                [Italic, "Itálico (Ctrl+I)", () => formatar("italic")],
                [Strikethrough, "Tachado (Ctrl+Shift+X)", () => formatar("strike")],
                [SquareCode, "Monoespaçado (Ctrl+E)", () => formatar("mono")],
                [Code, "Código em linha", () => formatar("code")],
                [List, "Lista com marcadores", () => formatarLinhas("bullet")],
                [ListOrdered, "Lista numerada", () => formatarLinhas("numbered")],
                [Quote, "Citação", () => formatarLinhas("quote")],
              ] as const).map(([Icon, titulo, fn]) => (
                <Button key={titulo} type="button" size="icon" variant="ghost" className="size-8" title={titulo} aria-label={titulo} onMouseDown={(e) => e.preventDefault()} onClick={fn}>
                  <Icon />
                </Button>
              ))}
            </div>
            <Textarea
              id="t-msg"
              onKeyDown={atalho}
              ref={areaRef}
              rows={7}
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              aria-invalid={tentou && !!erros.conteudo}
            />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">{err(erros.conteudo)}</div>
              <span className={cn("shrink-0 text-xs tabular-nums", conteudo.length > TEMPLATE_MAX_LENGTH ? "text-destructive" : "text-muted-foreground")}>
                {conteudo.length}/{TEMPLATE_MAX_LENGTH}
              </span>
            </div>
          </div>

          {emUso > 0 && (
            <Alert>
              <AlertDescription>Este template é usado em {emUso} campanha(s) em aberto. Ao salvar, a nova mensagem vale também para elas.</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="min-w-0">
          <p className="mb-1.5 text-sm font-medium">Prévia</p>
          <WhatsAppPreview mensagem={previa} vazio="" />
          <p className="mt-2 text-xs text-muted-foreground">Exemplo para: {SAMPLE_CONTACT.nome}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onDone} disabled={salvando}>Cancelar</Button>
        <Button onClick={() => void salvar()} disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin" /> : template ? <Save /> : <Plus />}
          {template ? "Salvar alterações" : "Criar template"}
        </Button>
      </div>
    </>
  );
}
