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

for (const file of ["assets/js/store.js", "assets/js/app.js"]) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  new Function(code);
}

console.log("AM Recepcion Local smoke OK");
