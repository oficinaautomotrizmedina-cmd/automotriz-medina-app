import fs from "node:fs";
import path from "node:path";

const root = path.resolve("work/am-recepcion-local");
const pages = ["index.html", "admin.html", "empleado.html", "cliente.html", "seguimiento.html"];

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  if (!html.includes("assets/css/styles.css")) throw new Error(`${page} missing css`);
  if (!html.includes("AM") && !html.includes("Automotriz")) throw new Error(`${page} missing brand`);
}

for (const file of ["assets/js/store.js", "assets/js/app.js"]) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  new Function(code);
}

console.log("AM Recepcion Local smoke OK");
