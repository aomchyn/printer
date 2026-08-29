export interface StatisticsOrderNoteSource {
  notes?: string | null;
}

export function getStatisticsOrderNote(
  order: StatisticsOrderNoteSource,
): string {
  const note = order.notes?.trim() ?? "";

  return note === "-" ? "" : note;
}
