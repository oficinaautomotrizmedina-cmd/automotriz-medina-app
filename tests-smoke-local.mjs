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
const employeeInlineScripts = [...employee.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
for (const [index, match] of employeeInlineScripts.entries()) {
  try {
    new Function(match[1]);
  } catch (error) {
    throw new Error(`empleado.html inline script ${index + 1} invalid: ${error.message}`);
  }
}
if (!employee.includes("enqueueEmployeeBackgroundSave")) throw new Error("employee background save missing");
if (employee.includes("confirmCloudSave=async function")) throw new Error("employee general save must remain blocking and confirmed");
if (employee.includes("confirmEmployeeCloudOnly=async function")) throw new Error("employee tracking save must remain blocking and confirmed");
if (!employee.includes("confirmBitacoraCloudSave=async function")) throw new Error("employee bitacora must keep fast background save");

const adminApp = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const generalSave = adminApp.slice(
  adminApp.indexOf("async function confirmCloudSaved"),
  adminApp.indexOf("function setAdminVehicleCloudStatus")
);
if (!generalSave.includes("saveNow") || !generalSave.includes("fetchConfirmedCloudSnapshot")) {
  throw new Error("admin general save must write and confirm against cloud");
}
const bitacoraSave = adminApp.slice(
  adminApp.indexOf("async function confirmInternalLogSaved"),
  adminApp.indexOf("function setAdminMasterFrameSource")
);
if (!bitacoraSave.includes("enqueueBackgroundSave")) throw new Error("admin bitacora must keep fast background save");

const cloud = fs.readFileSync(path.join(root, "assets/js/cloud-sync.js"), "utf8");
for (const marker of ["enqueueBackgroundSave", "processBackgroundOutbox", "retryBackgroundSave", "OUTBOX_MAX_WAIT"]) {
  if (!cloud.includes(marker)) throw new Error(`cloud outbox marker missing: ${marker}`);
}
if (!cloud.includes("if (rec?.deletedAt) return;")) throw new Error("cloud sync must respect administrator trash state");
if (cloud.includes("shouldReviveEmployeeVehicles")) throw new Error("cloud sync must not revive administrator-deleted receptions");
if (cloud.includes("merged.deletedReceptionNumbers = merged.deletedReceptionNumbers.filter")) {
  throw new Error("cloud sync must preserve permanent deletion markers");
}
if ((adminApp.match(/removeEmployeeVehicleForReception\(rec\)/g) || []).length < 2) {
  throw new Error("trash and permanent deletion must remove the active employee copy");
}

const strictFiles = ["autorizacion-rapida.html", "modulo-master-taller.html", "modulo-empleados-rapido-taller.html"];
for (const file of strictFiles) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  if (!html.includes("saveNow")) throw new Error(`${file} lost strict cloud save`);
}

console.log("AM Recepcion Local smoke OK");
