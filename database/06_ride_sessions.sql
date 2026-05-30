-- =============================================
-- ⚠️ 仅用于新数据库初始化
-- 骑行会话与统计 - 数据库表结构
-- 执行顺序: 6
-- =============================================

-- 骑行会话表
DROP TABLE IF EXISTS ride_sessions CASCADE;
CREATE TABLE ride_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    challenge_id INT REFERENCES social_challenges(id) ON DELETE SET NULL,
    start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    total_distance DECIMAL(10, 2) DEFAULT 0,
    current_distance DECIMAL(10, 2) DEFAULT 0,
    duration INT DEFAULT 0,
    track_geom GEOMETRY(LINESTRING, 4326),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ride_session_user ON ride_sessions(user_id);
CREATE INDEX idx_ride_session_challenge ON ride_sessions(challenge_id);
CREATE INDEX idx_ride_session_status ON ride_sessions(status);
CREATE INDEX idx_ride_session_geom ON ride_sessions USING GIST(track_geom);

-- 用户骑行统计表
DROP TABLE IF EXISTS user_ride_stats CASCADE;
CREATE TABLE user_ride_stats (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    total_distance DECIMAL(10, 2) DEFAULT 0,
    total_time INT DEFAULT 0,
    total_calories DECIMAL(8, 2) DEFAULT 0,
    ride_count INT DEFAULT 0,
    level INT DEFAULT 1,
    experience INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_stats UNIQUE(user_id)
);
CREATE INDEX idx_user_ride_stats_user_id ON user_ride_stats(user_id);
CREATE INDEX idx_user_ride_stats_total_distance ON user_ride_stats(total_distance DESC);
CREATE INDEX idx_user_ride_stats_level ON user_ride_stats(level DESC);

-- 骑行统计表
DROP TABLE IF EXISTS ride_statistics CASCADE;
CREATE TABLE ride_statistics (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE UNIQUE,
    total_distance DECIMAL(12, 2) DEFAULT 0,
    total_time INT DEFAULT 0,
    total_rides INT DEFAULT 0,
    avg_speed DECIMAL(5, 2) DEFAULT 0,
    max_single_distance DECIMAL(10, 2) DEFAULT 0,
    max_single_time INT DEFAULT 0,
    longest_trip_id INT REFERENCES ride_sessions(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ride_stat_user ON ride_statistics(user_id);

-- =============================================
-- 初始化已有用户的统计数据
-- =============================================
INSERT INTO user_ride_stats (user_id, total_distance, total_time, total_calories, ride_count, level, experience)
SELECT 
    u.id,
    0,
    0,
    0,
    0,
    1,
    0
FROM "user" u
LEFT JOIN user_ride_stats urs ON urs.user_id = u.id
WHERE urs.id IS NULL;
