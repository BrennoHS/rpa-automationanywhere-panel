// Import so tipo (sem custo no bundle) - exceljs (23MB, a dependencia mais
// pesada do projeto) so e carregada de verdade dentro de exportServiceNowReport(),
// no momento do clique em "Exportar relatório" - ninguem baixa essa lib so
// por abrir a tela do ServiceNow.
import type ExcelJS from "exceljs";
import type { Worksheet } from "exceljs";
import type { CategoryCount, Melhoria, OverflowTicket, ReviewItem, TicketDetail, TicketsTrend } from "../services/serviceNowService";
import { computeProactiveStats } from "./proactiveTickets";

/**
 * Entrada desacoplada de TicketsSummary/MonthSummary - a tela monta esse
 * objeto igual pra mês corrente (a partir de TicketsSummary) ou mês passado
 * (a partir de MonthSummary), então o exportador não precisa saber qual dos
 * dois foi usado. "secondaryStat" existe porque o rótulo/valor do segundo
 * indicador muda de significado (mês corrente = "Chamados em atendimento",
 * mês passado = "Ainda em aberto") - ver ServiceNow.tsx.
 */
export interface ExportSummaryInput {
  ticketsThisMonth: number;
  secondaryStat: { label: string; value: number };
  overflow: { count: number; tickets: OverflowTicket[]; pastMonth?: boolean } | null;
  byAutomation: CategoryCount[];
  byProduct: CategoryCount[];
  byOrigin: CategoryCount[];
  byPriority: CategoryCount[];
  needsReview: ReviewItem[];
  tickets: TicketDetail[];
}

const ACCENT = "FF0E7490"; // cyan-700, mesma familia do T.accent do painel
const ZEBRA_FILL = "FFF1F5F9"; // slate-100
const RESOLVED_COLOR = "FF15803D"; // green-700
const OPEN_COLOR = "FFB45309"; // amber-700
const LINK_COLOR = "FF1D4ED8"; // blue-700

function headerCell(cell: ExcelJS.Cell, text: string): void {
  cell.value = text;
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
  cell.alignment = { vertical: "middle" };
}

/** Titulo de secao dentro da aba "Resumo" - texto grande na cor de destaque, sem fundo (não é cabecalho de tabela, é um separador de bloco). */
function sectionTitle(ws: Worksheet, row: number, text: string): void {
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true, size: 12.5, color: { argb: ACCENT } };
  ws.getRow(row).height = 20;
}

/** Tabela de 2 colunas (rotulo/contagem) usada pelas 4 quebras (automação, produto, origem, prioridade) - mesmo estilo repetido em cada uma. */
function writeCategoryTable(ws: Worksheet, startRow: number, title: string, items: CategoryCount[]): number {
  sectionTitle(ws, startRow, title);
  let row = startRow + 1;
  headerCell(ws.getCell(row, 1), "Rótulo");
  headerCell(ws.getCell(row, 2), "Chamados");
  row++;
  if (items.length === 0) {
    ws.getCell(row, 1).value = "Nenhum chamado identificado esse mês.";
    ws.getCell(row, 1).font = { italic: true, color: { argb: "FF64748B" }, size: 10.5 };
    row++;
  }
  items.forEach((i, idx) => {
    const r = ws.getRow(row);
    r.getCell(1).value = i.label;
    r.getCell(2).value = i.count;
    if (idx % 2 === 1) r.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } }));
    row++;
  });
  return row + 1; // linha em branco antes do proximo bloco
}

