-- 创建 buffer_result 表
CREATE TABLE IF NOT EXISTS buffer_result (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    target_type VARCHAR(50) NOT NULL,
    target_id INTEGER,
    buffer_distance INTEGER NOT NULL,
    buffer_geom GEOMETRY(POLYGON, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建空间索引
CREATE INDEX IF NOT EXISTS buffer_result_geom_idx ON buffer_result USING GIST (buffer_geom);
