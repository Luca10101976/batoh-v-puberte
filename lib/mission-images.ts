import type { SupabaseClient } from "@supabase/supabase-js";

const MISSION_IMAGES_BUCKET = "mission-images";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function sanitizeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";
}

function fileExtensionForType(type: string, originalName: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";

  const originalExtension = originalName.split(".").pop()?.trim().toLowerCase();
  return originalExtension || "jpg";
}

async function ensureMissionImagesBucket(supabase: SupabaseClient<any, any, any>) {
  const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Nepodařilo se načíst storage buckets: ${listError.message}`);
  }

  if (existingBuckets.some((bucket) => bucket.name === MISSION_IMAGES_BUCKET)) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(MISSION_IMAGES_BUCKET, {
    public: true,
    fileSizeLimit: `${Math.floor(MAX_IMAGE_SIZE_BYTES / (1024 * 1024))}MB`,
    allowedMimeTypes: Array.from(ALLOWED_IMAGE_TYPES)
  });

  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw new Error(`Nepodařilo se vytvořit bucket pro obrázky: ${createError.message}`);
  }
}

export function validateMissionImageFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (!ALLOWED_IMAGE_TYPES.has(value.type)) {
    throw new Error("Povolené jsou jen obrázky JPG, PNG nebo WEBP.");
  }

  if (value.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("Obrázek může mít maximálně 5 MB.");
  }

  return value;
}

async function uploadImageToMissionStorage({
  supabase,
  filePath,
  file
}: {
  supabase: SupabaseClient<any, any, any>;
  filePath: string;
  file: File;
}) {
  await ensureMissionImagesBucket(supabase);

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(MISSION_IMAGES_BUCKET)
    .upload(filePath, arrayBuffer, {
      contentType: file.type,
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Upload obrázku selhal: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(MISSION_IMAGES_BUCKET).getPublicUrl(filePath);
  return {
    path: filePath,
    publicUrl: data.publicUrl
  };
}

export async function uploadMissionImage({
  supabase,
  missionId,
  stopId,
  file
}: {
  supabase: SupabaseClient<any, any, any>;
  missionId: string;
  stopId: string;
  file: File;
}) {
  const extension = fileExtensionForType(file.type, file.name);
  const baseName = sanitizeFileName(file.name.replace(/\.[^.]+$/, ""));
  const filePath = `missions/${missionId}/stops/${stopId}/${Date.now()}-${baseName}.${extension}`;

  return uploadImageToMissionStorage({
    supabase,
    filePath,
    file
  });
}

export async function uploadMissionHeroImage({
  supabase,
  missionId,
  file
}: {
  supabase: SupabaseClient<any, any, any>;
  missionId: string;
  file: File;
}) {
  const extension = fileExtensionForType(file.type, file.name);
  const baseName = sanitizeFileName(file.name.replace(/\.[^.]+$/, ""));
  const filePath = `missions/${missionId}/hero/${Date.now()}-${baseName}.${extension}`;

  return uploadImageToMissionStorage({
    supabase,
    filePath,
    file
  });
}

export async function deleteMissionImageByPath(
  supabase: SupabaseClient<any, any, any>,
  path: string | null | undefined
) {
  if (!path) {
    return;
  }

  await ensureMissionImagesBucket(supabase);
  const { error } = await supabase.storage.from(MISSION_IMAGES_BUCKET).remove([path]);
  if (error) {
    throw new Error(`Smazání obrázku selhalo: ${error.message}`);
  }
}

export function getMissionImageStoragePath(imageUrl: string | null | undefined) {
  if (!imageUrl) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return null;
  }

  try {
    const parsedImageUrl = new URL(imageUrl);
    const parsedSupabaseUrl = new URL(supabaseUrl);

    if (parsedImageUrl.origin !== parsedSupabaseUrl.origin) {
      return null;
    }

    const prefix = `/storage/v1/object/public/${MISSION_IMAGES_BUCKET}/`;
    const path = parsedImageUrl.pathname.startsWith(prefix)
      ? parsedImageUrl.pathname.slice(prefix.length)
      : null;

    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}