/** Escreve a aba "Resumo": KPIs do mes + as 4 quebras (automação/produto/origem/prioridade) - o mesmo conjunto de números que aparece nos cards e nos graficos de barra da tela. */
function buildResumoSheet(
  wb: ExcelJS.Workbook,
  summary: ExportSummaryInput,
  monthLabel: string,
  slaLabel: string,
  mttrLabel: string,
  generatedAt: Date
): void {
  const ws = wb.addWorksheet("Resumo", { properties: { tabColor: { argb: ACCENT } } });
  ws.columns = [{ width: 42 }, { width: 14 }];

  ws.getCell(1, 1).value = "Relatório ServiceNow — Sustentação RPA";
  ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: ACCENT } };
  ws.getCell(2, 1).value = `Gerado em ${generatedAt.toLocaleDateString("pt-BR")} ${generatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — chamados de ${monthLabel}`;
  ws.getCell(2, 1).font = { italic: true, size: 10.5, color: { argb: "FF64748B" } };

  let row = 4;
  sectionTitle(ws, row, "Indicadores");
  row++;
  headerCell(ws.getCell(row, 1), "Indicador");
  headerCell(ws.getCell(row, 2), "Valor");
  row++;
  const kpis: [string, string | number][] = [
    ["Chamados no mês", summary.ticketsThisMonth],
    [summary.secondaryStat.label, summary.secondaryStat.value],
    ...(summary.overflow
      ? ([
          [
            summary.overflow.pastMonth ? "Transbordo em aberto no fim do mês (meses anteriores)" : "Chamados em transbordo (meses anteriores)",
            summary.overflow.count,
          ],
          [
            summary.overflow.pastMonth ? "Transbordo resolvido no mês" : "Transbordo resolvido este mês",
            summary.overflow.tickets.filter((t) => t.resolved).length,
          ],
        ] as [string, string | number][])
      : []),
    ["SLA cumprido", slaLabel],
    ["MTTR", mttrLabel],
  ];
  kpis.forEach(([label, value], idx) => {
    const r = ws.getRow(row);
    r.getCell(1).value = label;
    r.getCell(2).value = value;
    r.getCell(2).font = { bold: true };
    if (idx % 2 === 1) r.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } }));
    row++;
  });
  row++;

  row = writeCategoryTable(ws, row, "Chamados por automação", summary.byAutomation);
  row = writeCategoryTable(ws, row, "Chamados por produto", summary.byProduct);
  row = writeCategoryTable(ws, row, "Distribuição por origem", summary.byOrigin);
  row = writeCategoryTable(ws, row, "Chamados por prioridade", summary.byPriority);

  const proactive = computeProactiveStats(summary.tickets);
  writeCategoryTable(ws, row, "Chamados proativos × reativos", [
    { label: `Proativo (automação) — ${proactive.proactivePct}%`, count: proactive.proactive },
    { label: `Reativo — ${proactive.reactivePct}%`, count: proactive.reactive },
  ]);
}

/** Aba "Tendência 6 meses" - mesmo total por mes que alimenta o grafico de area da tela. */
function buildTrendSheet(wb: ExcelJS.Workbook, trend: TicketsTrend): void {
  const ws = wb.addWorksheet("Tendência 6 meses", { properties: { tabColor: { argb: ACCENT } } });
  ws.columns = [
    { header: "Mês", key: "label", width: 14 },
    { header: "Chamados", key: "total", width: 14 },
  ];
  ws.getRow(1).eachCell((c) => headerCell(c, String(c.value)));
  trend.months.forEach((m, idx) => {
    const r = ws.addRow({ label: m.label, total: m.total });
    if (idx % 2 === 1) r.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } }));
  });
}

type SheetColumn<T> = { header: string; key: keyof T; width: number };

/** Monta uma aba de lista genérica (chamados do mês, para revisar, transbordo, melhorias) - todas seguem o mesmo padrão: cabeçalho colorido, zebra, link clicável no número, status colorido quando existir. */
function buildListSheet<T extends { number: string; url: string }>(
  wb: ExcelJS.Workbook,
  name: string,
  columns: SheetColumn<T>[],
  rows: T[],
  opts?: { statusKey?: keyof T; resolvedValue?: unknown }
): void {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: ACCENT } } });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => headerCell(cell, String(cell.value)));
  headerRow.height = 22;

  rows.forEach((item, idx) => {
    const row = ws.addRow(item as unknown as Record<string, unknown>);
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.font = { size: 10.5 };
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
    });

    if (opts?.statusKey) {
      const statusCell = row.getCell(opts.statusKey as string);
      const isResolved = item[opts.statusKey] === opts.resolvedValue;
      statusCell.font = { bold: true, size: 10.5, color: { argb: isResolved ? RESOLVED_COLOR : OPEN_COLOR } };
    }

    if (item.url) {
      const numberCell = row.getCell("number");
      numberCell.value = { text: item.number, hyperlink: item.url };
      numberCell.font = { size: 10.5, color: { argb: LINK_COLOR }, underline: true };
    }
  });

  const lastCol = ws.getColumn(columns.length).letter;
  ws.autoFilter = { from: "A1", to: `${lastCol}1` };
}

/**
 * Gera um .xlsx com uma "foto" de TODA a tela de ServiceNow no momento do
 * clique (não só a lista de chamados) - uma aba por seção, mesmos dados que
 * já estão carregados na tela (sem chamada nova ao ServiceNow). Dispara o
 * download no navegador.
 */
