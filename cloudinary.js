const cloudinary = require("cloudinary").v2;
const config = require("./config");
const supab = require("./supabase");

const ok =
  config.CLOUDINARY_CLOUD_NAME &&
  config.CLOUDINARY_API_KEY &&
  config.CLOUDINARY_API_SECRET &&
  !String(config.CLOUDINARY_CLOUD_NAME).toLowerCase().startsWith("x");

if (ok) {
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET
  });
}

const EXT_BY_MIME = { jpg: "jpg", jpeg: "jpg", png: "png", webp: "webp", gif: "gif" };
const AUDIO_EXT_BY_MIME = {
  webm: "webm",
  ogg: "ogg",
  opus: "opus",
  mpeg: "mp3",
  mp3: "mp3",
  mp4: "mp4",
  m4a: "m4a",
  "x-m4a": "m4a",
  "mp4a-latm": "m4a",
  wav: "wav",
  "x-wav": "wav",
  aac: "aac"
};
// เอกสาร/ไฟล์แนบหลักฐาน (ใช้กับระบบบันทึกปฏิบัติงานนอกสถานที่)
const DOC_EXT_BY_MIME = {
  pdf: "pdf",
  "x-pdf": "pdf",
  "msword": "doc",
  "vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "vnd.ms-excel": "xls",
  "vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "vnd.ms-powerpoint": "ppt",
  "vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  csv: "csv",
  plain: "txt",
  zip: "zip",
  "7z": "7z",
  rar: "rar"
};

function extFromMime(mimetype) {
  if (!mimetype) return "jpg";
  const m = /([\w.+-]+)/.exec(String(mimetype).split("/")[1] || "");
  const sub = m ? m[1] : "";
  if (EXT_BY_MIME[sub]) return EXT_BY_MIME[sub];
  if (AUDIO_EXT_BY_MIME[sub]) return AUDIO_EXT_BY_MIME[sub];
  return "jpg";
}

function docExtFromMime(mimetype) {
  const type = String(mimetype || "").toLowerCase();
  if (EXT_BY_MIME[type.split("/")[1]] || AUDIO_EXT_BY_MIME[type.split("/")[1]]) return extFromMime(mimetype);
  const sub = type.split("/")[1] || "";
  if (DOC_EXT_BY_MIME[sub]) return DOC_EXT_BY_MIME[sub];
  if (DOC_EXT_BY_MIME[type]) return DOC_EXT_BY_MIME[type];
  const clean = (sub || "bin").replace(/[^a-z0-9]/g, "");
  return clean && clean.length <= 6 ? clean : "bin";
}

function uploadToSupabase(buffer, name, mimetype) {
  const ext = extFromMime(mimetype);
  const objectPath = `tickets/${name}.${ext}`;
  return supab.supabase.storage
    .from("photos")
    .upload(objectPath, buffer, {
      contentType: mimetype || "image/jpeg",
      upsert: true
    })
    .then(({ error }) => {
      if (error) {
        console.warn("[Supabase Storage] อัปโหลดรูปไม่สำเร็จ:", error.message);
        return null;
      }
      const { data } = supab.supabase.storage.from("photos").getPublicUrl(objectPath);
      return { secure_url: data.publicUrl };
    });
}

function uploadDocToSupabase(buffer, name, mimetype) {
  const ext = docExtFromMime(mimetype);
  const objectPath = `fieldwork/${name}.${ext}`;
  return supab.supabase.storage
    .from("photos")
    .upload(objectPath, buffer, {
      contentType: mimetype || "application/octet-stream",
      upsert: true
    })
    .then(({ error }) => {
      if (error) {
        console.warn("[Supabase Storage] อัปโหลดไฟล์แนบไม่สำเร็จ:", error.message);
        return null;
      }
      const { data } = supab.supabase.storage.from("photos").getPublicUrl(objectPath);
      return { secure_url: data.publicUrl };
    });
}

async function uploadImage(buffer, name, mimetype) {
  if (ok) {
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "repair-tickets", public_id: name, resource_type: "image" },
          (err, uploaded) => (err ? reject(err) : resolve(uploaded))
        );
        stream.end(buffer);
      });
      if (result && result.secure_url) return result;
    } catch (e) {
      console.warn("[Cloudinary] อัปโหลดไม่สำเร็จ ใช้ Supabase Storage แทน:", e.message);
    }
  }
  if (supab.ready) {
    const stored = await uploadToSupabase(buffer, name, mimetype);
    if (stored) return stored;
  }
  console.warn("[Cloudinary] ยังไม่ได้ตั้งค่า เก็บงานโดยไม่มีรูป");
  return null;
}

async function uploadAudio(buffer, name, mimetype) {
  if (ok) {
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "repair-tickets", public_id: name, resource_type: "video" },
          (err, uploaded) => (err ? reject(err) : resolve(uploaded))
        );
        stream.end(buffer);
      });
      if (result && result.secure_url) return result;
    } catch (e) {
      console.warn("[Cloudinary] อัปโหลดเสียงไม่สำเร็จ ใช้ Supabase Storage แทน:", e.message);
    }
  }
  if (supab.ready) {
    const stored = await uploadToSupabase(buffer, name, mimetype);
    if (stored) return stored;
  }
  return null;
}

// อัปโหลดไฟล์แนบหลักฐาน (PDF / เอกสาร / รูป) — ใช้กับระบบบันทึกปฏิบัติงานนอกสถานที่
async function uploadDocument(buffer, name, mimetype) {
  if (ok) {
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "fieldwork", public_id: name, resource_type: "raw" },
          (err, uploaded) => (err ? reject(err) : resolve(uploaded))
        );
        stream.end(buffer);
      });
      if (result && result.secure_url) return result;
    } catch (e) {
      console.warn("[Cloudinary] อัปโหลดไฟล์ไม่สำเร็จ ใช้ Supabase Storage แทน:", e.message);
    }
  }
  if (supab.ready) {
    const stored = await uploadDocToSupabase(buffer, name, mimetype);
    if (stored) return stored;
  }
  console.warn("[Cloudinary] ยังไม่ได้ตั้งค่า เก็บงานโดยไม่มีไฟล์แนบ");
  return null;
}

module.exports = { ok, uploadImage, uploadAudio, uploadDocument };