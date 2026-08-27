import fs from "fs";
import { execSync, spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverBundle = path.join(__dirname, "dist", "server.cjs");

// Auto-build if dist/server.cjs was not built during the deploy step
if (!fs.existsSync(serverBundle)) {
  console.log("⚡ [Render / Production] dist/server.cjs not found. Triggering automated build...");
  try {
    execSync("npm run build", { stdio: "inherit", cwd: __dirname });
  } catch (err) {
    console.error("❌ Build failed during startup:", err);
    process.exit(1);
  }
}

if (!fs.existsSync(serverBundle)) {
  console.error("❌ Fatal: dist/server.cjs still does not exist after build.");
  process.exit(1);
}

console.log("🚀 Launching SignalBot production server (dist/server.cjs)...");
const child = spawn(process.execPath, [serverBundle], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (code !== null) process.exit(code);
  if (signal) process.kill(process.pid, signal);
});