export async function exportServiceNowReport(params: {
  summary: ExportSummaryInput;
  monthLabel: string;
  trend: TicketsTrend;
  melhorias: Melhoria[];
  slaLabel: string;
  mttrLabel: string;
}): Promise<void> {
  const { summary, monthLabel, trend, melhorias, slaLabel, mttrLabel } = params;
  const generatedAt = new Date();

  const { default: ExcelJSRuntime } = await import("exceljs");
  const wb = new ExcelJSRuntime.Workbook();
  wb.creator = "Painel Sustentação RPA";
  wb.created = generatedAt;

  buildResumoSheet(wb, summary, monthLabel, slaLabel, mttrLabel, generatedAt);
  buildTrendSheet(wb, trend);

  type TicketRow = TicketDetail & { status: string };
  buildListSheet<TicketRow>(
    wb,
    "Chamados do mês",
    [
      { header: "Número", key: "number", width: 15 },
      { header: "Status", key: "status", width: 13 },
      { header: "Tipo", key: "label", width: 34 },
      { header: "Sintoma", key: "sintoma", width: 26 },
      { header: "Subcategoria", key: "subcategoria", width: 22 },
      { header: "Origem", key: "origin", width: 14 },
      { header: "Prioridade", key: "priority", width: 15 },
      { header: "Aberto por", key: "requester", width: 26 },
      { header: "Atendendo", key: "assignedTo", width: 26 },
      { header: "Aberto em", key: "openedAt", width: 19 },
      { header: "Descrição", key: "description", width: 55 },
      { header: "Nota de resolução", key: "resolutionNote", width: 55 },
    ],
    summary.tickets.map((t) => ({ ...t, status: t.resolved ? "Resolvido" : "Em aberto" })),
    { statusKey: "status", resolvedValue: "Resolvido" }
  );

  buildListSheet<ReviewItem>(
    wb,
    "Para revisar",
    [
      { header: "Número", key: "number", width: 15 },
      { header: "Sintoma", key: "sintoma", width: 22 },
      { header: "Subcategoria", key: "subcategoria", width: 22 },
      { header: "Aberto por", key: "requester", width: 26 },
      { header: "Atendendo", key: "assignedTo", width: 26 },
      { header: "Descrição", key: "text", width: 60 },
    ],
    summary.needsReview
  );

  type OverflowRow = OverflowTicket & { status: string };
  buildListSheet<OverflowRow>(
    wb,
    "Transbordo",
    [
      { header: "Número", key: "number", width: 15 },
      { header: "Status", key: "status", width: 13 },
      { header: "Sintoma", key: "sintoma", width: 26 },
      { header: "Aberto por", key: "requester", width: 26 },
      { header: "Atendendo", key: "assignedTo", width: 26 },
      { header: "Aberto em", key: "openedAt", width: 19 },
      { header: "Fechado em", key: "closedAt", width: 19 },
      { header: "Descrição", key: "description", width: 60 },
    ],
    (summary.overflow?.tickets ?? [])
      .map((t) => ({ ...t, status: t.resolved ? "Resolvido" : "Em aberto" }))
      .sort((a, b) => Number(a.resolved) - Number(b.resolved)),
    { statusKey: "status", resolvedValue: "Resolvido" }
  );

  type MelhoriaRow = Melhoria & { status: string };
  buildListSheet<MelhoriaRow>(
    wb,
    "Melhorias",
    [
      { header: "Número", key: "number", width: 15 },
      { header: "Status", key: "status", width: 13 },
      { header: "Estado", key: "state", width: 20 },
      { header: "Sintoma", key: "symptom", width: 20 },
      { header: "Aberto por", key: "requester", width: 26 },
      { header: "Atendendo", key: "assignedTo", width: 26 },
      { header: "Aberto em", key: "openedAt", width: 19 },
      { header: "Fechado em", key: "closedAt", width: 19 },
      { header: "Descrição", key: "description", width: 60 },
    ],
    melhorias.map((m) => ({ ...m, status: m.resolved ? "Resolvido" : "Em aberto" })),
    { statusKey: "status", resolvedValue: "Resolvido" }
  );

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = generatedAt.toISOString().slice(0, 16).replace(":", "").replace("T", "_");
  const monthSlug = monthLabel.replace(/[^\w-]/g, "-");
  a.download = `relatorio-servicenow-${monthSlug}-${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
