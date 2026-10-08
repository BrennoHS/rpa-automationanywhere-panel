import type { CSSProperties, ReactNode, HTMLAttributes } from "react";
import { glass } from "../../constants/theme";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  style?: CSSProperties;
}

export function Card({ children, style, ...rest }: CardProps) {
  return (
    <div style={{ ...glass, ...style }} {...rest}>
      {children}
    </div>
  );
}
