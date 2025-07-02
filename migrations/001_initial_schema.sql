BEGIN;

-- 1. Nettoyage préliminaire
DROP VIEW IF EXISTS user_chats CASCADE;

-- Supprimer les fonctions avant de les recréer
DROP FUNCTION IF EXISTS cleanup_old_messages (integer);

DROP FUNCTION IF EXISTS get_or_create_chat (VARCHAR, VARCHAR);

DROP FUNCTION IF EXISTS mark_messages_as_read (INTEGER, VARCHAR);

-- Supprimer les triggers et fonctions associées
DROP TRIGGER IF EXISTS trigger_update_chat_last_message ON messages;

DROP FUNCTION IF EXISTS update_chat_last_message ();

-- Supprimer les tables si tu veux repartir à zéro (optionnel)
-- DROP TABLE IF EXISTS messages CASCADE;
-- DROP TABLE IF EXISTS chats CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- 2. Création des tables (simplifiée ici)
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    avatar TEXT,
    is_online BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chats (
    chat_id SERIAL PRIMARY KEY,
    user1 VARCHAR(255) NOT NULL,
    user2 VARCHAR(255) NOT NULL,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chats_user1 FOREIGN KEY (user1) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_chats_user2 FOREIGN KEY (user2) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT chats_unique_users UNIQUE (user1, user2),
    CONSTRAINT chats_different_users CHECK (user1 != user2)
);

CREATE TABLE IF NOT EXISTS messages (
    message_id SERIAL PRIMARY KEY,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sender_id VARCHAR(255) NOT NULL,
    chat_id INTEGER,
    room VARCHAR(255),
    message_type VARCHAR(50) DEFAULT 'room',
    is_read BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_messages_sender_id FOREIGN KEY (sender_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_chat_id FOREIGN KEY (chat_id) REFERENCES chats (chat_id) ON DELETE CASCADE,
    CONSTRAINT chk_message_type CHECK (
        message_type IN ('room', 'private')
    ),
    CONSTRAINT messages_chat_or_room CHECK (
        (
            chat_id IS NOT NULL
            AND room IS NULL
            AND message_type = 'private'
        )
        OR (
            chat_id IS NULL
            AND room IS NOT NULL
            AND message_type = 'room'
        )
    )
);

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages (chat_id);

CREATE INDEX IF NOT EXISTS idx_messages_room ON messages (room);

CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages (is_read);

-- 4. Fonctions
CREATE OR REPLACE FUNCTION get_or_create_chat(p_user1 VARCHAR(255), p_user2 VARCHAR(255))
RETURNS INTEGER AS $$
DECLARE
    chat_id_result INTEGER;
    ordered_user1 VARCHAR(255);
    ordered_user2 VARCHAR(255);
BEGIN
    IF p_user1 < p_user2 THEN
        ordered_user1 := p_user1;
        ordered_user2 := p_user2;
    ELSE
        ordered_user1 := p_user2;
        ordered_user2 := p_user1;
    END IF;

    SELECT chat_id INTO chat_id_result
    FROM chats
    WHERE user1 = ordered_user1 AND user2 = ordered_user2;

    IF chat_id_result IS NULL THEN
        INSERT INTO chats (user1, user2) VALUES (ordered_user1, ordered_user2)
        RETURNING chat_id INTO chat_id_result;
    END IF;

    RETURN chat_id_result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_messages_as_read(p_chat_id INTEGER, p_user_id VARCHAR(255))
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE messages
    SET is_read = TRUE
    WHERE chat_id = p_chat_id AND sender_id != p_user_id AND is_read = FALSE;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_messages(p_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM messages WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 5. Triggers
CREATE OR REPLACE FUNCTION update_chat_last_message()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.message_type = 'private' AND NEW.chat_id IS NOT NULL THEN
        UPDATE chats SET last_message_at = NEW.created_at WHERE chat_id = NEW.chat_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chat_last_message
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_chat_last_message();

-- 6. Vue
CREATE OR REPLACE VIEW user_chats AS
SELECT
    c.chat_id,
    c.user1 as user1_id,
    c.user2 as user2_id,
    CASE
        WHEN c.user1 = u1.user_id THEN c.user2
        ELSE c.user1
    END as other_user_id,
    CASE
        WHEN c.user1 = u1.user_id THEN u2.name
        ELSE u1.name
    END as other_user_name,
    CASE
        WHEN c.user1 = u1.user_id THEN u2.avatar
        ELSE u1.avatar
    END as other_user_avatar,
    c.last_message_at,
    c.created_at,
    COALESCE(unread.unread_count, 0) as unread_count
FROM
    chats c
    JOIN users u1 ON u1.user_id = c.user1
    JOIN users u2 ON u2.user_id = c.user2
    LEFT JOIN (
        SELECT
            chat_id,
            sender_id,
            COUNT(*) as unread_count
        FROM messages
        WHERE
            is_read = FALSE
            AND message_type = 'private'
        GROUP BY
            chat_id,
            sender_id
    ) unread ON unread.chat_id = c.chat_id;

-- 7. Validation finale
COMMIT;