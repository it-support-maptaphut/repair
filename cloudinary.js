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

function extFromMime(mimetype) {
  if (!mimetype) return "jpg";
  const m = /([\w.+-]+)/.exec(String(mimetype).split("/")[1] || "");
  const sub = m ? m[1] : "";
  if (EXT_BY_MIME[sub]) return EXT_BY_MIME[sub];
  if (AUDIO_EXT_BY_MIME[sub]) return AUDIO_EXT_BY_MIME[sub];
  return "jpg";
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

module.exports = { ok, uploadImage, uploadAudio };