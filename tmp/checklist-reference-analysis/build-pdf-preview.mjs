import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const analysisDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(analysisDir, "../..");
let html = "";
const popup = {
  document: {
    open() {},
    write(value) { html += value; },
    close() {},
  },
  focus() {},
};

globalThis.window = {
  location: { href: "http://127.0.0.1:5180/index.html" },
  open: () => popup,
  alert: (message) => { throw new Error(message); },
};

vm.runInThisContext(await fs.readFile(path.join(projectDir, "checklist-config.js"), "utf8"));
vm.runInThisContext(await fs.readFile(path.join(projectDir, "crane-checklist-pdf.js"), "utf8"));

const state = {};
window.craneChecklistCatalog.forEach((item) => {
  const status = item.number % 11 === 0 ? "bad" : item.number % 7 === 0 ? "na" : "good";
  state[item.id] = { status, description: status === "bad" ? "Condicion de prueba" : "" };
});

window.openCraneChecklistPdf({
  popup,
  client: "EMPRESA INDUSTRIAL DE PRUEBA",
  contact: { name: "Responsable de mantenimiento" },
  crane: {
    craneId: "GRUA #12",
    structureCapacity: "10 TON",
    type: "Viajera",
    area: "Nave de produccion 2",
    hoistCapacity: "5 TON",
    brand: "Harrington",
    model: "NER2",
    voltage: "460 V",
    serialNumber: "SER-001234",
  },
  catalog: window.craneChecklistCatalog,
  rows: window.craneChecklistExcelRows,
  checklistState: state,
  checklistMeta: { folio: "M-3200", updatedAt: "2026-08-18T17:00:00.000Z" },
});

html = html
  .replace(/<script>window\.addEventListener\("load"[\s\S]*?<\\\/script>/, "")
  .replace("</style>", ".print-toolbar{display:none!important}.sheet{margin:0 auto!important}</style>");

const outputPath = path.resolve(projectDir, "tmp/pdfs/checklist-generated-test.html");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, html, "utf8");
console.log(outputPath);
