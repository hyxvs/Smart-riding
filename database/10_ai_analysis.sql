-- =============================================
-- ⚠️ 仅用于新数据库初始化
-- AI路况分析 - 数据库表结构
-- 执行顺序: 10
-- =============================================

-- 1. 骑行历史表
DROP TABLE IF EXISTS cycling_history CASCADE;
CREATE TABLE cycling_history (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE SET NULL,
    route_geom GEOMETRY(LINESTRING, 4326),
    start_point GEOMETRY(POINT, 4326),
    end_point GEOMETRY(POINT, 4326),
    start_name VARCHAR(200),
    end_name VARCHAR(200),
    total_distance DECIMAL(10, 2),
    total_time INT,
    avg_speed DECIMAL(5, 2),
    calories DECIMAL(8, 2),
    ride_date DATE,
    ride_start_time TIMESTAMP,
    ride_end_time TIMESTAMP,
    weather_condition VARCHAR(50),
    temperature DECIMAL(5, 2),
    wind_speed DECIMAL(5, 2),
    traffic_level VARCHAR(20) DEFAULT 'normal',
    difficulty_rating DECIMAL(3, 1),
    enjoyment_rating DECIMAL(3, 1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_cycling_history_geom ON cycling_history USING GIST(route_geom);
CREATE INDEX idx_cycling_history_user ON cycling_history(user_id);
CREATE INDEX idx_cycling_history_date ON cycling_history(ride_date);

-- 2. 道路状况评分表
DROP TABLE IF EXISTS road_condition_score CASCADE;
CREATE TABLE road_condition_score (
    id SERIAL PRIMARY KEY,
    road_id INT REFERENCES road(id) ON DELETE CASCADE,
    score_date DATE,
    congestion_score DECIMAL(3, 2) DEFAULT 0.5,
    safety_score DECIMAL(3, 2) DEFAULT 0.5,
    comfort_score DECIMAL(3, 2) DEFAULT 0.5,
    overall_score DECIMAL(3, 2) DEFAULT 0.5,
    congestion_level VARCHAR(20) DEFAULT 'smooth',
    peak_hour_factor DECIMAL(3, 2) DEFAULT 1.0,
    weather_impact_factor DECIMAL(3, 2) DEFAULT 1.0,
    prediction_model VARCHAR(50) DEFAULT 'rule_based',
    confidence DECIMAL(3, 2) DEFAULT 0.5,
    features_used JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(road_id, score_date)
);
CREATE INDEX idx_road_score_road ON road_condition_score(road_id);
CREATE INDEX idx_road_score_date ON road_condition_score(score_date);

-- 3. 道路状况记录表
DROP TABLE IF EXISTS road_condition_record CASCADE;
CREATE TABLE road_condition_record (
    id SERIAL PRIMARY KEY,
    road_id INT REFERENCES road(id) ON DELETE CASCADE,
    record_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    congestion_level INT DEFAULT 0,
    avg_speed DECIMAL(5, 2),
    traffic_density DECIMAL(5, 2),
    weather_condition VARCHAR(50),
    temperature DECIMAL(5, 2),
    wind_speed DECIMAL(5, 2),
    is_peak_hour BOOLEAN DEFAULT FALSE,
    day_of_week INT,
    hour_of_day INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_condition_record_road ON road_condition_record(road_id);
CREATE INDEX idx_condition_record_time ON road_condition_record(record_time);

-- 4. 道路交通预测表
DROP TABLE IF EXISTS road_traffic_prediction CASCADE;
CREATE TABLE road_traffic_prediction (
    id SERIAL PRIMARY KEY,
    road_id INT REFERENCES road(id) ON DELETE CASCADE,
    prediction_date DATE,
    prediction_hour INT,
    predicted_congestion_level DECIMAL(3, 2),
    predicted_avg_speed DECIMAL(5, 2),
    confidence_level DECIMAL(3, 2),
    prediction_type VARCHAR(20) DEFAULT 'hourly',
    weather_assumption VARCHAR(50),
    model_version VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(road_id, prediction_date, prediction_hour, prediction_type)
);
CREATE INDEX idx_prediction_road ON road_traffic_prediction(road_id);
CREATE INDEX idx_prediction_date ON road_traffic_prediction(prediction_date);

-- 5. 道路坡度难度表
DROP TABLE IF EXISTS road_slope_difficulty CASCADE;
CREATE TABLE road_slope_difficulty (
    id SERIAL PRIMARY KEY,
    road_id INT REFERENCES road(id) ON DELETE CASCADE,
    difficulty_level VARCHAR(20),
    difficulty_score DECIMAL(3, 2),
    description TEXT,
    recommended_speed DECIMAL(5, 2),
    safety_tips TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(road_id)
);
CREATE INDEX idx_slope_difficulty_road ON road_slope_difficulty(road_id);
CREATE INDEX idx_slope_difficulty_level ON road_slope_difficulty(difficulty_level);
