-- =============================================
-- ⚠️ 仅用于新数据库初始化
-- 骑行智慧民生服务平台 - 数据库初始化脚本
-- 数据库名: cycling_smart
-- 执行顺序: 1
-- =============================================

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgRouting;

-- =============================================
-- 一、基础空间层
-- =============================================

-- 1. 道路表
DROP TABLE IF EXISTS road CASCADE;
CREATE TABLE road (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200),
    road_type VARCHAR(50),
    geom GEOMETRY(LINESTRING, 4326),
    length_km DECIMAL(10, 3),
    speed_limit INT DEFAULT 30,
    safety_index DECIMAL(3, 2) DEFAULT 0.5,
    scenery_index DECIMAL(3, 2) DEFAULT 0.5,
    elevation_gain INT DEFAULT 0,
    is_bike_lane BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_road_geom ON road USING GIST(geom);
CREATE INDEX idx_road_name ON road(name);

-- 2. 兴趣点表 (POI)
DROP TABLE IF EXISTS poi CASCADE;
CREATE TABLE poi (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50),
    sub_category VARCHAR(50),
    geom GEOMETRY(POINT, 4326),
    address VARCHAR(500),
    description TEXT,
    is_red_spot BOOLEAN DEFAULT FALSE,
    red_description TEXT,
    safety_rating DECIMAL(2, 1),
    scenery_rating DECIMAL(2, 1),
    opening_hours VARCHAR(100),
    contact_phone VARCHAR(20),
    images TEXT[],
    status VARCHAR(20) DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_poi_geom ON poi USING GIST(geom);
CREATE INDEX idx_poi_category ON poi(category);
CREATE INDEX idx_poi_red ON poi(is_red_spot);

