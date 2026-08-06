export function parseMonthParam(month: string | undefined): { year: number; monthIndex: number } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, m] = month.split("-").map(Number);
    return { year, monthIndex: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth() };
}

export function monthParam(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function monthLabel(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(year, monthIndex, 1),
  );
}

export function getMonthRange(year: number, monthIndex: number): { rangeStart: Date; rangeEnd: Date } {
  return { rangeStart: new Date(year, monthIndex, 1), rangeEnd: new Date(year, monthIndex + 1, 1) };
}
