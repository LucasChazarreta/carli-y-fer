import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
let count = 0;
for (const name of fs.readdirSync("public")) {
  if (name.endsWith(".js")) {
    execFileSync(process.execPath, ["--check", path.join("public", name)]);
    count++;
  }
  if (name.endsWith(".html")) {
    const text = fs.readFileSync(path.join("public", name), "utf8");
    for (const match of text.matchAll(/(?:src|href)="([^"#?]+)(?:[^\"]*)?"/g)) {
      const target = match[1];
      if (/^(https?:|data:|mailto:)/.test(target)) continue;
      if (!fs.existsSync(path.join("public", target)))
        throw new Error(name + ": missing " + target);
    }
  }
}
for (const name of ["styles.css", "admin.css"]) {
  const css = fs.readFileSync("public/" + name, "utf8");
  for (const match of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g))
    if (!fs.existsSync("public/" + match[1]))
      throw new Error("Missing CSS asset: " + match[1]);
}
console.log(
  `${count} JavaScript modules parsed. HTML and CSS local references exist.`,
);
