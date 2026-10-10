const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const PAGE_FILE = path.join(__dirname, "public", "repair-intake-print.html");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
];

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (!p) continue;
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch (e) {}
  }
  return null;
}

let browserPromise = null;

function getBrowser() {
  if (browserPromise) return browserPromise;
  const exe = findChrome();
  if (!exe) return Promise.reject(new Error("chrome-not-found"));
  browserPromise = puppeteer
    .launch({
      executablePath: exe,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"]
    })
    .catch((err) => {
      browserPromise = null;
      throw err;
    });
  return browserPromise;
}

async function buildRepairIntakePdf(item) {
  const tpl = fs.readFileSync(PAGE_FILE, "utf8");
  const json = JSON.stringify(item || {}).replace(/</g, "\\u003c");
  const html = tpl.replace("<body>", "<body>\n<script>window.__RI_ITEM__=" + json + ";</script>");

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    const buffer = Buffer.from(await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false
    }));
    return buffer;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = {
  buildRepairIntakePdf,
  hasChrome: () => !!findChrome()
};
