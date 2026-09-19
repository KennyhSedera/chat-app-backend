const express = require("express");
const ChatController = require("../controllers/ChatController");

const router = express.Router();

router.post("/create", ChatController.getOrCreate);
router.get("/:userId", ChatController.getChatsForUser);
router.get("/unread-count/:userId", ChatController.getUnreadCount);

module.exports = router;
