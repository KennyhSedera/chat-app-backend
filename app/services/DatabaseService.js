const { Pool } = require("pg");

class DatabaseService {
  constructor() {
    this.pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://postgres:2020@localhost:5432/AppChat",
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });
  }

  async initDatabase() {
    try {
      // --- USERS ---
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          avatar TEXT,
          is_online BOOLEAN DEFAULT false,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          password_hash VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // --- CHATS ---
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS chats (
          chat_id VARCHAR(255) PRIMARY KEY,
          user1 VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          user2 VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          last_message_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (user1, user2)
        )
      `);

      // --- MESSAGES ---
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
          message_id SERIAL PRIMARY KEY,
          content TEXT NOT NULL CHECK (LENGTH(content) <= 500),
          sender_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          chat_id VARCHAR(255) REFERENCES chats(chat_id) ON DELETE CASCADE,
          room VARCHAR(255),
          message_type VARCHAR(20) NOT NULL DEFAULT 'room'
            CHECK (message_type IN ('room', 'private')),
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CHECK (
            (message_type = 'room' AND room IS NOT NULL) OR
            (message_type = 'private' AND chat_id IS NOT NULL)
          )
        )
      `);

      // --- NOTIFICATIONS ---
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          notification_id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255),
          body TEXT,
          data JSONB DEFAULT '{}',
          is_read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // --- INDEXES ---
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_room_created_at 
        ON messages(room, created_at DESC)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_chat_created_at 
        ON messages(chat_id, created_at DESC)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_user_id 
        ON users(user_id)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chats_users 
        ON chats(user1, user2)
      `);
      await this.pool.query(
        `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);`,
      );
      await this.pool.query(
        `CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);`,
      );

      // --- FUNCTION: get_or_create_chat ---
      await this.pool.query(`
        CREATE OR REPLACE FUNCTION get_or_create_chat(p_user1 VARCHAR, p_user2 VARCHAR)
        RETURNS VARCHAR AS $$
        DECLARE
          v_user1 VARCHAR;
          v_user2 VARCHAR;
          v_chat_id VARCHAR;
        BEGIN
          IF p_user1 < p_user2 THEN
            v_user1 := p_user1;
            v_user2 := p_user2;
          ELSE
            v_user1 := p_user2;
            v_user2 := p_user1;
          END IF;

          v_chat_id := 'chat_' || v_user1 || '_' || v_user2;

          INSERT INTO chats (chat_id, user1, user2)
          VALUES (v_chat_id, v_user1, v_user2)
          ON CONFLICT (chat_id) DO NOTHING;

          RETURN v_chat_id;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // --- FUNCTION: mark_messages_as_read ---
      await this.pool.query(`
        CREATE OR REPLACE FUNCTION mark_messages_as_read(p_chat_id VARCHAR, p_user_id VARCHAR)
        RETURNS INTEGER AS $$
        DECLARE
          v_count INTEGER;
        BEGIN
          UPDATE messages
          SET is_read = true
          WHERE chat_id = p_chat_id
            AND sender_id != p_user_id
            AND is_read = false;

          GET DIAGNOSTICS v_count = ROW_COUNT;
          RETURN v_count;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // --- FUNCTION: cleanup_old_messages ---
      await this.pool.query(`
        CREATE OR REPLACE FUNCTION cleanup_old_messages(p_days INTEGER DEFAULT 30)
        RETURNS INTEGER AS $$
        DECLARE
          v_count INTEGER;
        BEGIN
          DELETE FROM messages
          WHERE created_at < CURRENT_TIMESTAMP - (p_days || ' days')::INTERVAL;

          GET DIAGNOSTICS v_count = ROW_COUNT;
          RETURN v_count;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // --- TRIGGER: mettre à jour last_message_at automatiquement ---
      await this.pool.query(`
        CREATE OR REPLACE FUNCTION update_chat_last_message()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.chat_id IS NOT NULL THEN
            UPDATE chats SET last_message_at = NEW.created_at WHERE chat_id = NEW.chat_id;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await this.pool.query(`
        DROP TRIGGER IF EXISTS trg_update_chat_last_message ON messages;
      `);
      await this.pool.query(`
        CREATE TRIGGER trg_update_chat_last_message
        AFTER INSERT ON messages
        FOR EACH ROW EXECUTE FUNCTION update_chat_last_message();
      `);
      // --- MIGRATION MESSAGES : ajout support multi-contenu (image, audio, vidéo, document) ---
      await this.pool.query(`
        ALTER TABLE messages
          ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) NOT NULL DEFAULT 'text',
          ADD COLUMN IF NOT EXISTS file_url TEXT,
          ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
          ADD COLUMN IF NOT EXISTS file_size INTEGER,
          ADD COLUMN IF NOT EXISTS file_mime_type VARCHAR(100),
          ADD COLUMN IF NOT EXISTS file_duration INTEGER,
          ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
      `);

      // Rendre "content" nullable (nécessaire pour les messages fichiers sans légende)
      await this.pool.query(`
        ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;
      `);

      // Contrainte sur content_type (les valeurs autorisées)
      await this.pool.query(`
        ALTER TABLE messages
          DROP CONSTRAINT IF EXISTS messages_content_type_check;
      `);
      await this.pool.query(`
        ALTER TABLE messages
          ADD CONSTRAINT messages_content_type_check
          CHECK (content_type IN ('text', 'image', 'audio', 'video', 'document'));
      `);

      // Contrainte de cohérence : texte doit avoir du contenu, fichier doit avoir une URL
      await this.pool.query(`
        ALTER TABLE messages
          DROP CONSTRAINT IF EXISTS messages_content_consistency_check;
      `);

      await this.pool.query(`
        ALTER TABLE messages
          ADD CONSTRAINT messages_content_consistency_check
          CHECK (
            (content_type = 'text' AND content IS NOT NULL AND LENGTH(TRIM(content)) > 0) OR
            (content_type != 'text' AND file_url IS NOT NULL)
          );
      `);

      // Index (inchangés, IF NOT EXISTS suffit ici)
      await this.pool.query(
        `CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at DESC);`,
      );

      await this.pool.query(
        `CREATE INDEX IF NOT EXISTS idx_messages_content_type ON messages(content_type);`,
      );

      await this.pool.query(`
        ALTER TABLE messages
          ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS reply_to_message_id INTEGER REFERENCES messages(message_id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS message_reactions (
          reaction_id SERIAL PRIMARY KEY,
          message_id INTEGER NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
          user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          emoji VARCHAR(10) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (message_id, user_id, emoji)
        )
      `);

      // Index pour les perfs
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id
          ON message_reactions(message_id)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_reply_to
          ON messages(reply_to_message_id)
      `);

      await this.pool.query(`
        ALTER TABLE message_reactions
          DROP CONSTRAINT IF EXISTS message_reactions_message_id_user_id_emoji_key
      `);

      await this.pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'message_reactions_message_id_user_id_key'
          ) THEN
            ALTER TABLE message_reactions
              ADD CONSTRAINT message_reactions_message_id_user_id_key
              UNIQUE (message_id, user_id);
          END IF;
        END $$;
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS rooms (
          room_id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          avatar TEXT,
          created_by VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          is_private BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS room_members (
          room_id VARCHAR(255) NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
          user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (room_id, user_id)
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room)
      `);

      await this.pool.query(`
        ALTER TABLE room_members
          ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'accepted'
          CHECK (status IN ('pending', 'accepted', 'declined'))
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_room_members_status ON room_members(user_id, status)
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS room_reads (
          room_id VARCHAR(255) NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
          user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          last_read_message_id INTEGER,
          last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (room_id, user_id)
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_room_reads_room ON room_reads(room_id)
      `);

      console.log("✅ Database tables initialized successfully");
    } catch (error) {
      console.error("❌ Database initialization error:", error);
      throw error;
    }
  }

  async testConnection() {
    return await this.pool.query("SELECT 1");
  }

  closeConnection(callback) {
    this.pool.end(callback);
  }

  getPool() {
    return this.pool;
  }
}

module.exports = new DatabaseService();
