const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

module.exports = {
  PORT: process.env.PORT || 3000,
  CHANNEL_ACCESS_TOKEN: process.env.CHANNEL_ACCESS_TOKEN || "",
  CHANNEL_SECRET: process.env.CHANNEL_SECRET || "",
  ADMIN_LINE_ID: process.env.ADMIN_LINE_ID || "",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  GOOGLE_SHEETS_URL: process.env.GOOGLE_SHEETS_URL || "",
  LIFF_ID: process.env.LIFF_ID || "",
  LINE_OA_URL: process.env.LINE_OA_URL || "https://line.me/",
  FORM_URL: process.env.FORM_URL || "",
  RICH_MENU_IMAGE: process.env.RICH_MENU_IMAGE || "public/richmenu-image.png"
};