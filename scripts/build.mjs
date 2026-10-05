import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "dist");
const releasesDir = path.join(projectRoot, "releases");
const manifest = JSON.parse(await readFile(path.join(projectRoot, "public", "manifest.json"), "utf8"));
const pkg = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
if (manifest.version !== pkg.version || !/^\d+(?:\.\d+){1,3}$/.test(manifest.version)) {
  throw new Error("Package and manifest must have the same valid extension version.");
}
const archivePath = path.join(releasesDir, `circlemate-v${manifest.version}.zip`);
// Only remove the generated checkout-local dist directory; prevent stale files in packages.
if (!path.isAbsolute(outputDir) || path.relative(projectRoot, outputDir) !== "dist") throw new Error("Invalid build output directory.");
await rm(outputDir, { recursive: true, force: true });

await mkdir(outputDir, { recursive: true });
await cp(path.join(projectRoot, "public"), outputDir, { recursive: true, force: true });
await cp(path.join(projectRoot, "src"), outputDir, { recursive: true, force: true });
await mkdir(releasesDir, { recursive: true });
const run = promisify(execFile);
if (process.platform === "win32") {
  await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$ErrorActionPreference = 'Stop'; $items = @(Get-ChildItem -LiteralPath $env:CIRCLEMATE_BUILD_DIR -Force | Select-Object -ExpandProperty FullName); Compress-Archive -LiteralPath $items -DestinationPath $env:CIRCLEMATE_BUILD_ZIP -CompressionLevel Optimal -Force"], {
    windowsHide: true,
    env: { ...process.env, CIRCLEMATE_BUILD_DIR: outputDir, CIRCLEMATE_BUILD_ZIP: archivePath }
  });
} else {
  await rm(archivePath, { force: true });
  await run("zip", ["-q", "-r", archivePath, "."], { cwd: outputDir });
}

console.log("CircleMate build output:", outputDir);
console.log("CircleMate extension ZIP:", archivePath);
