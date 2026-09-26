const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

module.exports = {
  PORT: process.env.PORT || 3000,
  ADMIN_USER: process.env.ADMIN_USER || "",
  ADMIN_PASS: process.env.ADMIN_PASS || "",
  ADMIN_SECRET: process.env.ADMIN_SECRET || "",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  GOOGLE_SHEETS_URL: process.env.GOOGLE_SHEETS_URL || "",
  PG_HOST: process.env.PG_HOST || "",
  PG_PORT: process.env.PG_PORT || 5432,
  PG_DATABASE: process.env.PG_DATABASE || "",
  PG_USER: process.env.PG_USER || "",
  PG_PASSWORD: process.env.PG_PASSWORD || "",
  PG_SSL: process.env.PG_SSL || "false",
  PASSWORD_NOTE_KEY: process.env.PASSWORD_NOTE_KEY || "",
  PASSWORD_NOTE_PIN: process.env.PASSWORD_NOTE_PIN || "741236",
  PASSWORD_NOTE_PASS: process.env.PASSWORD_NOTE_PASS || "wan2024*"
};