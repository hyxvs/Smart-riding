-- AI Road Condition Analysis - Database Migration Script
-- Run with: psql -U postgres -d cycling_smart -f ai_road_condition_analysis.sql

-- 1. Cycling History Table
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

-- 2. Road Condition Score Table
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

-- 3. Road Condition Record Table
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

-- 4. Road Traffic Prediction Table
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

-- 5. Road Slope Difficulty Table
DROP TABLE IF EXISTS road_slope_difficulty CASCADE;
CREATE TABLE road_slope_difficulty (
    id SERIAL PRIMARY KEY,
    road_id INT REFERENCES road(id) ON DELETE CASCADE,
    difficulty_level VARCHAR(20),
    difficulty_score DECIMAL(3, 2),
    recommended_speed DECIMAL(5, 2),
    energy_consumption DECIMAL(8, 2),
    fatigue_index DECIMAL(5, 2),
    suitable_for VARCHAR(100),
    warnings JSONB,
    ai_advice TEXT,
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_slope_difficulty_road ON road_slope_difficulty(road_id);

-- 6. Weather Road Impact Table
DROP TABLE IF EXISTS weather_road_impact CASCADE;
CREATE TABLE weather_road_impact (
    id SERIAL PRIMARY KEY,
    weather_type VARCHAR(50),
    road_type VARCHAR(50),
    congestion_factor DECIMAL(3, 2) DEFAULT 1.0,
    safety_factor DECIMAL(3, 2) DEFAULT 1.0,
    comfort_factor DECIMAL(3, 2) DEFAULT 1.0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_weather_impact_type ON weather_road_impact(weather_type);

-- 7. AI Cycling Advice Table
DROP TABLE IF EXISTS ai_cycling_advice CASCADE;
CREATE TABLE ai_cycling_advice (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE SET NULL,
    advice_type VARCHAR(50),
    route_geom GEOMETRY(LINESTRING, 4326),
    advice_content TEXT,
    weather_condition VARCHAR(50),
    temperature DECIMAL(5, 2),
    recommendations JSONB,
    safety_warnings JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_advice_geom ON ai_cycling_advice USING GIST(route_geom);
CREATE INDEX idx_advice_user ON ai_cycling_advice(user_id);

-- 8. Initialize Weather Impact Rules
INSERT INTO weather_road_impact (weather_type, road_type, congestion_factor, safety_factor, comfort_factor, description) VALUES
('sunny', 'city', 1.0, 1.0, 1.0, 'Best cycling weather'),
('sunny', 'mountain', 1.0, 0.9, 0.95, 'Good for cycling, watch sun exposure'),
('rainy', 'city', 1.5, 0.5, 0.4, 'Roads slippery, reduce speed'),
('rainy', 'mountain', 1.3, 0.3, 0.3, 'Not recommended'),
('cloudy', 'city', 1.1, 0.85, 0.8, 'Good for cycling'),
('cloudy', 'mountain', 1.0, 0.75, 0.75, 'Good for cycling'),
('snow', 'city', 2.0, 0.2, 0.2, 'Not recommended'),
('snow', 'mountain', 2.5, 0.1, 0.1, 'Avoid cycling'),
('windy', 'city', 1.3, 0.6, 0.5, 'Watch side winds'),
('windy', 'mountain', 1.5, 0.4, 0.35, 'Not recommended'),
('foggy', 'city', 1.2, 0.5, 0.6, 'Low visibility'),
('foggy', 'mountain', 1.4, 0.35, 0.4, 'Not recommended');

-- 9. Create View: Road Condition Overview
CREATE OR REPLACE VIEW v_road_condition_overview AS
SELECT
    r.id as road_id,
    r.name as road_name,
    r.road_type,
    r.length_km,
    r.avg_slope,
    r.max_slope,
    r.slope_category,
    COALESCE(AVG(rcs.overall_score), 0.5) as avg_condition_score,
    COALESCE(AVG(rcs.congestion_score), 0.5) as avg_congestion_score,
    COUNT(DISTINCT rcs.score_date) as score_history_count
FROM road r
LEFT JOIN road_condition_score rcs ON r.id = rcs.road_id
GROUP BY r.id, r.name, r.road_type, r.length_km, r.avg_slope, r.max_slope, r.slope_category;

-- 10. Create Function: Get Road AI Advice
CREATE OR REPLACE FUNCTION get_road_ai_advice(
    p_road_id INT,
    p_weather VARCHAR DEFAULT NULL,
    p_user_level INT DEFAULT 1
)
RETURNS TABLE (
    difficulty_level VARCHAR,
    difficulty_score DECIMAL,
    ai_advice TEXT,
    safety_warnings TEXT[],
    suitable_for VARCHAR
) AS $$
DECLARE
    v_slope_difficulty RECORD;
    v_weather_impact RECORD;
    v_advice TEXT;
    v_warnings TEXT[];
BEGIN
    SELECT * INTO v_slope_difficulty FROM road_slope_difficulty WHERE road_id = p_road_id ORDER BY analyzed_at DESC LIMIT 1;

    IF p_weather IS NOT NULL THEN
        SELECT * INTO v_weather_impact FROM weather_road_impact WHERE weather_type = p_weather LIMIT 1;
    END IF;

    difficulty_level := COALESCE(v_slope_difficulty.difficulty_level, 'unknown');
    difficulty_score := COALESCE(v_slope_difficulty.difficulty_score, 0.5);
    suitable_for := COALESCE(v_slope_difficulty.suitable_for, 'general cyclists');

    IF v_weather_impact.congestion_factor > 1.5 THEN
        v_warnings := array_append(v_warnings, 'Weather conditions poor, consider rescheduling');
    END IF;

    IF difficulty_score > 0.7 AND p_user_level < 3 THEN
        v_warnings := array_append(v_warnings, 'Difficult route, beginners should be cautious');
    END IF;

    ai_advice := 'Based on current road conditions, ';
    IF difficulty_score < 0.4 THEN
        ai_advice := ai_advice || 'this is a relatively flat route suitable for most cyclists.';
    ELSIF difficulty_score < 0.7 THEN
        ai_advice := ai_advice || 'this route has some elevation changes, suitable for experienced cyclists.';
    ELSE
        ai_advice := ai_advice || 'this route is quite challenging with steep climbs, recommended for experienced riders only.';
    END IF;

    IF v_weather_impact.congestion_factor IS NOT NULL AND v_weather_impact.congestion_factor > 1.2 THEN
        ai_advice := ai_advice || ' Considering weather conditions, please be extra careful and reduce speed if necessary.';
    END IF;

    safety_warnings := v_warnings;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE cycling_history IS 'Cycling history records for pattern analysis';
COMMENT ON TABLE road_condition_score IS 'AI-predicted road condition scores';
COMMENT ON TABLE road_condition_record IS 'Real-time and historical road conditions';
COMMENT ON TABLE road_traffic_prediction IS 'AI traffic predictions';
COMMENT ON TABLE road_slope_difficulty IS 'AI-analyzed slope difficulty';
COMMENT ON TABLE weather_road_impact IS 'Weather impact coefficients';
COMMENT ON TABLE ai_cycling_advice IS 'AI-generated cycling advice';

SELECT 'AI Road Condition Analysis tables created successfully' AS result;
