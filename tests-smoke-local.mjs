import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const pages = ["index.html", "admin.html", "empleado.html", "cliente.html", "seguimiento.html"];

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  if (!html.includes("assets/css/styles.css") && !html.includes("<style")) {
    throw new Error(`${page} missing styles`);
  }
  if (!html.includes("AM") && !html.includes("Automotriz")) throw new Error(`${page} missing brand`);
}

for (const file of ["assets/js/store.js", "assets/js/app.js", "assets/js/cloud-sync.js", "sw.js"]) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  new Function(code);
}

const employee = fs.readFileSync(path.join(root, "empleado.html"), "utf8");
if (!employee.includes("enqueueEmployeeBackgroundSave")) throw new Error("employee background save missing");

const cloud = fs.readFileSync(path.join(root, "assets/js/cloud-sync.js"), "utf8");
for (const marker of ["enqueueBackgroundSave", "processBackgroundOutbox", "retryBackgroundSave", "OUTBOX_MAX_WAIT"]) {
  if (!cloud.includes(marker)) throw new Error(`cloud outbox marker missing: ${marker}`);
}

const strictFiles = ["autorizacion-rapida.html", "modulo-master-taller.html", "modulo-empleados-rapido-taller.html"];
for (const file of strictFiles) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  if (!html.includes("saveNow")) throw new Error(`${file} lost strict cloud save`);
}

console.log("AM Recepcion Local smoke OK");
