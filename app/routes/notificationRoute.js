const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const controller = require("../controllers/NotificationController");

router.get("/", controller.getNotifications);

router.get("/unread-count", controller.getUnreadCount);

router.patch("/:id/read", controller.markAsRead);

router.patch("/mark-all-read", controller.markAllAsRead);

router.delete("/:id/:userId", controller.deleteNotification);

module.exports = router;
