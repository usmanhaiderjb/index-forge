import fs from "node:fs";
import path from "node:path";
import { compile } from "@mdx-js/mdx";

const dir = path.join(process.cwd(), "content", "blog");

async function fixAndTest() {
  const fixes = {
    "app-subtitle-and-short-description-mastery.mdx": (c) => 
      c.replace(/iOS Title: <= 30 chars/g, "iOS Title: up to 30 chars")
       .replace(/iOS Subtitle: <= 30 chars/g, "iOS Subtitle: up to 30 chars")
       .replace(/iOS Keywords: <= 100 chars/g, "iOS Keywords: up to 100 chars")
       .replace(/Google Play Short Desc: <= 80 chars/g, "Google Play Short Desc: up to 80 chars")
       .replace(/Google Play Long Desc: <= 4,000 chars/g, "Google Play Long Desc: up to 4,000 chars"),

    "admob-vs-firebase-revenue-reconciliation.mdx": (c) =>
      c.replace(/\(\$Spend_\{?\\text\{Google\}\}? \+ Spend_\{?\\text\{ASA\}\}?\\?\$\)/g, "(Google Ads spend + ASA spend)")
       .replace(/\(\$IAP_\{?\\text\{iOS\}\}? \+ IAP_\{?\\text\{Android\}\}?\\?\$\)/g, "(iOS IAP + Android IAP)")
       .replace(/\$\$\\text\{eCPM\} = [^\$]+\$\$/g, "```math\neCPM = (Settled AdMob Revenue / Verified AdMob Impressions) * 1,000\n```"),

    "app-store-algorithm-updates-history.mdx": (c) =>
      c.replace(/Category Volatility Index \(\$\\sigma_\{?\\text\{cat\}\}?\\\$\)/g, "Category Volatility Index (`Sigma_cat`)")
       .replace(/$$\sigma_{\text{cat}} = [\s\S]*?\$\$/g, "```math\nSigma_cat = (1/M) * sum(sqrt((1/N) * sum((Delta Rank)^2)))\n```"),

    "measuring-star-rating-impact-on-conversion.mdx": (c) =>
      c.replace(/\$>=\s*4\.0\$/g, ">= 4.0")
       .replace(/\$&lt;\s*4\.0\$/g, "< 4.0")
       .replace(/\$< 4\.0\$/g, "< 4.0")
       .replace(/\$\$\\text\{N\}_\{?\\text\{needed\}\}? = [^\$]+\$\$/g, "```math\nN_needed = (Target * R_current - S_current) / (5.0 - Target)\n```")
       .replace(/\$\ge 4\.0\$/g, ">= 4.0")
       .replace(/\$< 3\.0\$/g, "< 3.0")
       .replace(/\$< 4\.0\$/g, "< 4.0"),
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
  console.log(`Compilation Results: ${passCount} / ${files.length} MDX files compiled successfully.`);
}

fixAndTest();
