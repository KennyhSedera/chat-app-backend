const express = require("express");
const multer = require("multer");
const router = express.Router();
const SupabaseStorageService = require("../services/SupabaseStorageService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Aucun fichier fourni" });
    }

    const { contentType } = req.body;
    const folder =
      {
        image: "images",
        audio: "audio",
        video: "videos",
        document: "documents",
      }[contentType] || "misc";

    const result = await SupabaseStorageService.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folder,
    );

    res.json({
      fileUrl: result.url,
      fileName: req.file.originalname,
      fileSize: result.size,
      fileMimeType: req.file.mimetype,
    });
  } catch (error) {
    console.error("Erreur upload:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
