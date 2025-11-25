// esbuild.config.mjs
import esbuild from "esbuild";
import process from "process";

const isProd = process.argv[2] === "production";

async function run() {
  const common = {
    entryPoints: ["main.ts"],
    bundle: true,
    outfile: "main.js",
    platform: "node",
    format: "cjs",
    external: ["obsidian"], // 由 Obsidian 提供，不要打包进去
    sourcemap: !isProd,
  };

  if (isProd) {
    // 一次性打包
    await esbuild.build(common);
    console.log("✅ Build complete");
  } else {
    // 开发模式：使用 context + watch（适配 esbuild 新版）
    const ctx = await esbuild.context(common);
    await ctx.watch();
    console.log("🟡 Watching for changes...");
  }
}

run().catch((e) => {
  console.error("❌ Build failed:", e);
  process.exit(1);
});
