import { readFile, writeFile, readdir, stat, mkdir, cp, rm } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { deflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const name = `yiri-mahjong-v${pkg.version}`;
const output = resolve("release");
await mkdir(output, { recursive: true });

// ZIP writer: no additional build dependency; UTF-8 names and Unix modes.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
async function collect(root, prefix = "") {
  const files = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error("Release inputs cannot contain symlinks");
    const path = resolve(root, entry.name);
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await collect(path, name + "/"));
    else files.push({ name, bytes: await readFile(path), mode: (await stat(path)).mode });
  }
  return files;
}
async function zip(path, entries, prefix) {
  const chunks = [], central = [];
  let offset = 0;
  for (const file of entries) {
    const filename = Buffer.from(`${prefix}/${file.name}`);
    const bytes = file.bytes;
    const compressed = deflateRawSync(bytes);
    const crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
    chunks.push(local, filename, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(0x0314, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(33, 14); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(((file.mode & 0xffff) << 16) >>> 0, 38); directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const directories = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directories.length, 12); end.writeUInt32LE(offset, 16);
  await writeFile(path, Buffer.concat([...chunks, directories, end]));
}

const portable = (await collect(resolve("release/portable"))).filter((f) => !f.name.startsWith("data/"));
const portableName = `${name}-portable.zip`;
await zip(resolve(output, portableName), portable, `${name}-portable`);

// Explicit export boundary: never export .git, credentials, live data, or Site IDs.
const roots = ["app", "lib", "portable", "scripts", "tests", "docs", ".github", "build", "db", "drizzle", "worker", "examples"];
const singles = ["README.md", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "next.config.ts", "postcss.config.mjs", "eslint.config.mjs", "drizzle.config.ts", "cloudflare-env.d.ts", ".gitignore", "public/favicon.svg", "public/og.png"];
const source = [];
for (const directory of roots) source.push(...await collect(resolve(directory), `${directory}/`));
for (const path of singles) source.push({ name: path, bytes: await readFile(path), mode: 0o100644 });
source.push({ name: ".openai/hosting.json", bytes: Buffer.from(JSON.stringify({ d1: "DB", r2: null }, null, 2) + "\n"), mode: 0o100644 });
for (const file of source) {
  if (/\.(?:m?[jt]sx?|json|md|txt|yml)$/.test(file.name) && /appgprj_[A-Za-z0-9]+|(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(file.bytes.toString())) throw new Error(`Private metadata detected in ${file.name}`);
}
const sourceName = `${name}-source.zip`;
await zip(resolve(output, sourceName), source, `${name}-source`);

const sums = [];
for (const filename of [portableName, sourceName]) sums.push(`${createHash("sha256").update(await readFile(resolve(output, filename))).digest("hex")}  ${filename}`);
await writeFile(resolve(output, "SHA256SUMS.txt"), sums.join("\n") + "\n");
await rm("public/downloads", { recursive: true, force: true });
await mkdir("public/downloads", { recursive: true });
for (const filename of [portableName, sourceName, "SHA256SUMS.txt"]) await cp(resolve(output, filename), resolve("public/downloads", filename));
await cp("docs/PLAY.md", "public/downloads/PLAY.txt");
console.log(JSON.stringify({ version: pkg.version, files: [portableName, sourceName, "SHA256SUMS.txt"].map((f) => relative(process.cwd(), resolve(output, f))) }));
