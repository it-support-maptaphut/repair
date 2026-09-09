const fs = require("fs");
const path = require("path");

const config = require("./config");
const { client } = require("./lineClient");

async function main() {
  if (!client) {
    console.log("ยังไม่มี Channel Access Token ที่ใช้งานได้ (ใส่ใน .env ก่อน)");
    return;
  }
  if (!config.FORM_URL) {
    console.log("ตั้ง FORM_URL ใน .env ก่อน (URL หน้าฟอร์ม)");
    return;
  }
  const imagePath = path.join(__dirname, config.RICH_MENU_IMAGE);
  if (!fs.existsSync(imagePath)) {
    console.log("ไม่พบรูป Rich Menu ที่ " + imagePath);
    return;
  }

  const payload = {
    size: { width: 2500, height: 843 },
    selected: true,
    name: "repair-menu",
    chatBarText: "เมนู",
    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 843 },
        action: { type: "uri", uri: config.FORM_URL }
      },
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 843 },
        action: { type: "uri", uri: "tel:0630050430" }
      }
    ]
  };

  const menuId = await client.createRichMenu(payload);
  const buffer = fs.readFileSync(imagePath);
  await client.setRichMenuImage(menuId, buffer);
  await client.setDefaultRichMenu(menuId);
  console.log("Rich Menu ตั้งค่าแล้ว ID: " + menuId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});