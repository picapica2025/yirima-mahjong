import { build } from "vite";
import ts from "typescript";
import { cp, mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";

await build({ configFile: resolve("portable/vite.config.ts") });
const output = resolve("release/portable");
await mkdir(output, { recursive: true });
const engine = ts.transpileModule(await readFile("lib/riichi.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
await writeFile(resolve(output, "engine.mjs"), engine.outputText);
for (const name of ["server.mjs", "start-windows.bat", "start-macos.command", "start-linux.sh"]) {
  await cp(resolve("portable", name), resolve(output, name));
  if (name.endsWith(".sh") || name.endsWith(".command")) await chmod(resolve(output, name), 0o755);
}
for (const name of ["favicon.svg", "og.png"]) await cp(resolve("public", name), resolve(output, "web", name));
await cp("docs/PLAY.md", resolve(output, "README.md"));
await cp("docs/RIGHTS.md", resolve(output, "RIGHTS.md"));
await cp("docs/THIRD_PARTY_NOTICES.txt", resolve(output, "THIRD_PARTY_NOTICES.txt"));
console.log(`Portable game ready: ${output}`);
