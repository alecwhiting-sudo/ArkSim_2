/** Parse observed durations from CSV/TSV/plain-text: first numeric per line. */
export function parseDurationsCsv(text: string): number[] {
  const values: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const token = line.split(/[,;\t]/).find((cell) => {
      const v = Number(cell.trim());
      return cell.trim() !== "" && Number.isFinite(v);
    });
    if (token !== undefined) {
      const v = Number(token.trim());
      if (v >= 0) values.push(v);
    }
  }
  return values;
}

export function pickCsvFile(onLoad: (text: string, filename: string) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,.tsv,.txt,text/csv";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    onLoad(await file.text(), file.name);
  };
  input.click();
}
