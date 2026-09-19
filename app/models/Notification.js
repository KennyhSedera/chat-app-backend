const DatabaseService = require("../services/DatabaseService");
const pool = DatabaseService.getPool();
const { v4: uuidv4 } = require("uuid");

// class Notification {
//   constructor(data) {
//     this._id = data.notification_id;
//     this.userId = data.user_id;
//     this.type = data.type;
//     this.title = data.title;
//     this.body = data.body;
//     this.data = data.data || {};
//     this.isRead = data.is_read;
//     this.createdAt = data.created_at;
//   }

//   static validateNotification({ userId, type }) {
//     if (!userId) throw new Error("userId est requis");
//     if (!type) throw new Error("type est requis");
//   }

//   /**
//    * Créer une notification en BDD
//    */
//   static async create({ userId, type, title, body, data = {} }) {
//     this.validateNotification({ userId, type });

//     const query = `
//       INSERT INTO notifications (user_id, type, title, body, data, is_read, created_at)
//       VALUES ($1, $2, $3, $4, $5, false, NOW())
//       RETURNING *;
//     `;
//     const values = [
//       userId,
//       type,
//       title || null,
//       body || null,
//       JSON.stringify(data),
//     ];

//     const result = await pool.query(query, values);
//     return new Notification(result.rows[0]);
//   }

//   /**
//    * Créer plusieurs notifications d'un coup (notif globale / broadcast)
//    */
//   static async createMany(notifications) {
//     if (!notifications.length) return [];

//     const values = [];
//     const placeholders = notifications
//       .map((n, i) => {
//         const offset = i * 5;
//         values.push(
//           n.userId,
//           n.type,
//           n.title || null,
//           n.body || null,
//           JSON.stringify(n.data || {}),
//         );
//         return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, false, NOW())`;
//       })
//       .join(", ");

//     const query = `
//       INSERT INTO notifications (user_id, type, title, body, data, is_read, created_at)
//       VALUES ${placeholders}
//       RETURNING *;
//     `;

//     const result = await pool.query(query, values);
//     return result.rows.map((row) => new Notification(row));
//   }

//   /**
//    * Récupérer les notifications d'un user (paginé)
//    */
//   static async getByUser({ userId, page = 1, limit = 30, unreadOnly = false }) {
//     const offset = (page - 1) * limit;

//     const query = `
//       SELECT * FROM notifications
//       WHERE user_id = $1
//       ${unreadOnly ? "AND is_read = false" : ""}
//       ORDER BY created_at DESC
//       LIMIT $2 OFFSET $3;
//     `;
//     const result = await pool.query(query, [userId, limit, offset]);
//     return result.rows.map((row) => new Notification(row));
//   }

//   /**
//    * Compter les notifications non lues
//    */
//   static async countUnread(userId) {
//     const query = `
//       SELECT COUNT(*)::int AS count FROM notifications
//       WHERE user_id = $1 AND is_read = false;
//     `;
//     const result = await pool.query(query, [userId]);
//     return result.rows[0].count;
//   }

//   /**
//    * Marquer une notification comme lue
//    */
//   static async markAsRead(notificationId, userId) {
//     const query = `
//       UPDATE notifications
//       SET is_read = true
//       WHERE notification_id = $1 AND user_id = $2
//       RETURNING *;
//     `;
//     const result = await pool.query(query, [notificationId, userId]);
//     return result.rows[0] ? new Notification(result.rows[0]) : null;
//   }

//   /**
//    * Marquer toutes les notifications d'un user comme lues
//    */
//   static async markAllAsRead(userId) {
//     const query = `
//       UPDATE notifications
//       SET is_read = true
//       WHERE user_id = $1 AND is_read = false
//       RETURNING notification_id;
//     `;
//     const result = await pool.query(query, [userId]);
//     return result.rows.length;
//   }

//   /**
//    * Supprimer une notification
//    */
//   static async delete(notificationId, userId) {
//     const query = `
//       DELETE FROM notifications
//       WHERE notification_id = $1 AND user_id = $2
//       RETURNING notification_id;
//     `;
//     const result = await pool.query(query, [notificationId, userId]);
//     return result.rows.length > 0;
//   }

//   /**
//    * Supprimer les vieilles notifications lues (nettoyage périodique)
//    */
//   static async deleteOldRead(userId, olderThanDays = 30) {
//     const query = `
//       DELETE FROM notifications
//       WHERE user_id = $1 AND is_read = true
//       AND created_at < NOW() - INTERVAL '${olderThanDays} days';
//     `;
//     await pool.query(query, [userId]);
//   }
// }

class Notification {
  constructor(data) {
    this._id = data.notification_id;
    this.userId = data.user_id;
    this.type = data.type;
    this.title = data.title;
    this.body = data.body;
    this.data = data.data || {};
    this.isRead = data.is_read;
    this.createdAt = data.created_at;
  }

  static validateNotification({ userId, type }) {
    if (!userId) throw new Error("userId est requis");
    if (!type) throw new Error("type est requis");
  }

  static async create({ userId, type, title, body, data = {} }) {
    this.validateNotification({ userId, type });

    const notificationId = uuidv4();

    const query = `
      INSERT INTO notifications (notification_id, user_id, type, title, body, data, is_read, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, false, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const values = [
      notificationId,
      userId,
      type,
      title || null,
      body || null,
      JSON.stringify(data),
    ];

    const result = await pool.query(query, values);
    return new Notification(result.rows[0]);
  }

  static async createMany(notifications) {
    if (!notifications.length) return [];

    const values = [];
    const placeholders = notifications
      .map((n, i) => {
        const offset = i * 6;
        values.push(
          uuidv4(),
          n.userId,
          n.type,
          n.title || null,
          n.body || null,
          JSON.stringify(n.data || {}),
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, false, CURRENT_TIMESTAMP)`;
      })
      .join(", ");

    const query = `
      INSERT INTO notifications (notification_id, user_id, type, title, body, data, is_read, created_at)
      VALUES ${placeholders}
      RETURNING *;
    `;

    const result = await pool.query(query, values);
    return result.rows.map((row) => new Notification(row));
  }

  static async getByUser({ userId, page = 1, limit = 30, unreadOnly = false }) {
    const offset = (page - 1) * limit;

    const query = `
      SELECT * FROM notifications
      WHERE user_id = $1
      ${unreadOnly ? "AND is_read = false" : ""}
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows.map((row) => new Notification(row));
  }

  static async countUnread(userId) {
    const query = `
      SELECT COUNT(*)::int AS count FROM notifications
      WHERE user_id = $1 AND is_read = false;
    `;
    const result = await pool.query(query, [userId]);
    return result.rows[0].count;
  }

  static async markAsRead(notificationId, userId) {
    const query = `
      UPDATE notifications
      SET is_read = true
      WHERE notification_id = $1 AND user_id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [notificationId, userId]);
    return result.rows[0] ? new Notification(result.rows[0]) : null;
  }

  static async markAllAsRead(userId) {
    const query = `
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1 AND is_read = false
      RETURNING notification_id;
    `;
    const result = await pool.query(query, [userId]);
    return result.rows.length;
  }

  static async delete(notificationId, userId) {
    const query = `
      DELETE FROM notifications
      WHERE notification_id = $1 AND user_id = $2
      RETURNING notification_id;
    `;
    const result = await pool.query(query, [notificationId, userId]);
    return result.rows.length > 0;
  }
}

module.exports = Notification;
