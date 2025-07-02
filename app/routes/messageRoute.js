const express = require("express");
const MessageController = require("../controllers/MessageController");

const router = express.Router();

router.get("/", MessageController.getMessages);

router.post("/", MessageController.createMessage);

router.delete("/cleanup", MessageController.cleanupMessages);

module.exports = router;
