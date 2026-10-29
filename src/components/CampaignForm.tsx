import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, Loader2, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhatsAppPreview } from "@/components/WhatsAppPreview";
import { formatDateTime, todayLocal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { renderTemplate, type Campaign, type Contact } from "@/services/mock-data";
import { campaignsRepo, countUniqueContacts, validateSchedule, type CampaignInput } from "@/services/repository";
import { useStore } from "@/services/store";
import { useContacts } from "@/services/use-contacts";

const SAMPLE: Pick<Contact, "nome"> = { nome: "Maria Silva" };

const STEPS = [
  { titulo: "Nome", ajuda: "Dê um nome para identificar esta campanha." },
  { titulo: "Público", ajuda: "Escolha os grupos que vão receber a mensagem." },
  { titulo: "Mensagem", ajuda: "Escolha o template e confira como a mensagem vai aparecer." },
  { titulo: "Envio", ajuda: "Escolha se você vai iniciar o envio manualmente ou agendar uma data e horário." },
  { titulo: "Revisão", ajuda: "Confira tudo antes de finalizar. Use Editar para corrigir qualquer etapa." },
] as const;
const REVISAO = STEPS.length - 1;

/** Criação/edição de campanha em etapas, uma por vez. Se `campaign` for informada, edita a existente. */
export function CampaignForm({ campaign, onDone }: { campaign?: Campaign | undefined; onDone: () => void }) {
  const { groups, templates } = useStore();
  const { contacts } = useContacts();
  const [step, setStep] = useState(0);
  const [nome, setNome] = useState(campaign?.nome ?? "");
  const [grupoIds, setGrupoIds] = useState<string[]>(campaign?.grupoIds.filter((id) => groups.some((g) => g.id === id)) ?? []);
  const [templateId, setTemplateId] = useState(campaign?.templateId ?? "");
  const [modo, setModo] = useState<"manual" | "agendar">(campaign?.status === "Agendada" ? "agendar" : "manual");
  const [data, setData] = useState(campaign?.agendadaPara?.split("T")[0] ?? "");
  const [hora, setHora] = useState(campaign?.agendadaPara?.split("T")[1] ?? "");
  const [busca, setBusca] = useState("");
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState<"rascunho" | "confirmar" | null>(null);

  const template = templates.find((t) => t.id === templateId);
  const total = countUniqueContacts(groups, grupoIds);
  const selecionados = groups.filter((g) => grupoIds.includes(g.id));
  const exemplo = useMemo(() => {
    const ids = new Set(selecionados.flatMap((g) => g.contatoIds));
    return contacts.find((c) => ids.has(c.id)) ?? SAMPLE;
  }, [contacts, selecionados]);
  const listados = groups.filter((g) => g.nome.toLowerCase().includes(busca.toLowerCase()));

  const erros = {
    nome: nome.trim() ? null : "Informe o nome da campanha.",
    grupos: !grupoIds.length ? "Selecione ao menos um grupo." : total === 0 ? "Os grupos selecionados não têm contatos." : null,
    template: template ? null : "Escolha um template de mensagem.",
    agenda: modo === "agendar" ? validateSchedule(data, hora) : null,
  };
  /** Erro de cada etapa de preenchimento (a Revisão não tem campos próprios). */
  const erroDaEtapa = [erros.nome, erros.grupos, erros.template, erros.agenda];
  const ocupado = salvando !== null;
  const envioTexto = modo === "manual" ? "Sem agendamento (início manual)" : data && hora ? formatDateTime(`${data}T${hora}`) : "A definir";

  const ir = (i: number) => {
    setTentou(false);
    setStep(i);
  };
  const avancar = () => {
    if (erroDaEtapa[step]) return setTentou(true);
    ir(step + 1);
  };

  const salvar = async (m: CampaignInput["modo"]) => {
    setSalvando(m === "rascunho" ? "rascunho" : "confirmar");
    try {
      await campaignsRepo.save({ nome, grupoIds, templateId, modo: m, agendadaPara: m === "agendar" ? `${data}T${hora}` : null }, campaign?.id);
      toast.success(m === "manual" ? "Campanha criada. Inicie quando quiser pela lista." : m === "agendar" ? "Campanha agendada" : "Rascunho salvo");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a campanha.");
    } finally {
      setSalvando(null);
    }
  };

  const rascunho = () => {
    if (erros.nome) {
      setStep(0);
      return setTentou(true);
    }
    void salvar("rascunho");
  };
  const finalizar = () => {
    const invalida = erroDaEtapa.findIndex(Boolean);
    if (invalida >= 0) {
      setStep(invalida);
      return setTentou(true);
    }
    void salvar(modo);
  };

  const Err = ({ msg }: { msg: string | null }) => (tentou && msg ? <p className="mt-1.5 text-xs text-destructive">{msg}</p> : null);

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold">{STEPS[step]!.titulo}</h3>
          <span className="text-xs text-muted-foreground">Etapa {step + 1} de {STEPS.length}</span>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} aria-label={`Etapa ${step + 1} de ${STEPS.length}`} />
        <ol className="hidden justify-between text-xs sm:flex">
          {STEPS.map((s, i) => (
            <li key={s.titulo} className={cn(i === step ? "font-semibold text-primary" : i < step ? "text-foreground" : "text-muted-foreground")}>
              {i + 1}. {s.titulo}
            </li>
          ))}
        </ol>
        <p className="pt-1 text-sm text-muted-foreground">{STEPS[step]!.ajuda}</p>
      </div>

      <div className="min-h-64 space-y-4 py-2">
        {step === 0 && (
          <div>
            <Label htmlFor="c-nome" className="sr-only">Nome da campanha</Label>
            <Input
              id="c-nome"
              autoFocus
              placeholder="Ex.: Promoção de Novembro"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && avancar()}
              aria-invalid={tentou && !!erros.nome}
            />
            <Err msg={erros.nome} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            {groups.length > 4 && (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar grupo..." value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            )}
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {listados.map((g) => {
                const vazio = g.contatoIds.length === 0;
                return (
                  <label key={g.id} className={`flex items-center justify-between gap-3 rounded-md border p-3 ${vazio ? "opacity-60" : "cursor-pointer hover:bg-muted"}`}>
                    <span className="flex min-w-0 items-center gap-3">
                      <Checkbox
                        disabled={vazio}
                        checked={grupoIds.includes(g.id)}
                        onCheckedChange={(v) => setGrupoIds(v ? [...grupoIds, g.id] : grupoIds.filter((x) => x !== g.id))}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{g.nome}</span>
                        {g.descricao && <span className="block truncate text-xs text-muted-foreground">{g.descricao}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{vazio ? "Sem contatos" : `${g.contatoIds.length} contatos`}</span>
                  </label>
                );
              })}
              {!listados.length && <p className="py-4 text-center text-sm text-muted-foreground">{groups.length ? "Nenhum grupo encontrado." : "Crie um grupo em Grupos de Contatos primeiro."}</p>}
            </div>
            {grupoIds.length > 0 && <p className="text-sm font-medium">{total} contato(s) único(s) selecionado(s)</p>}
            {grupoIds.length > 1 && <p className="text-xs text-muted-foreground">Contatos presentes em mais de um grupo recebem a mensagem uma única vez.</p>}
            <Err msg={erros.grupos} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Selecione um template" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                {!templates.length && <p className="px-2 py-3 text-center text-sm text-muted-foreground">Crie um template em Templates primeiro.</p>}
              </SelectContent>
            </Select>
            <Err msg={erros.template} />
            {template && <p className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs [overflow-wrap:anywhere]">{template.conteudo}</p>}
            <p className="text-xs text-muted-foreground">Variável disponível: {"{{nome}}"} (primeiro nome do contato)</p>
            <div className="mx-auto max-w-sm">
              <WhatsAppPreview mensagem={template ? renderTemplate(template.conteudo, exemplo) : null} />
              <p className="mt-2 text-xs text-muted-foreground">Exemplo para: {exemplo.nome || "contato sem nome"}</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <RadioGroup value={modo} onValueChange={(v) => setModo(v as "manual" | "agendar")} className="grid gap-2 sm:grid-cols-2">
              {([
                ["manual", "Sem agendamento", "Fica na lista e só começa quando você clicar em Iniciar"],
                ["agendar", "Agendar data e horário", "Começa sozinha na data e hora escolhidas"],
              ] as const).map(([v, label, ajuda]) => (
                <label key={v} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${modo === v ? "border-primary bg-accent" : "hover:bg-muted"}`}>
                  <RadioGroupItem value={v} className="mt-0.5" />
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{ajuda}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {modo === "agendar" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="data">Data</Label>
                  <Input id="data" type="date" min={todayLocal()} value={data} onChange={(e) => setData(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hora">Horário</Label>
                  <Input id="hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                </div>
              </div>
            )}
            <Err msg={erros.agenda} />
          </div>
        )}

        {step === REVISAO && (
          <div className="space-y-4">
            <div className="divide-y rounded-md border text-sm">
              <Row label="Nome" value={nome.trim() || "—"} onEdit={() => ir(0)} />
              <Row label="Grupos" value={selecionados.map((g) => g.nome).join(", ") || "—"} onEdit={() => ir(1)} />
              <Row label="Contatos únicos" value={String(total)} onEdit={() => ir(1)} />
              <Row label="Template" value={template?.nome ?? "—"} onEdit={() => ir(2)} />
              <Row label="Envio" value={envioTexto} onEdit={() => ir(3)} />
            </div>
            <div className="mx-auto max-w-sm">
              <WhatsAppPreview mensagem={template ? renderTemplate(template.conteudo, exemplo) : null} />
              <p className="mt-2 text-xs text-muted-foreground">Exemplo para: {exemplo.nome || "contato sem nome"}</p>
            </div>
            <Alert>
              <AlertDescription>
                {modo === "manual"
                  ? `Ao finalizar, “${nome.trim()}” será adicionada à lista de campanhas. Nenhuma mensagem é enviada até você clicar em Iniciar.`
                  : `Ao finalizar, “${nome.trim()}” será agendada para ${total} contato(s) em ${envioTexto}.`}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {step > 0 && (
            <Button variant="ghost" onClick={() => ir(step - 1)} disabled={ocupado}><ArrowLeft /> Voltar</Button>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={rascunho} disabled={ocupado}>
            {salvando === "rascunho" && <Loader2 className="animate-spin" />}Salvar rascunho
          </Button>
          {step < REVISAO ? (
            <Button onClick={avancar} disabled={ocupado}>Avançar <ArrowRight /></Button>
          ) : (
            <Button onClick={finalizar} disabled={ocupado}>
              {salvando === "confirmar" ? <Loader2 className="animate-spin" /> : modo === "manual" ? <Plus /> : <CalendarClock />}
              {modo === "manual" ? "Criar campanha" : "Agendar campanha"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-right font-medium">{value}</span>
      <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onEdit} aria-label={`Editar ${label}`}><Pencil className="size-4" /></Button>
    </div>
  );
}
