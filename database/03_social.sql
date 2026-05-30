-- =============================================
-- ⚠️ 仅用于新数据库初始化
-- 骑行社交广场 - 数据库表结构
-- 执行顺序: 3
-- =============================================

-- 1. 骑行动态表
DROP TABLE IF EXISTS social_posts CASCADE;
CREATE TABLE social_posts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    images TEXT[],
    video_url VARCHAR(500),
    location VARCHAR(200),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    ride_distance DECIMAL(10, 2),
    ride_duration INTEGER,
    ride_avg_speed DECIMAL(5, 2),
    like_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    share_count INT DEFAULT 0,
    is_challenge_post BOOLEAN DEFAULT FALSE,
    challenge_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_social_posts_user_id ON social_posts(user_id);
CREATE INDEX idx_social_posts_created_at ON social_posts(created_at DESC);
CREATE INDEX idx_social_posts_is_challenge_post ON social_posts(is_challenge_post) WHERE is_challenge_post = TRUE;

-- 2. 评论表
DROP TABLE IF EXISTS social_comments CASCADE;
CREATE TABLE social_comments (
    id SERIAL PRIMARY KEY,
    post_id INT REFERENCES social_posts(id) ON DELETE CASCADE,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    parent_comment_id INT REFERENCES social_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    like_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_social_comments_post_id ON social_comments(post_id);
CREATE INDEX idx_social_comments_user_id ON social_comments(user_id);

-- 3. 点赞表
DROP TABLE IF EXISTS social_likes CASCADE;
CREATE TABLE social_likes (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    post_id INT REFERENCES social_posts(id) ON DELETE CASCADE,
    comment_id INT REFERENCES social_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_post_like UNIQUE(user_id, post_id),
    CONSTRAINT unique_comment_like UNIQUE(user_id, comment_id),
    CONSTRAINT like_target_check CHECK (
        (post_id IS NOT NULL AND comment_id IS NULL) OR
        (post_id IS NULL AND comment_id IS NOT NULL)
    )
);
CREATE INDEX idx_social_likes_post_id ON social_likes(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX idx_social_likes_comment_id ON social_likes(comment_id) WHERE comment_id IS NOT NULL;

-- 4. 关注表
DROP TABLE IF EXISTS social_follows CASCADE;
CREATE TABLE social_follows (
    id SERIAL PRIMARY KEY,
    follower_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    following_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_follow UNIQUE(follower_id, following_id),
    CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);
CREATE INDEX idx_social_follows_follower_id ON social_follows(follower_id);
CREATE INDEX idx_social_follows_following_id ON social_follows(following_id);

-- 5. 话题表
DROP TABLE IF EXISTS social_topics CASCADE;
CREATE TABLE social_topics (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(100),
    post_count INT DEFAULT 0,
    热度指数 INT DEFAULT 0,
    is_hot BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_social_topics_is_hot ON social_topics(is_hot) WHERE is_hot = TRUE;

-- 6. 帖子话题关联表
DROP TABLE IF EXISTS post_topics CASCADE;
CREATE TABLE post_topics (
    post_id INT REFERENCES social_posts(id) ON DELETE CASCADE,
    topic_id INT REFERENCES social_topics(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, topic_id)
);

-- 7. 挑战活动表
DROP TABLE IF EXISTS social_challenges CASCADE;
CREATE TABLE social_challenges (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    challenge_type VARCHAR(50) NOT NULL,
    target_value DECIMAL(10, 2) NOT NULL,
    target_unit VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    participant_count INT DEFAULT 0,
    completion_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    cover_image VARCHAR(500),
    difficulty_level VARCHAR(20) DEFAULT 'beginner',
    is_featured BOOLEAN DEFAULT FALSE,
    created_by INT REFERENCES "user"(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_social_challenges_status ON social_challenges(status);
CREATE INDEX idx_social_challenges_dates ON social_challenges(start_date, end_date);
CREATE INDEX idx_social_challenges_difficulty ON social_challenges(difficulty_level);
CREATE INDEX idx_social_challenges_featured ON social_challenges(is_featured);

-- 8. 挑战参与记录表
DROP TABLE IF EXISTS challenge_participants CASCADE;
CREATE TABLE challenge_participants (
    id SERIAL PRIMARY KEY,
    challenge_id INT REFERENCES social_challenges(id) ON DELETE CASCADE,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    progress DECIMAL(10, 2) DEFAULT 0,
    progress_value DECIMAL(10, 2) DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_challenge_participant UNIQUE(challenge_id, user_id)
);
CREATE INDEX idx_challenge_participants_challenge_id ON challenge_participants(challenge_id);
CREATE INDEX idx_challenge_participants_user_id ON challenge_participants(user_id);
CREATE INDEX idx_challenge_participants_progress ON challenge_participants(progress DESC);

-- 9. 用户排行榜数据表（定期汇总）
DROP TABLE IF EXISTS leaderboard CASCADE;
CREATE TABLE leaderboard (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    period_type VARCHAR(20) NOT NULL,
    period_value VARCHAR(20) NOT NULL,
    total_distance DECIMAL(10, 2) DEFAULT 0,
    total_rides INT DEFAULT 0,
    total_elevation INT DEFAULT 0,
    rank_position INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_leaderboard_entry UNIQUE(user_id, period_type, period_value)
);
CREATE INDEX idx_leaderboard_period ON leaderboard(period_type, period_value);
CREATE INDEX idx_leaderboard_rank ON leaderboard(period_type, period_value, rank_position);

-- 10. 骑友位置表（附近骑友发现）
DROP TABLE IF EXISTS rider_locations CASCADE;
CREATE TABLE rider_locations (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_rider_location UNIQUE(user_id)
);
CREATE INDEX idx_rider_locations_coords ON rider_locations(latitude, longitude);
CREATE INDEX idx_rider_locations_activity ON rider_locations(last_activity DESC);

-- 11. 分享记录表
DROP TABLE IF EXISTS social_shares CASCADE;
CREATE TABLE social_shares (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    post_id INT REFERENCES social_posts(id) ON DELETE CASCADE,
    shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_social_shares_user_id ON social_shares(user_id);
CREATE INDEX idx_social_shares_post_id ON social_shares(post_id);
CREATE INDEX idx_social_shares_shared_at ON social_shares(shared_at DESC);

-- =============================================
-- 初始化默认话题
-- =============================================
INSERT INTO social_topics (name, description, is_hot) VALUES
('今日骑行', '分享今天的骑行体验', TRUE),
('装备晒单', '展示你的骑行装备', FALSE),
('骑行路线', '推荐好看的骑行路线', TRUE),
('新手入门', '新手骑友的问题和建议', FALSE),
('赛事活动', '各类骑行赛事信息', TRUE),
('夜骑', '夜骑安全和体验分享', FALSE);
