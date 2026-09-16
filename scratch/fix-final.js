import fs from "node:fs";
import path from "node:path";
import { compile } from "@mdx-js/mdx";

const dir = path.join(process.cwd(), "content", "blog");

const fixes = {
  "admob-vs-firebase-revenue-reconciliation.mdx": (c) =>
    c.replace(/```math[\s\S]*?```/g, "```\neCPM = (Settled AdMob Revenue / Verified AdMob Impressions) * 1,000\n```")
     .replace(/\\\w+/g, ""),

  "app-store-algorithm-updates-history.mdx": (c) =>
    c.replace(/Category Volatility Index \([^)]+\)/g, "Category Volatility Index (Sigma_cat)")
     .replace(/```math[\s\S]*?```/g, "```\nSigma_cat = (1 / M) * sum( sqrt( (1 / N) * sum( (Delta Rank)^2 ) ) )\n```")
     .replace(/\\\w+/g, ""),

  "measuring-star-rating-impact-on-conversion.mdx": (c) =>
    c.replace(/```math[\s\S]*?```/g, "```\nN_needed = (Target * R_current - S_current) / (5.0 - Target)\n```")
     .replace(/\$R_\{?\\text\{current\}\}?\\?\$/g, "`R_current`")
     .replace(/\$S_\{?\\text\{current\}\}?\\?\$/g, "`S_current`")
     .replace(/\$T\$/g, "`T`")
     .replace(/\\\w+/g, ""),
};

for (const [file, fixFn] of Object.entries(fixes)) {
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) continue;
  const original = fs.readFileSync(filePath, "utf8");
  const fixed = fixFn(original);
  fs.writeFileSync(filePath, fixed, "utf8");
}

// Now compile test ALL 50 files
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));
let passCount = 0;
for (const file of files) {
  const raw = fs.readFileSync(path.join(dir, file), "utf8");
  const parts = raw.split("---");
  const content = parts.slice(2).join("---");
  try {
    await compile(content);
    passCount++;
  } catch (err) {
    console.error("FAIL: " + file + ": " + err.message);
  }
}
console.log(`Final Compilation Results: ${passCount} / ${files.length} MDX files compiled successfully.`);
