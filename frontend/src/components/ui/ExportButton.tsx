import { Download, Loader2 } from "lucide-react";
import { T } from "../../constants/theme";

interface ExportButtonProps {
  onClick: () => void;
  exporting: boolean;
  label?: string;
  /** Desabilita sem mostrar o estado "Exportando..." - ex.: enquanto os dados ainda nem carregaram, nada foi clicado de fato. */
  disabled?: boolean;
}

/** Botão de exportar (Excel/.xlsx) - mesma altura e linguagem visual do RefreshButton, só que com texto (não é ícone genérico o bastante sozinho pra dispensar rótulo). */
export function ExportButton({ onClick, exporting, label = "Exportar", disabled }: ExportButtonProps) {
  const isDisabled = exporting || disabled;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      title="Exportar para Excel"
      className="flex items-center gap-1.5"
      style={{
        height: 30,
        padding: "0 12px",
        borderRadius: 9,
        cursor: isDisabled ? "default" : "pointer",
        color: T.sub,
        background: T.surface,
        border: `1px solid ${T.border}`,
        opacity: isDisabled ? 0.6 : 1,
        fontSize: 12,
        fontWeight: 600,
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { if (isDisabled) return; e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.accent; e.currentTarget.style.borderColor = T.borderHi; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.sub; e.currentTarget.style.borderColor = T.border; }}
    >
      {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      {exporting ? "Exportando…" : label}
    </button>
  );
}
