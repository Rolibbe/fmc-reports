import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const analysisDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(analysisDir, "../..");
const input = await FileBlob.load(path.join(projectDir, "Checklist.xlsx"));
const workbook = await SpreadsheetFile.importXlsx(input);

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 12000,
});
console.log("SHEETS");
console.log(sheets.ndjson);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,definedName,drawing",
  maxChars: 20000,
  tableMaxRows: 8,
  tableMaxCols: 12,
  tableMaxCellChars: 100,
});
console.log("SUMMARY");
console.log(summary.ndjson);

const sheetRecords = String(sheets.ndjson || "")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

for (const record of sheetRecords) {
  const sheetName = record.name || record.sheetName;
  if (!sheetName) {
    continue;
  }
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1.25,
    format: "png",
  });
  const safeName = sheetName.replace(/[^a-z0-9_-]+/gi, "-");
  await fs.writeFile(
    path.join(analysisDir, `${safeName}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}
