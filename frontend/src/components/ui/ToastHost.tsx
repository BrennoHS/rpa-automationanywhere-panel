import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { T } from "../../constants/theme";
import { dismissToast, subscribeToasts, type ToastItem, type ToastVariant } from "../../utils/toast";

const VARIANT_STYLE: Record<ToastVariant, { color: string; Icon: typeof CheckCircle2 }> = {
  success: { color: "#34d399", Icon: CheckCircle2 },
  error: { color: "#f87171", Icon: XCircle },
  info: { color: T.accent, Icon: Info },
};

/**
 * Host único dos toasts - montado uma vez no AppShell, fora do fluxo normal
 * das páginas (position fixed), pra qualquer lugar do app poder chamar
 * showToast(...) sem precisar de Provider/Context.
 */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2"
      style={{ position: "fixed", bottom: 20, right: 20, zIndex: 100, pointerEvents: "none" }}
    >
      <style>{"@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }"}</style>
      {items.map((t) => {
        const { color, Icon } = VARIANT_STYLE[t.variant];
        return (
          <div
            key={t.id}
            className="flex items-center gap-2.5"
            style={{
              pointerEvents: "auto",
              animation: "toast-in 0.18s ease-out",
              minWidth: 240,
              maxWidth: 360,
              padding: "11px 14px",
              borderRadius: 11,
              background: T.bg1,
              border: `1px solid ${T.borderHi}`,
              borderLeft: `3px solid ${color}`,
              boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
            }}
          >
            <Icon size={16} color={color} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: T.text, flex: 1, lineHeight: 1.4 }}>{t.message}</span>
            <button
              onClick={() => dismissToast(t.id)}
              style={{ color: T.muted, cursor: "pointer", background: "none", border: "none", flexShrink: 0, padding: 2 }}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
