import { CheckCheck } from "lucide-react";
import { parseWhatsApp, type Node } from "@/lib/whatsapp-format";
import { cn } from "@/lib/utils";

function renderNodes(nodes: Node[]): React.ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text": return n.v;
      case "bold": return <strong key={i}>{renderNodes(n.c)}</strong>;
      case "italic": return <em key={i}>{renderNodes(n.c)}</em>;
      case "strike": return <s key={i}>{renderNodes(n.c)}</s>;
      case "code": return <code key={i} className="rounded bg-black/5 px-1 font-mono text-[0.9em]">{renderNodes(n.c)}</code>;
      case "mono": return <code key={i} className="font-mono">{n.v}</code>;
    }
  });
}

/** Mostra a mensagem com a formatação do WhatsApp aplicada (negrito, itálico, tachado, monoespaçado, citação e listas). */
function FormattedMessage({ texto }: { texto: string }) {
  return (
    <>
      {parseWhatsApp(texto).map((b, i) => {
        switch (b.kind) {
          case "mono": return <pre key={i} className="my-0.5 whitespace-pre-wrap font-mono text-[0.9em] [overflow-wrap:anywhere]">{b.text}</pre>;
          case "quote": return <div key={i} className="my-0.5 border-l-4 border-[#06CF9C] pl-2 text-[#3b4a54]">{renderNodes(b.nodes)}</div>;
          case "bullet": return <div key={i} className="flex gap-1.5 pl-2"><span>•</span><span className="min-w-0">{renderNodes(b.nodes)}</span></div>;
          case "numbered": return <div key={i} className="flex gap-1.5 pl-2"><span>{b.n}.</span><span className="min-w-0">{renderNodes(b.nodes)}</span></div>;
          default: return <div key={i} className="min-h-[1lh]">{renderNodes(b.nodes)}</div>;
        }
      })}
    </>
  );
}

/**
 * Prévia de mensagem imitando uma conversa do WhatsApp.
 * `compacto` esconde a barra superior e limita o texto a 6 linhas (usado nos cards de template).
 * Sem `mensagem`, mostra o texto `vazio`; se `vazio` for "", mostra a conversa vazia, sem balão.
 */
export function WhatsAppPreview({
  mensagem,
  vazio = "Selecione um template",
  compacto = false,
}: {
  mensagem: string | null;
  vazio?: string;
  compacto?: boolean;
}) {
  const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="overflow-hidden rounded-lg border shadow-sm">
      {/* Barra superior */}
      {!compacto && (
        <div className="flex items-center gap-3 bg-[#075E54] px-4 py-2.5 text-white">
          <div className="flex size-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
            DW
          </div>
          <div className="leading-tight">
            <p className="text-sm font-medium">Disparador WhatsApp</p>
            <p className="text-[11px] text-white/70">online</p>
          </div>
        </div>
      )}
      {/* Área da conversa */}
      <div
        className={compacto ? "p-3" : "p-4"}
        style={{
          backgroundColor: "#ECE5DD",
          backgroundImage:
            "radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      >
        {mensagem || vazio ? (
          /* min-w-0 + overflow-wrap:anywhere: palavras/links longos quebram dentro do balão em vez de vazar */
          <div className="ml-auto w-fit min-w-0 max-w-[85%] rounded-lg rounded-tr-none bg-[#DCF8C6] px-3 py-2 text-sm text-[#111B21] shadow-sm">
            {mensagem ? (
              <div className={cn("[overflow-wrap:anywhere]", compacto && "line-clamp-6")}><FormattedMessage texto={mensagem} /></div>
            ) : (
              <p className="text-[#667781]">{vazio}</p>
            )}
            <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[#667781]">
              {hora}
              <CheckCheck className="size-3.5 text-[#53BDEB]" />
            </span>
          </div>
        ) : (
          // Sem mensagem e sem texto de aviso: conversa vazia (nenhum balão).
          <div className="h-16" />
        )}
      </div>
    </div>
  );
}
