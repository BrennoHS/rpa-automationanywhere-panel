import type { CSSProperties } from "react";
import { Card } from "./Card";
import { T } from "../../constants/theme";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}

/** Bloco cinza pulsante (Tailwind "animate-pulse") - peça básica de todo loading skeleton da tela. */
export function Skeleton({ width = "100%", height = 14, radius = 6, style }: SkeletonProps) {
  return (
    <div
      className="animate-pulse"
      style={{ width, height, borderRadius: radius, background: T.surfaceHi, ...style }}
    />
  );
}

/** Mesma silhueta do StatCard (rótulo + ícone + valor grande), pra não pular de tamanho quando o dado real chegar. */
export function StatCardSkeleton() {
  return (
    <Card style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="flex items-center justify-between">
        <Skeleton width={90} height={11} />
        <Skeleton width={34} height={34} radius={10} />
      </div>
      <Skeleton width={70} height={28} radius={6} />
    </Card>
  );
}

/** Retângulo do tamanho de um gráfico Recharts, mesma altura pra não saltar o layout. */
export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return <Skeleton height={height} radius={10} />;
}

/** Linha de lista genérica (ícone/barra opcional + texto) - usada em listas de robôs/chamados/alertas enquanto carrega. */
export function RowSkeleton({ height = 44 }: { height?: number }) {
  return <Skeleton height={height} radius={10} />;
}
