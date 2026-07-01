import { toast } from "sonner";

export function exportToCsv(filename, rows) {
  if (!rows.length) {
    toast.error("Nothing to export");
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const stamp = new Date().toISOString().split("T")[0];
  link.download = `${filename}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
}
