import type { CSSProperties } from "react";

/** Tokens de design — grafite profundo + telemetria ciano (dark ops console). */
export const T = {
  bg0: "#090d15",
  bg1: "#0c1120",
  surface: "rgba(255,255,255,0.035)",
  surfaceHi: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.09)",
  borderHi: "rgba(255,255,255,0.16)",
  text: "#e7ecf5",
  sub: "#9aa7be",
  muted: "#5f6b82",
  accent: "#22d3ee",
  accent2: "#818cf8",
} as const;

// SEM backdrop-filter de proposito: os cards ficam sobre um fundo liso (gradiente
// suave), onde desfocar o que esta atras nao muda nada visualmente - mas cada
// card com desfoque, principalmente um dentro do outro (card dentro do painel
// lateral do robo, que fica dentro do fundo escuro do modal), forca o navegador
// a recalcular o blur a cada movimento do mouse num grafico. Em maquina sem
// aceleracao de video (VM/area de trabalho remota) isso deixa a tela travando.
export const glass: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 16,
};

export const mono =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/** estilo padrao dos tooltips do recharts sobre fundo escuro */
export const chartTip = {
  contentStyle: {
    background: "#0e1526",
    border: `1px solid ${T.borderHi}`,
    borderRadius: 10,
    fontSize: 12,
  },
  labelStyle: { color: T.sub },
  itemStyle: { color: T.text },
} as const;
