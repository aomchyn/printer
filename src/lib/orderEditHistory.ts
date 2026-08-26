export interface HistoryEntry {
  id: number;
  action: string;
  user_name: string;
  summary: string;
  created_at: string;
}

export const isVisibleHistoryEntry = (entry: HistoryEntry) => {
  if (entry.action === "CANCEL" || entry.action === "RESTORE_FROM_TRASH") {
    return true;
  }

  return (
    entry.action === "UPDATE" &&
    (entry.summary.startsWith("แก้ไข:") || entry.summary === "แก้ไขคำสั่งพิมพ์")
  );
};
