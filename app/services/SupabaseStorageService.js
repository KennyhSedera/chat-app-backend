const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const BUCKET = "chat-files";

class SupabaseStorageService {
  /**
   * Upload un fichier (buffer) vers Supabase Storage
   * @param {Buffer} fileBuffer - contenu du fichier
   * @param {string} originalName - nom original du fichier
   * @param {string} mimeType - type MIME
   * @param {string} folder - sous-dossier logique (ex: "images", "audio", "documents")
   */
  static async uploadFile(fileBuffer, originalName, mimeType, folder = "misc") {
    const ext = originalName.split(".").pop();
    const fileName = `${folder}/${uuidv4()}.${ext}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Erreur upload Supabase: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    return {
      path: fileName,
      url: urlData.publicUrl,
      size: fileBuffer.length,
    };
  }

  static extractPathFromUrl(url) {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const index = url.indexOf(marker);
    if (index === -1) return null;
    return url.substring(index + marker.length);
  }

  static async deleteFile(fileUrl) {
    const filePath = this.extractPathFromUrl(fileUrl);
    if (!filePath) {
      console.error("Impossible d'extraire le path depuis l'URL:", fileUrl);
      return;
    }

    const { error } = await supabase.storage.from(BUCKET).remove([filePath]);
    if (error) {
      console.error("Erreur suppression fichier:", error.message);
      return;
    }
  }

  static async getFiles(folder = "images") {
    const { data, error } = await supabase.storage
      .from("chat-files")
      .list(folder);

    if (error) {
      console.error("❌ Erreur chargement fichiers:", error.message);
      return null;
    }
    return data;
  }
}

module.exports = SupabaseStorageService;
