export type ToastVariant = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

/**
 * Pub/sub simples em modulo (sem Context) - qualquer lugar do app chama
 * showToast(...) direto, sem precisar estar dentro de um Provider. Só existe
 * UM host montado (ToastHost, no AppShell) que escuta e renderiza a lista
 * atual.
 */
let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<(items: ToastItem[]) => void>();

function emit(): void {
  listeners.forEach((l) => l(toasts));
}

const TOAST_DURATION_MS = 3500;

export function showToast(message: string, variant: ToastVariant = "success"): void {
  const id = nextId++;
  toasts = [...toasts, { id, message, variant }];
  emit();
  setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(listener: (items: ToastItem[]) => void): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}
