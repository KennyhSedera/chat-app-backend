const DatabaseService = require("../services/DatabaseService");
const { v4: uuidv4 } = require("uuid");

class Room {
  static async create({
    name,
    description,
    avatar,
    createdBy,
    isPrivate = false,
  }) {
    const pool = DatabaseService.getPool();
    const roomId = `room_${uuidv4()}`;

    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO rooms (room_id, name, description, avatar, created_by, is_private)
       VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          roomId,
          name.trim(),
          description || null,
          avatar || null,
          createdBy,
          isPrivate,
        ],
      );

      await pool.query(
        `INSERT INTO room_members (room_id, user_id, role, status) VALUES ($1, $2, 'owner', 'accepted')`,
        [roomId, createdBy],
      );

      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }

    return Room.findById(roomId);
  }

  static async findById(roomId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT r.*, COUNT(rm.user_id) as member_count
       FROM rooms r
       LEFT JOIN room_members rm ON rm.room_id = r.room_id
       WHERE r.room_id = $1
       GROUP BY r.room_id`,
      [roomId],
    );

    if (!result.rows[0]) return null;

    return Room.formatRoom(result.rows[0]);
  }

  static async getUserRooms(userId) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `SELECT 
      r.room_id,
      r.name,
      r.description,
      r.avatar,
      r.created_by,
      r.is_private,
      r.created_at,
      rm_self.role as my_role,
      COUNT(DISTINCT rm.user_id) as member_count,
      m.message_id as last_message_id,
      m.content as last_message_content,
      m.content_type as last_message_content_type,
      m.sender_id as last_message_sender_id,
      m.created_at as last_message_at,
      sender.name as last_message_sender_name,
      COALESCE(unread.unread_count, 0) as unread_count
    FROM rooms r
    JOIN room_members rm_self ON rm_self.room_id = r.room_id AND rm_self.user_id = $1 AND rm_self.status = 'accepted'
    LEFT JOIN room_members rm ON rm.room_id = r.room_id AND rm.status = 'accepted'
    LEFT JOIN (
      SELECT DISTINCT ON (room) 
        room, message_id, content, content_type, sender_id, created_at
      FROM messages
      WHERE room IS NOT NULL
      ORDER BY room, created_at DESC
    ) m ON m.room = r.room_id
    LEFT JOIN users sender ON sender.user_id = m.sender_id
    LEFT JOIN (
      SELECT
        msg.room,
        COUNT(*) as unread_count
      FROM messages msg
      LEFT JOIN room_reads rr ON rr.room_id = msg.room AND rr.user_id = $1
      WHERE msg.room IS NOT NULL
        AND msg.sender_id != $1
        AND (rr.last_read_message_id IS NULL OR msg.message_id > rr.last_read_message_id)
      GROUP BY msg.room
    ) unread ON unread.room = r.room_id
    GROUP BY r.room_id, rm_self.role, m.message_id, m.content, m.content_type,
             m.sender_id, m.created_at, sender.name, unread.unread_count
    ORDER BY m.created_at DESC NULLS LAST`,
      [userId],
    );

    return result.rows.map(Room.formatRoom);
  }

  static async getDiscoverableRooms(userId) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `SELECT r.*, COUNT(rm.user_id) as member_count
       FROM rooms r
       LEFT JOIN room_members rm ON rm.room_id = r.room_id
       WHERE r.is_private = false
         AND r.room_id NOT IN (
           SELECT room_id FROM room_members WHERE user_id = $1
         )
       GROUP BY r.room_id
       ORDER BY r.created_at DESC`,
      [userId],
    );

    return result.rows.map(Room.formatRoom);
  }

  static async addMember(roomId, userId, role = "member") {
    const pool = DatabaseService.getPool();

    const room = await Room.findById(roomId);
    if (!room) throw new Error("Room introuvable");

    await pool.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [roomId, userId, role],
    );

    return Room.findById(roomId);
  }

  static async removeMember(roomId, userId) {
    const pool = DatabaseService.getPool();
    await pool.query(
      `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
    );
  }

  static async isMember(roomId, userId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 AND status = 'accepted'`,
      [roomId, userId],
    );
    return result.rows.length > 0;
  }

  static async getMembers(roomId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT u.user_id, u.name, u.avatar, u.is_online, u.last_seen, rm.role, rm.status, rm.joined_at
     FROM room_members rm
     JOIN users u ON u.user_id = rm.user_id
     WHERE rm.room_id = $1 AND rm.status = 'accepted'
     ORDER BY rm.joined_at ASC`,
      [roomId],
    );

    return result.rows.map((row) => ({
      _id: row.user_id,
      name: row.name,
      avatar: row.avatar,
      is_online: row.is_online,
      last_seen: row.last_seen,
      role: row.role,
      joinedAt: row.joined_at,
    }));
  }

  static async delete(roomId, userId) {
    const pool = DatabaseService.getPool();

    const room = await Room.findById(roomId);
    if (!room) throw new Error("Room introuvable");
    if (room.createdBy !== userId) {
      throw new Error("Seul le créateur peut supprimer la room");
    }

    await pool.query(`DELETE FROM rooms WHERE room_id = $1`, [roomId]);
  }

  static formatRoom(row) {
    return {
      roomId: row.room_id,
      name: row.name,
      description: row.description,
      avatar: row.avatar,
      createdBy: row.created_by,
      isPrivate: row.is_private,
      memberCount: parseInt(row.member_count, 10) || 0,
      myRole: row.my_role || null,
      unreadCount: parseInt(row.unread_count, 10) || 0,
      createdAt: row.created_at,
      lastMessage: row.last_message_id
        ? {
            _id: row.last_message_id,
            content: row.last_message_content,
            contentType: row.last_message_content_type,
            senderId: row.last_message_sender_id,
            senderName: row.last_message_sender_name,
          }
        : null,
      lastMessageAt: row.last_message_at || null,
    };
  }

  static async isAdminOrOwner(roomId, userId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
    );
    const role = result.rows[0]?.role;
    return role === "owner" || role === "admin";
  }

  static async getRole(roomId, userId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
    );
    return result.rows[0]?.role || null;
  }

  static async inviteMembers(roomId, userIds, invitedBy) {
    const pool = DatabaseService.getPool();

    const room = await Room.findById(roomId);
    if (!room) throw new Error("Room introuvable");

    const canInvite = await Room.isAdminOrOwner(roomId, invitedBy);
    if (!canInvite) {
      throw new Error("Seuls les admins peuvent inviter des membres");
    }

    const invited = [];
    for (const userId of userIds) {
      const result = await pool.query(
        `INSERT INTO room_members (room_id, user_id, role, status)
       VALUES ($1, $2, 'member', 'pending')
       ON CONFLICT (room_id, user_id) DO NOTHING
       RETURNING user_id`,
        [roomId, userId],
      );
      if (result.rows[0]) invited.push(userId);
    }

    return invited;
  }

  static async acceptInvite(roomId, userId) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `UPDATE room_members SET status = 'accepted'
     WHERE room_id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
      [roomId, userId],
    );

    if (!result.rows[0]) {
      throw new Error("Invitation introuvable ou déjà traitée");
    }

    return Room.findById(roomId);
  }

  static async declineInvite(roomId, userId) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `DELETE FROM room_members
     WHERE room_id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
      [roomId, userId],
    );

    if (!result.rows[0]) {
      throw new Error("Invitation introuvable ou déjà traitée");
    }
  }

  static async getPendingInvites(userId) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `SELECT 
      r.room_id, r.name, r.description, r.avatar, r.is_private,
      inviter.name as invited_by_name,
      rm.joined_at as invited_at
    FROM room_members rm
    JOIN rooms r ON r.room_id = rm.room_id
    JOIN room_members owner_rm ON owner_rm.room_id = r.room_id AND owner_rm.role = 'owner'
    JOIN users inviter ON inviter.user_id = r.created_by
    WHERE rm.user_id = $1 AND rm.status = 'pending'
    ORDER BY rm.joined_at DESC`,
      [userId],
    );

    return result.rows.map((row) => ({
      roomId: row.room_id,
      name: row.name,
      description: row.description,
      avatar: row.avatar,
      isPrivate: row.is_private,
      invitedByName: row.invited_by_name,
      invitedAt: row.invited_at,
    }));
  }

  static async removeMember(roomId, userId, removedBy) {
    const pool = DatabaseService.getPool();

    const room = await Room.findById(roomId);
    if (!room) throw new Error("Room introuvable");

    const isSelf = userId === removedBy;
    const canRemove = isSelf || (await Room.isAdminOrOwner(roomId, removedBy));

    if (!canRemove) {
      throw new Error("Vous n'avez pas la permission de retirer ce membre");
    }

    if (room.createdBy === userId && !isSelf) {
      throw new Error("Impossible de retirer le créateur de la room");
    }

    await pool.query(
      `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
    );
  }

  static async updateMemberRole(roomId, targetUserId, newRole, updatedBy) {
    const pool = DatabaseService.getPool();

    const room = await Room.findById(roomId);
    if (!room) throw new Error("Room introuvable");
    if (room.createdBy !== updatedBy) {
      throw new Error("Seul le créateur peut modifier les rôles");
    }
    if (!["admin", "member"].includes(newRole)) {
      throw new Error("Rôle invalide");
    }

    await pool.query(
      `UPDATE room_members SET role = $1 WHERE room_id = $2 AND user_id = $3`,
      [newRole, roomId, targetUserId],
    );
  }

  static async setMemberRole(roomId, targetUserId, newRole, updatedBy) {
    const pool = DatabaseService.getPool();

    const room = await Room.findById(roomId);
    if (!room) throw new Error("Room introuvable");
    if (room.createdBy !== updatedBy) {
      throw new Error("Seul le créateur peut modifier les rôles");
    }
    if (targetUserId === room.createdBy) {
      throw new Error("Impossible de modifier le rôle du créateur");
    }
    if (!["admin", "member"].includes(newRole)) {
      throw new Error("Rôle invalide");
    }

    const result = await pool.query(
      `UPDATE room_members SET role = $1
     WHERE room_id = $2 AND user_id = $3 AND status = 'accepted'
     RETURNING *`,
      [newRole, roomId, targetUserId],
    );

    if (!result.rows[0]) {
      throw new Error("Membre introuvable");
    }

    return result.rows[0];
  }

  static async update(roomId, updates, updatedBy) {
    const pool = DatabaseService.getPool();

    const room = await Room.findById(roomId);
    if (!room) throw new Error("Room introuvable");

    const canUpdate = await Room.isAdminOrOwner(roomId, updatedBy);
    if (!canUpdate) {
      throw new Error("Seuls les admins peuvent modifier la room");
    }

    const fields = [];
    const values = [];
    let index = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${index++}`);
      values.push(updates.name.trim());
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${index++}`);
      values.push(updates.description);
    }
    if (updates.avatar !== undefined) {
      fields.push(`avatar = $${index++}`);
      values.push(updates.avatar);
    }

    if (fields.length === 0) {
      return room;
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(roomId);

    await pool.query(
      `UPDATE rooms SET ${fields.join(", ")} WHERE room_id = $${index}`,
      values,
    );

    return Room.findById(roomId);
  }

  static async markAsRead(roomId, userId, lastReadMessageId) {
    const pool = DatabaseService.getPool();

    await pool.query(
      `INSERT INTO room_reads (room_id, user_id, last_read_message_id, last_read_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (room_id, user_id)
     DO UPDATE SET
       last_read_message_id = GREATEST(COALESCE(room_reads.last_read_message_id, 0), EXCLUDED.last_read_message_id),
       last_read_at = CURRENT_TIMESTAMP`,
      [roomId, userId, lastReadMessageId],
    );
  }

  static async getReadReceipts(roomId) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `SELECT rr.user_id, rr.last_read_message_id, rr.last_read_at,
            u.name, u.avatar
     FROM room_reads rr
     JOIN users u ON u.user_id = rr.user_id
     WHERE rr.room_id = $1`,
      [roomId],
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      lastReadMessageId: row.last_read_message_id,
      lastReadAt: row.last_read_at,
      name: row.name,
      avatar: row.avatar,
    }));
  }

  static async getLatestMessageId(roomId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT message_id FROM messages WHERE room = $1 ORDER BY created_at DESC LIMIT 1`,
      [roomId],
    );
    return result.rows[0]?.message_id ?? null;
  }
}

module.exports = Room;
