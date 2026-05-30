-- =============================================
-- ⚠️ 仅用于新数据库初始化
-- 挑战扩展功能 - 数据库表结构
-- 执行顺序: 4
-- =============================================

-- 1. 徽章表
DROP TABLE IF EXISTS badges CASCADE;
CREATE TABLE badges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    color VARCHAR(20),
    required_challenges INT DEFAULT 1,
    required_points INT DEFAULT 0,
    rarity VARCHAR(20) DEFAULT 'common',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_badges_rarity ON badges(rarity);

-- 2. 用户徽章表
DROP TABLE IF EXISTS user_badges CASCADE;
CREATE TABLE user_badges (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    badge_id INT REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_badge UNIQUE(user_id, badge_id)
);
CREATE INDEX idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX idx_user_badges_badge_id ON user_badges(badge_id);

-- 3. 挑战团队表
DROP TABLE IF EXISTS challenge_teams CASCADE;
CREATE TABLE challenge_teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    challenge_id INT REFERENCES social_challenges(id) ON DELETE CASCADE,
    max_members INT DEFAULT 5,
    created_by INT REFERENCES "user"(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_challenge_teams_challenge_id ON challenge_teams(challenge_id);
CREATE INDEX idx_challenge_teams_created_by ON challenge_teams(created_by);

-- 4. 团队成员表
DROP TABLE IF EXISTS team_members CASCADE;
CREATE TABLE team_members (
    id SERIAL PRIMARY KEY,
    team_id INT REFERENCES challenge_teams(id) ON DELETE CASCADE,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_team_member UNIQUE(team_id, user_id)
);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);

-- 5. 好友PK表
DROP TABLE IF EXISTS challenge_duels CASCADE;
CREATE TABLE challenge_duels (
    id SERIAL PRIMARY KEY,
    challenger_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    challenged_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    challenge_id INT REFERENCES social_challenges(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    challenger_progress DECIMAL(10, 2) DEFAULT 0,
    challenged_progress DECIMAL(10, 2) DEFAULT 0,
    winner_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);
CREATE INDEX idx_challenge_duels_challenger_id ON challenge_duels(challenger_id);
CREATE INDEX idx_challenge_duels_challenged_id ON challenge_duels(challenged_id);
CREATE INDEX idx_challenge_duels_status ON challenge_duels(status);

-- 6. 通知表
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(100) NOT NULL,
    content TEXT,
    related_id INT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- 7. 用户挑战档案表（统计汇总）
DROP TABLE IF EXISTS user_challenge_stats CASCADE;
CREATE TABLE user_challenge_stats (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    total_participated INT DEFAULT 0,
    total_completed INT DEFAULT 0,
    total_points_earned INT DEFAULT 0,
    longest_streak INT DEFAULT 0,
    current_streak INT DEFAULT 0,
    last_challenge_date DATE,
    CONSTRAINT unique_user_challenge_stats UNIQUE(user_id)
);
CREATE INDEX idx_user_challenge_stats_user_id ON user_challenge_stats(user_id);
CREATE INDEX idx_user_challenge_stats_total_completed ON user_challenge_stats(total_completed DESC);

-- =============================================
-- 初始化徽章数据
-- =============================================
INSERT INTO badges (name, description, icon, color, required_challenges, rarity) VALUES
('骑行新手', '完成第一个挑战', '🚴', '#6B7280', 1, 'common'),
('骑行爱好者', '完成3个挑战', '🚵', '#10B981', 3, 'common'),
('骑行达人', '完成10个挑战', '🏆', '#3B82F6', 10, 'rare'),
('骑行大师', '完成20个挑战', '👑', '#F59E0B', 20, 'epic'),
('骑行传奇', '完成50个挑战', '⭐', '#8B5CF6', 50, 'legendary'),
('坚持不懈', '连续7天参与挑战', '🔥', '#EF4444', 7, 'rare'),
('速度之星', '完成一次速度挑战', '⚡', '#06B6D4', 1, 'common'),
('耐力王者', '完成一次长距离挑战', '💪', '#EC4899', 1, 'rare'),
('团队领袖', '创建并带领团队完成挑战', '👥', '#84CC16', 1, 'epic'),
('社交达人', '分享挑战进度10次', '📤', '#F97316', 10, 'common');

-- =============================================
-- 更新现有挑战的难度等级
-- =============================================
UPDATE social_challenges SET difficulty_level = 'beginner' WHERE target_value < 10;
UPDATE social_challenges SET difficulty_level = 'intermediate' WHERE target_value >= 10 AND target_value < 50;
UPDATE social_challenges SET difficulty_level = 'advanced' WHERE target_value >= 50;

-- =============================================
-- 设置热门挑战
-- =============================================
UPDATE social_challenges SET is_featured = TRUE WHERE participant_count > 0 LIMIT 3;
