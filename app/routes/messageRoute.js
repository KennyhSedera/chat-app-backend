const express = require("express");
const MessageController = require("../controllers/MessageController");

const router = express.Router();

router.get("/", MessageController.getMessages);
router.post("/", MessageController.createMessage);
router.delete("/cleanup", MessageController.cleanupMessages);
router.put("/read", MessageController.markAsRead);
router.put("/:messageId", MessageController.editMessage);
router.post("/:messageId/reactions", MessageController.toggleReaction);
router.delete("/:chatId/:messageId", MessageController.deletePrivateMessage);

module.exports = router;

module.exports = router;
