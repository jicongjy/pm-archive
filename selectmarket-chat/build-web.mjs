// 배포용 폴더(public/)를 만든다: index.html 앞에 Firebase 연결 파일을 끼워 넣는다.
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(HERE, "public");
if (!existsSync(path.join(HERE, "firebase-config.js"))) {
  console.error("firebase-config.js 가 없어요. firebase-config.example.js 를 복사해서 값을 채워 주세요.");
  process.exit(1);
}
const html = await readFile(path.join(HERE, "index.html"), "utf8");
const head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="firebase-config.js"></script><script src="firebase-adapter.js"></script>';
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, "index.html"), html.includes("<head>") ? html.replace("<head>", "<head>" + head) : head + html);
for (const f of ["firebase-config.js", "firebase-adapter.js"]) await copyFile(path.join(HERE, f), path.join(OUT, f));
console.log("public/ 폴더를 만들었어요.");
