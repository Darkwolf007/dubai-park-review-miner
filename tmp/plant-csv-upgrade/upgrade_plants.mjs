import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const repoRoot = process.cwd();
const csvPath = path.join(repoRoot, "dataset", "UAE_MiddleEast_200_Plant_Database_Simulation.csv");
const outputDir = path.join(repoRoot, "outputs", "plant-database-upgrade");

const csvText = await fs.readFile(csvPath, "utf8");
const workbook = await Workbook.fromCSV(csvText, { sheetName: "Plants" });
const sheet = workbook.worksheets.getItem("Plants");
const used = sheet.getUsedRange(true);
const rowCount = used.values.length;

const newHeaders = [
  "Data Authority",
  "Horticultural Verification Status",
  "Thorn Hazard",
  "Toxicity Risk",
  "Allergen Risk",
  "Fruit / Litter Risk",
  "Fragrance",
  "UAE Nursery Availability",
  "Establishment Period (months)",
  "Indicative Hydrozone",
  "Indicative Planting Role",
  "Indicative Root Protection Radius (m)",
  "Indicative Canopy Shade Index",
  "Play / Sensory Placement Status",
  "Automation Eligibility",
  "Record QA Flag",
  "Derived Field Method",
];

sheet.getRange("AB1:AR1").values = [newHeaders];
const staticRows = Array.from({ length: rowCount - 1 }, () => [
  "Simulation dataset - competition design support only",
  "Requires horticultural verification",
  "Unknown",
  "Unknown",
  "Unknown",
  "Unknown",
  "Unknown",
  "Unknown",
  null,
  null,
  null,
  null,
  null,
  "Not approved near play, sensory, food, or accessible routes until safety review",
  "Candidate generation only - automatic placement blocked",
  null,
  "Hydrozone derives from water demand; role from habit and foliage density; root radius from max(canopy radius, 6x DBH); shade index from canopy area, foliage density, and leaf retention.",
]);
sheet.getRange(`AB2:AR${rowCount}`).values = staticRows;

sheet.getRange("AK2").formulas = [["=IF(I2=\"Very Low\",\"HZ-CREST Desert Crest\",IF(I2=\"Low\",\"HZ-SLOPE Stabilized Slope\",IF(LEFT(I2,8)=\"Moderate\",\"HZ-HOLLOW Shaded Hollow\",\"HZ-WATER Specialized Water\")))"]];
sheet.getRange(`AK2:AK${rowCount}`).fillDown();
sheet.getRange("AL2").formulas = [["=IF(ISNUMBER(SEARCH(\"Tree\",G2)),IF(OR(O2=\"Dense\",O2=\"Very Dense\",O2=\"Extremely Dense\"),\"Canopy / shaded hollow\",\"Crest / structure tree\"),IF(ISNUMBER(SEARCH(\"Grass\",G2)),\"Slope stabilization / movement texture\",IF(ISNUMBER(SEARCH(\"Groundcover\",G2)),\"Groundcover / erosion control\",\"Shrub / habitat layer\")))"]];
sheet.getRange(`AL2:AL${rowCount}`).fillDown();
sheet.getRange("AM2").formulas = [["=ROUND(MAX(K2/2,M2*6),1)"]];
sheet.getRange(`AM2:AM${rowCount}`).fillDown();
sheet.getRange("AN2").formulas = [["=ROUND(PI()*(K2/2)^2*IF(O2=\"Extremely Dense\",1,IF(O2=\"Very Dense\",0.9,IF(O2=\"Dense\",0.75,IF(O2=\"Medium\",0.55,IF(O2=\"Open\",0.35,0.2)))))*IF(P2=\"Evergreen\",1,IF(P2=\"Semi-Evergreen\",0.75,IF(P2=\"Deciduous\",0.6,0.8))),1)"]];
sheet.getRange(`AN2:AN${rowCount}`).fillDown();
sheet.getRange("AQ2").formulas = [[`=IF(COUNTIF($B$2:$B$${rowCount},B2)>1,"Duplicate scientific name","")`]];
sheet.getRange(`AQ2:AQ${rowCount}`).fillDown();

sheet.freezePanes.freezeRows(1);
sheet.freezePanes.freezeColumns(2);
sheet.showGridLines = false;
sheet.getRange("A1:AR1").format = {
  fill: "#173F35",
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#A7B8B0" },
};
sheet.getRange(`AB2:AR${rowCount}`).format.fill = "#F0F7F3";
sheet.getRange(`AA2:AR${rowCount}`).format.wrapText = true;
sheet.getRange(`AA2:AR${rowCount}`).format.rowHeight = 54;
sheet.getRange(`AM2:AN${rowCount}`).format.numberFormat = "0.0";
sheet.getRange(`A1:AR${rowCount}`).format.autofitColumns();
sheet.getRange("B:B").format.columnWidth = 24;
sheet.getRange("C:C").format.columnWidth = 24;
sheet.getRange("AA:AA").format.columnWidth = 46;
sheet.getRange("AB:AR").format.columnWidth = 22;
sheet.getRange("AO:AP").format.columnWidth = 34;
sheet.getRange("AR:AR").format.columnWidth = 52;
sheet.getRange("A1:AR1").format.rowHeight = 44;

const check = await workbook.inspect({
  kind: "table",
  range: "Plants!A1:AR8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 44,
  maxChars: 12000,
});
console.log(check.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
const previewA = await workbook.render({ sheetName: "Plants", range: "A1:Q8", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "plants-preview-source.png"), new Uint8Array(await previewA.arrayBuffer()));
const previewB = await workbook.render({ sheetName: "Plants", range: "R1:AR8", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "plants-preview-governance.png"), new Uint8Array(await previewB.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, "UAE_MiddleEast_200_Plant_Database_Design_Governed.xlsx"));

function quoteCsv(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const finalValues = sheet.getUsedRange(true).values;
const finalCsv = finalValues.map(row => row.map(quoteCsv).join(",")).join("\r\n") + "\r\n";
await fs.writeFile(csvPath, finalCsv, "utf8");
console.log(JSON.stringify({ csvPath, rowCount, columnCount: finalValues[0].length, outputDir }));
