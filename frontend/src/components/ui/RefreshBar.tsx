import type { ReactNode } from "react";
import { T } from "../../constants/theme";
import { relativeTimeLabel } from "../../utils/datetime";
import { RefreshButton } from "./RefreshButton";

interface RefreshBarProps {
  onRefresh: () => void;
  refreshing: boolean;
  /** Quando presente, mostra "Atualizado há X min" ao lado do botão. Omitir pra telas que só tem o botão (ex.: Dashboard). */
  lastUpdatedAt?: number | null;
  /** Conteúdo extra alinhado à esquerda da linha (ex.: botão de exportar no ServiceNow). Omitido, a linha fica só com o botão de atualizar (ex.: Dashboard) - layout idêntico ao de antes. */
  leftSlot?: ReactNode;
}

/**
 * Linha do botão de atualizar (+ "Atualizado há X min" opcional), usada
 * IGUAL em toda tela com dado "ao vivo". De proposito NAO fica dentro do
 * `flex flex-col gap-5` do conteudo da pagina - se ficasse, o espaco entre o
 * botao e os cards abaixo ficaria amarrado ao mesmo gap usado entre todas as
 * outras secoes da pagina (mexer num mexeria no outro). Aqui o espaco de
 * cima e de baixo sao margens proprias, simetricas, controladas so por esse
 * componente - existe uma vez so, entao as telas nunca mais divergem em
 * tamanho de botao ou espaçamento.
 */
export function RefreshBar({ onRefresh, refreshing, lastUpdatedAt, leftSlot }: RefreshBarProps) {
  return (
    <div
      className="flex items-center gap-2"
      style={{ marginTop: -12, marginBottom: 10, justifyContent: leftSlot ? "space-between" : "flex-end" }}
    >
      {leftSlot}
      <div className="flex items-center gap-2">
        {lastUpdatedAt != null && (
          <span style={{ fontSize: 11.5, color: T.muted }}>Atualizado {relativeTimeLabel(lastUpdatedAt)}</span>
        )}
        <RefreshButton onClick={onRefresh} refreshing={refreshing} />
      </div>
    </div>
  );
}
