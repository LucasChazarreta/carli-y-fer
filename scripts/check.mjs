import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
let count = 0;
function checkDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      checkDirectory(file);
      continue;
    }
    if (entry.name.endsWith(".js")) {
      execFileSync(process.execPath, ["--check", file]);
      count++;
    }
    if (entry.name.endsWith(".html")) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(/(?:src|href)="([^"#?]+)(?:[^\"]*)?"/g)) {
        const target = match[1];
        if (/^(https?:|data:|mailto:)/.test(target)) continue;
        if (!fs.existsSync(path.resolve(path.dirname(file), target)))
          throw new Error(file + ": missing " + target);
      }
    }
  }
}
checkDirectory("public");
for (const name of ["styles.css", "admin.css", "confirmados/confirmados.css"]) {
  const cssFile = path.join("public", name);
  const css = fs.readFileSync(cssFile, "utf8");
  for (const match of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g))
    if (!fs.existsSync(path.resolve(path.dirname(cssFile), match[1])))
      throw new Error("Missing CSS asset: " + match[1]);
}
console.log(
  `${count} JavaScript modules parsed. HTML and CSS local references exist.`,
);
