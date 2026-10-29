import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCheck, Megaphone, Send } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { useStore } from "@/services/store";
import { formatDate } from "@/lib/format";
import { desempenho7Dias } from "@/services/mock-data";

export const Route = createFileRoute("/_painel/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Disparador WhatsApp" },
      { name: "description", content: "Resumo das campanhas e métricas de envio." },
      { property: "og:title", content: "Dashboard — Disparador WhatsApp" },
      { property: "og:description", content: "Resumo das campanhas e métricas de envio." },
    ],
  }),
  component: Dashboard,
});

const chartConfig = {
  enviados: { label: "Enviadas", color: "var(--chart-1)" },
  entregues: { label: "Entregues", color: "var(--chart-2)" },
  falhas: { label: "Falhas", color: "var(--destructive)" },
} satisfies ChartConfig;

function Dashboard() {
  const { campaigns } = useStore();
  const sum = (k: "enviados" | "entregues") => campaigns.reduce((a, c) => a + c[k], 0);
  const enviados = sum("enviados");
  const entregues = sum("entregues");
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const metrics = [
    { label: "Campanhas enviadas", value: campaigns.filter((c) => c.status === "Concluída").length, icon: Megaphone },
    { label: "Mensagens enviadas", value: fmt(enviados), icon: Send },
    { label: "Mensagens entregues", value: fmt(entregues), icon: CheckCheck },
    { label: "Falhas no envio", value: fmt(enviados - entregues), icon: AlertTriangle },
  ];
  const grupoNome = (gs: { nome: string }[]) => gs.map((g) => g.nome).join(", ") || "—";
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Visão geral das suas campanhas" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{m.label}</p>
                <p className="text-2xl font-semibold">{m.value}</p>
              </div>
              <div className="rounded-lg bg-accent p-2.5 text-primary"><m.icon className="h-5 w-5" /></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Desempenho dos últimos 7 dias</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <LineChart data={desempenho7Dias} margin={{ left: 0, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="dia" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line dataKey="enviados" stroke="var(--color-enviados)" strokeWidth={2} dot={false} />
              <Line dataKey="entregues" stroke="var(--color-entregues)" strokeWidth={2} dot={false} />
              <Line dataKey="falhas" stroke="var(--color-falhas)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Campanhas recentes</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nome</TableHead><TableHead>Grupo</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Enviadas</TableHead><TableHead>Status</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.slice(0, 5).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{grupoNome(c.grupos)}</TableCell>
                  <TableCell>{formatDate(c.criadaEm)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(c.enviados)}/{fmt(c.totalContatos)}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
