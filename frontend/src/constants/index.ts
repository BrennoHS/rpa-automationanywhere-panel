export const MACHINES = ["VM-RPA-01", "VM-RPA-02", "VM-RPA-03", "VM-RPA-04"];
export const ENVIRONMENTS = ["Produção", "Homologação"];
export const AREAS = [
  "Fiscal", "Financeiro", "RH", "Logística", "Compras", "Contábil", "Atendimento",
];
export const DEVELOPERS = [
  "Marina Alves", "Rafael Souza", "Camila Reis", "Bruno Lima", "Letícia Nunes",
];
export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** 96 slots de 15 minutos = 24h */
export const SLOTS = 96;
export const slotLabel = (s: number) =>
  `${String(Math.floor(s / 4)).padStart(2, "0")}:${String((s % 4) * 15).padStart(2, "0")}`;
