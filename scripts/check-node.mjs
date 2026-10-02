// Vite needs Node 20.19+ (or 22.12+). Explain clearly instead of failing with a cryptic error.
const [major, minor] = process.versions.node.split('.').map(Number);
const ok = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
if (!ok) {
  console.error(`\n  Pen and Sword needs Node.js 20.19 or newer (you have ${process.versions.node}).\n  Download the current LTS version from https://nodejs.org, install it, then run "npm run dev" again.\n`);
  process.exit(1);
}
