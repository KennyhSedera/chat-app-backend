const express = require("express");
const StatsController = require("../controllers/StatsController");

const router = express.Router();

// GET /api/stats - Récupérer les statistiques
router.get("/", StatsController.getStats);

module.exports = router;
