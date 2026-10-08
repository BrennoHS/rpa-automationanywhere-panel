import { RefreshCw } from "lucide-react";
import { T } from "../../constants/theme";

interface RefreshButtonProps {
  onClick: () => void;
  refreshing: boolean;
}

/** Botão de atualizar unico, usado igual em toda tela que tem dado "ao vivo" (Dashboard, ServiceNow) - existe pra nunca divergir em tamanho/estilo entre as telas de novo. */
export function RefreshButton({ onClick, refreshing }: RefreshButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={refreshing}
      title={refreshing ? "Atualizando..." : "Atualizar"}
      style={{
        width: 30,
        height: 30,
        display: "grid",
        placeItems: "center",
        borderRadius: 9,
        cursor: refreshing ? "default" : "pointer",
        color: T.sub,
        background: T.surface,
        border: `1px solid ${T.border}`,
        opacity: refreshing ? 0.6 : 1,
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { if (refreshing) return; e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.accent; e.currentTarget.style.borderColor = T.borderHi; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.sub; e.currentTarget.style.borderColor = T.border; }}
    >
      <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />
    </button>
  );
}