-- 3. 实时路况表
DROP TABLE IF EXISTS traffic_realtime CASCADE;
CREATE TABLE traffic_realtime (
    id SERIAL PRIMARY KEY,
    road_id INT REFERENCES road(id),
    segment_start GEOMETRY(POINT, 4326),
    segment_end GEOMETRY(POINT, 4326),
    congestion_level INT DEFAULT 0,
    avg_speed DECIMAL(5, 2),
    vehicle_count INT,
    record_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_traffic_road ON traffic_realtime(road_id);
CREATE INDEX idx_traffic_time ON traffic_realtime(record_time);

-- =============================================
-- 二、用户账号层
-- =============================================

-- 1. 用户表
DROP TABLE IF EXISTS "user" CASCADE;
CREATE TABLE "user" (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255),
    nickname VARCHAR(50),
    avatar VARCHAR(500),
    gender VARCHAR(10),
    birthday DATE,
    openid VARCHAR(100),
    unionid VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
    status VARCHAR(20) DEFAULT 'active',
    last_login_at TIMESTAMP,
    last_login_ip VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_user_phone ON "user"(phone);
CREATE INDEX idx_user_openid ON "user"(openid);

-- 2. 用户实名表
DROP TABLE IF EXISTS user_auth CASCADE;
CREATE TABLE user_auth (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    real_name VARCHAR(50),
    id_card VARCHAR(20),
    auth_status VARCHAR(20) DEFAULT 'pending',
    auth_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_user_auth_user ON user_auth(user_id);

-- 3. 用户积分表
DROP TABLE IF EXISTS user_point CASCADE;
CREATE TABLE user_point (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    total_points INT DEFAULT 0,
    available_points INT DEFAULT 0,
    used_points INT DEFAULT 0,
    level INT DEFAULT 1,
    experience INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_point_user ON user_point(user_id);

-- 4. 积分流水表
DROP TABLE IF EXISTS point_log CASCADE;
CREATE TABLE point_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    points INT,
    type VARCHAR(50),
    description VARCHAR(200),
    balance_after INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_point_log_user ON point_log(user_id);

-- =============================================
-- 三、路线规划层
-- =============================================

-- 1. 路线规划结果表
DROP TABLE IF EXISTS route_plan_result CASCADE;
CREATE TABLE route_plan_result (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE SET NULL,
    plan_mode VARCHAR(50),
    start_point GEOMETRY(POINT, 4326),
    end_point GEOMETRY(POINT, 4326),
    start_name VARCHAR(200),
    end_name VARCHAR(200),
    waypoints JSONB,
    route_geom GEOMETRY(LINESTRING, 4326),
    total_distance DECIMAL(10, 2),
    total_time INT,
    total_calories DECIMAL(8, 2),
    safety_score DECIMAL(3, 2),
    scenery_score DECIMAL(3, 2),
    red_spots JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_route_geom ON route_plan_result USING GIST(route_geom);
CREATE INDEX idx_route_user ON route_plan_result(user_id);

-- 2. 用户路线表（收藏的路线）
DROP TABLE IF EXISTS user_route CASCADE;
CREATE TABLE user_route (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    route_name VARCHAR(100),
    route_geom GEOMETRY(LINESTRING, 4326),
    start_point GEOMETRY(POINT, 4326),
    end_point GEOMETRY(POINT, 4326),
    start_name VARCHAR(200),
    end_name VARCHAR(200),
    total_distance DECIMAL(10, 2),
    total_time INT,
    is_favorite BOOLEAN DEFAULT FALSE,
    share_code VARCHAR(20) UNIQUE,
    share_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_user_route_geom ON user_route USING GIST(route_geom);
CREATE INDEX idx_user_route_user ON user_route(user_id);
CREATE INDEX idx_user_route_share ON user_route(share_code);

-- =============================================
-- 四、骑行社交层
-- =============================================

-- 1. 组队骑行表
DROP TABLE IF EXISTS team_ride CASCADE;
CREATE TABLE team_ride (
    id SERIAL PRIMARY KEY,
    creator_id INT REFERENCES "user"(id),
    title VARCHAR(100),
    description TEXT,
    route_geom GEOMETRY(LINESTRING, 4326),
    start_point GEOMETRY(POINT, 4326),
    end_point GEOMETRY(POINT, 4326),
    start_name VARCHAR(200),
    end_name VARCHAR(200),
    total_distance DECIMAL(10, 2),
    plan_start_time TIMESTAMP,
    plan_end_time TIMESTAMP,
    max_members INT DEFAULT 10,
    current_members INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'recruiting',
    invite_code VARCHAR(20) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_team_geom ON team_ride USING GIST(route_geom);
CREATE INDEX idx_team_creator ON team_ride(creator_id);

-- 2. 组队成员表
DROP TABLE IF EXISTS team_member CASCADE;
CREATE TABLE team_member (
    id SERIAL PRIMARY KEY,
    team_id INT REFERENCES team_ride(id) ON DELETE CASCADE,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    join_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'joined',
    UNIQUE(team_id, user_id)
);
CREATE INDEX idx_team_member_team ON team_member(team_id);
CREATE INDEX idx_team_member_user ON team_member(user_id);

-- =============================================
-- 五、民情处置层
-- =============================================

-- 1. 上报事件表
DROP TABLE IF EXISTS report_event CASCADE;
CREATE TABLE report_event (
    id SERIAL PRIMARY KEY,
    report_no VARCHAR(30) UNIQUE,
    user_id INT REFERENCES "user"(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    title VARCHAR(200),
    description TEXT,
    geom GEOMETRY(POINT, 4326),
    address VARCHAR(500),
    images TEXT[],
    urgency_level INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'pending',
    dept_id INT,
    handler_id INT,
    handle_note TEXT,
    handle_images TEXT[],
    handle_time TIMESTAMP,
    user_rating INT,
    user_feedback TEXT,
    points_awarded INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_report_geom ON report_event USING GIST(geom);
CREATE INDEX idx_report_user ON report_event(user_id);
CREATE INDEX idx_report_status ON report_event(status);
CREATE INDEX idx_report_no ON report_event(report_no);

-- 2. 部门表
DROP TABLE IF EXISTS dept CASCADE;
CREATE TABLE dept (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    parent_id INT REFERENCES dept(id),
    contact_phone VARCHAR(20),
    contact_address VARCHAR(200),
    responsible_types TEXT[],
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_dept_parent ON dept(parent_id);

-- 3. 上报事件处理日志
DROP TABLE IF EXISTS report_handle_log CASCADE;
CREATE TABLE report_handle_log (
    id SERIAL PRIMARY KEY,
    report_id INT REFERENCES report_event(id) ON DELETE CASCADE,
    operator_id INT,
    from_status VARCHAR(20),
    to_status VARCHAR(20),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_handle_log_report ON report_handle_log(report_id);

-- =============================================
-- 六、管理分析层
-- =============================================

-- 1. 骑行热力统计表
DROP TABLE IF EXISTS heat_map CASCADE;
CREATE TABLE heat_map (
    id SERIAL PRIMARY KEY,
    grid_geom GEOMETRY(POLYGON, 4326),
    grid_x INT,
    grid_y INT,
    ride_count INT DEFAULT 0,
    avg_speed DECIMAL(5, 2),
    stat_date DATE,
    stat_hour INT,
    user_type VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_heat_geom ON heat_map USING GIST(grid_geom);
CREATE INDEX idx_heat_date ON heat_map(stat_date);
