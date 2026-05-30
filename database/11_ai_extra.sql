-- =============================================
-- ⚠️ 仅用于新数据库初始化
-- 此文件包含AI相关的辅助表
-- 执行顺序: 11（最后执行）
-- =============================================

-- 1. AI聊天日志表
DROP TABLE IF EXISTS ai_chat_log CASCADE;
CREATE TABLE ai_chat_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE SET NULL,
    session_id VARCHAR(50),
    role VARCHAR(20),
    content TEXT,
    intent VARCHAR(50),
    entities JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ai_chat_log_user ON ai_chat_log(user_id);
CREATE INDEX idx_ai_chat_log_session ON ai_chat_log(session_id);

-- 2. AI知识库表
DROP TABLE IF EXISTS ai_knowledge CASCADE;
CREATE TABLE ai_knowledge (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50),
    question TEXT,
    answer TEXT,
    keywords TEXT[],
    use_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ai_knowledge_category ON ai_knowledge(category);
CREATE INDEX idx_ai_knowledge_keywords ON ai_knowledge USING GIN(keywords);

-- 3. 系统配置表
DROP TABLE IF EXISTS system_config CASCADE;
CREATE TABLE system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT,
    description VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_system_config_key ON system_config(config_key);

-- 4. 天气路况影响表
DROP TABLE IF EXISTS weather_road_impact CASCADE;
CREATE TABLE weather_road_impact (
    id SERIAL PRIMARY KEY,
    weather_type VARCHAR(50),
    road_type VARCHAR(50),
    congestion_factor NUMERIC(3, 2),
    safety_factor NUMERIC(3, 2),
    comfort_factor NUMERIC(3, 2),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_weather_road_impact_weather ON weather_road_impact(weather_type);
CREATE INDEX idx_weather_road_impact_road ON weather_road_impact(road_type);

-- =============================================
-- 初始化系统配置数据
-- =============================================
INSERT INTO system_config (config_key, config_value, description) VALUES
('app_name', '骑行智慧民生服务平台', '应用名称'),
('app_version', '1.0.0', '应用版本'),
('maintenance_mode', 'false', '维护模式'),
('max_upload_size', '10', '最大上传文件大小(MB)'),
('session_timeout', '7200', '会话超时时间(秒)');
