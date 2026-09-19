const Notification = require("../models/Notification");

class NotificationController {
  static async getNotifications(req, res) {
    try {
      const { userId, page = 1, limit = 30, unreadOnly } = req.query;
      const notifications = await Notification.getByUser({
        userId,
        page: parseInt(page),
        limit: parseInt(limit),
        unreadOnly: unreadOnly === "true",
      });
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
  static async markAsRead(req, res) {
    try {
      const { userId } = req.body;
      const notif = await Notification.markAsRead(req.params.id, userId);
      res.json(notif);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
  static async markAllAsRead(req, res) {
    try {
      const { userId } = req.body;
      const count = await Notification.markAllAsRead(userId);
      res.json({ updated: count });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
  static async getUnreadCount(req, res) {
    try {
      const { userId } = req.query;
      const count = await Notification.countUnread(userId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }

  static async deleteNotification(req, res) {
    const { id, userId } = req.params;
    try {
      const notif = await Notification.delete(id, userId);
      res.json(notif);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
}

module.exports = NotificationController;
