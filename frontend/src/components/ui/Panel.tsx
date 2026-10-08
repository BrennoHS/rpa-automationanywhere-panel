import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "./Card";
import { T } from "../../constants/theme";

interface PanelProps {
  title: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  /** Quando definido, o Panel vira retrátil: clique no cabeçalho alterna `open`. */
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}

export function Panel({ title, sub, right, children, style, collapsible, open = true, onToggle }: PanelProps) {
  return (
    <Card style={{ padding: 18, ...style }}>
      <div
        className="flex items-start justify-between"
        style={{ marginBottom: collapsible && !open ? 0 : 14, cursor: collapsible ? "pointer" : undefined }}
        onClick={collapsible ? onToggle : undefined}
      >
        <div className="flex items-start gap-2">
          {collapsible && (open ? <ChevronDown size={16} style={{ marginTop: 2, color: T.muted }} /> : <ChevronRight size={16} style={{ marginTop: 2, color: T.muted }} />)}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{title}</h3>
            {sub && <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{sub}</p>}
          </div>
        </div>
        {right}
      </div>
      {(!collapsible || open) && children}
    </Card>
  );
}
