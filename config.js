const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

module.exports = {
  PORT: process.env.PORT || 3000,
  APP_VERSION: process.env.APP_VERSION || "1.0.2",
  APP_VERSION_LABEL: process.env.APP_VERSION_LABEL || "V1.0.2",
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
  PASSWORD_NOTE_PIN: process.env.PASSWORD_NOTE_PIN || "",
  PASSWORD_NOTE_PASS: process.env.PASSWORD_NOTE_PASS || "",
  VISITOR_KEYPASS_PEPPER: process.env.VISITOR_KEYPASS_PEPPER || "",
  VISITOR_KEYPASS_ENC_KEY: process.env.VISITOR_KEYPASS_ENC_KEY || "",
  LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID || "",
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET || "",
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN || ""
};