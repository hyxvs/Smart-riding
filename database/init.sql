-- =============================================
-- 骑行智慧民生服务平台 - 数据库初始化脚本
-- 数据库名: cycling_smart
-- 密码: 123456
-- =============================================

-- 创建数据库（如果不存在）
-- CREATE DATABASE cycling_smart;

-- 连接数据库后执行以下内容
-- \c cycling_smart

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

-- 4. 民生事件表
DROP TABLE IF EXISTS event_livelihood CASCADE;
CREATE TABLE event_livelihood (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    title VARCHAR(200),
    description TEXT,
    geom GEOMETRY(POINT, 4326),
    address VARCHAR(500),
    severity VARCHAR(20) DEFAULT 'minor',
    status VARCHAR(20) DEFAULT 'active',
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    source VARCHAR(50),
    external_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_event_geom ON event_livelihood USING GIST(geom);
CREATE INDEX idx_event_type ON event_livelihood(event_type);
CREATE INDEX idx_event_status ON event_livelihood(status);

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

-- 5. 用户行为日志
DROP TABLE IF EXISTS user_behavior_log CASCADE;
CREATE TABLE user_behavior_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE SET NULL,
    action VARCHAR(50),
    target_type VARCHAR(50),
    target_id INT,
    extra_data JSONB,
    ip_address VARCHAR(50),
    user_agent VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_behavior_user ON user_behavior_log(user_id);
CREATE INDEX idx_behavior_time ON user_behavior_log(created_at);

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

-- 3. 路线沿途POI表
DROP TABLE IF EXISTS route_poi CASCADE;
CREATE TABLE route_poi (
    id SERIAL PRIMARY KEY,
    route_id INT REFERENCES user_route(id) ON DELETE CASCADE,
    poi_id INT REFERENCES poi(id),
    sequence INT,
    distance_from_start DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_route_poi_route ON route_poi(route_id);

-- 4. 路线规划日志表
DROP TABLE IF EXISTS route_plan_log CASCADE;
CREATE TABLE route_plan_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE SET NULL,
    start_point GEOMETRY(POINT, 4326),
    end_point GEOMETRY(POINT, 4326),
    plan_mode VARCHAR(50),
    algorithm_used VARCHAR(50),
    compute_time_ms INT,
    success BOOLEAN,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_plan_log_user ON route_plan_log(user_id);

-- =============================================
-- 四、骑行社交层
-- =============================================

-- 1. 骑行日记表
DROP TABLE IF EXISTS ride_diary CASCADE;
CREATE TABLE ride_diary (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    title VARCHAR(100),
    content TEXT,
    track_geom GEOMETRY(LINESTRING, 4326),
    start_point GEOMETRY(POINT, 4326),
    end_point GEOMETRY(POINT, 4326),
    start_name VARCHAR(200),
    end_name VARCHAR(200),
    total_distance DECIMAL(10, 2),
    total_time INT,
    avg_speed DECIMAL(5, 2),
    max_speed DECIMAL(5, 2),
    calories DECIMAL(8, 2),
    photos TEXT[],
    markers JSONB,
    privacy VARCHAR(20) DEFAULT 'public',
    like_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    view_count INT DEFAULT 0,
    is_draft BOOLEAN DEFAULT FALSE,
    ride_start_time TIMESTAMP,
    ride_end_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_diary_geom ON ride_diary USING GIST(track_geom);
CREATE INDEX idx_diary_user ON ride_diary(user_id);
CREATE INDEX idx_diary_privacy ON ride_diary(privacy);

-- 2. 日记点赞表
DROP TABLE IF EXISTS diary_like CASCADE;
CREATE TABLE diary_like (
    id SERIAL PRIMARY KEY,
    diary_id INT REFERENCES ride_diary(id) ON DELETE CASCADE,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(diary_id, user_id)
);
CREATE INDEX idx_diary_like_diary ON diary_like(diary_id);
CREATE INDEX idx_diary_like_user ON diary_like(user_id);

-- 3. 日记评论表
DROP TABLE IF EXISTS diary_comment CASCADE;
CREATE TABLE diary_comment (
    id SERIAL PRIMARY KEY,
    diary_id INT REFERENCES ride_diary(id) ON DELETE CASCADE,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    parent_id INT REFERENCES diary_comment(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    like_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_comment_diary ON diary_comment(diary_id);
CREATE INDEX idx_comment_user ON diary_comment(user_id);

-- 4. 组队骑行表
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

-- 5. 组队成员表
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

-- 2. 舆情监控表
DROP TABLE IF EXISTS opinion_monitor CASCADE;
CREATE TABLE opinion_monitor (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50),
    source_id VARCHAR(100),
    content TEXT,
    sentiment VARCHAR(20),
    sentiment_score DECIMAL(3, 2),
    keywords TEXT[],
    topic_id INT,
    is_processed BOOLEAN DEFAULT FALSE,
    is_alert BOOLEAN DEFAULT FALSE,
    alert_level INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_opinion_source ON opinion_monitor(source);
CREATE INDEX idx_opinion_sentiment ON opinion_monitor(sentiment);
CREATE INDEX idx_opinion_time ON opinion_monitor(created_at);

-- 3. 舆情话题表
DROP TABLE IF EXISTS opinion_topic CASCADE;
CREATE TABLE opinion_topic (
    id SERIAL PRIMARY KEY,
    topic_name VARCHAR(200),
    topic_keywords TEXT[],
    mention_count INT DEFAULT 0,
    trend VARCHAR(20),
    first_mention TIMESTAMP,
    last_mention TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_topic_name ON opinion_topic(topic_name);

-- 4. 数据编辑日志
DROP TABLE IF EXISTS data_edit_log CASCADE;
CREATE TABLE data_edit_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50),
    record_id INT,
    operation VARCHAR(20),
    old_data JSONB,
    new_data JSONB,
    operator_id INT REFERENCES "user"(id),
    operator_ip VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_edit_log_table ON data_edit_log(table_name);
CREATE INDEX idx_edit_log_record ON data_edit_log(record_id);

-- =============================================
-- 七、特色功能层
-- =============================================

-- 1. 红色地理围栏表
DROP TABLE IF EXISTS red_geofence CASCADE;
CREATE TABLE red_geofence (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    geom GEOMETRY(POLYGON, 4326),
    poi_id INT REFERENCES poi(id),
    audio_guide VARCHAR(500),
    video_url VARCHAR(500),
    visit_points INT DEFAULT 10,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_red_geofence_geom ON red_geofence USING GIST(geom);

-- 2. 红色骑行证书表
DROP TABLE IF EXISTS red_certificate CASCADE;
CREATE TABLE red_certificate (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    certificate_no VARCHAR(50) UNIQUE,
    route_name VARCHAR(100),
    red_spots_visited INT,
    total_distance DECIMAL(10, 2),
    issue_date DATE,
    certificate_image VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_cert_user ON red_certificate(user_id);
CREATE INDEX idx_cert_no ON red_certificate(certificate_no);

-- 3. AI骑行知识库
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
CREATE INDEX idx_knowledge_category ON ai_knowledge(category);

-- 4. AI对话记录表
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
CREATE INDEX idx_chat_user ON ai_chat_log(user_id);
CREATE INDEX idx_chat_session ON ai_chat_log(session_id);

-- =============================================
-- 八、系统配置层
-- =============================================

-- 1. 系统配置表
DROP TABLE IF EXISTS system_config CASCADE;
CREATE TABLE system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE,
    config_value TEXT,
    description VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 消息通知表
DROP TABLE IF EXISTS notification CASCADE;
CREATE TABLE notification (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    title VARCHAR(100),
    content TEXT,
    type VARCHAR(50),
    is_read BOOLEAN DEFAULT FALSE,
    extra_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notification_user ON notification(user_id);
CREATE INDEX idx_notification_read ON notification(is_read);

-- 3. 用户订阅表（路况订阅）
DROP TABLE IF EXISTS user_subscription CASCADE;
CREATE TABLE user_subscription (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    sub_type VARCHAR(50),
    sub_target VARCHAR(200),
    geom GEOMETRY(GEOMETRY, 4326),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sub_user ON user_subscription(user_id);
CREATE INDEX idx_sub_geom ON user_subscription USING GIST(geom);

-- =============================================
-- 插入初始数据
-- =============================================

-- 插入默认管理员
INSERT INTO "user" (phone, password_hash, nickname, role, status) 
VALUES ('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZRGdjGj/n3.iW8jY9D6aV3xV9xKCe', '系统管理员', 'admin', 'active');

-- 插入默认部门
INSERT INTO dept (name, responsible_types) VALUES 
('市政管理部', ARRAY['道路破损', '井盖缺失', '路灯故障']),
('交通管理部', ARRAY['交通信号', '道路拥堵', '违章停车']),
('园林绿化部', ARRAY['树木倒伏', '绿化缺失', '公园设施']),
('环境卫生部', ARRAY['垃圾堆积', '污水外溢', '扬尘污染']);

-- 插入系统配置
INSERT INTO system_config (config_key, config_value, description) VALUES
('map_center_lng', '114.935', '地图中心经度'),
('map_center_lat', '25.845', '地图中心纬度'),
('map_zoom', '12', '地图默认缩放级别'),
('point_rule_report', '10', '上报事件积分奖励'),
('point_rule_diary', '5', '发布日记积分奖励'),
('point_rule_like', '1', '获得点赞积分奖励');

-- 插入AI知识库示例
INSERT INTO ai_knowledge (category, question, answer, keywords) VALUES
('骑行安全', '骑行时应该注意什么？', '骑行时请注意：1.佩戴安全头盔；2.遵守交通规则；3.保持安全车距；4.注意路况变化；5.夜间开启车灯。', ARRAY['安全', '注意事项', '骑行']),
('路线规划', '如何规划骑行路线？', '您可以通过以下方式规划路线：1.在地图上点击起点和终点；2.使用搜索框输入地名；3.使用语音指令"小虔，帮我规划从XX到XX的路线"。系统支持最快、最短、最安全、风景、红色研学五种模式。', ARRAY['路线', '规划', '导航']),
('红色景点', '赣州有哪些红色景点？', '赣州是著名的红色革命老区，主要红色景点包括：瑞金共和国摇篮景区、于都长征出发地、兴国将军园、宁都起义纪念馆等。您可以选择红色研学路线，系统会自动串联相关景点并提供讲解。', ARRAY['红色', '景点', '革命']);

-- =============================================
-- 创建视图
-- =============================================

-- 路况统计视图
CREATE OR REPLACE VIEW v_traffic_stats AS
SELECT 
    road_id,
    AVG(congestion_level) as avg_congestion,
    AVG(avg_speed) as avg_speed,
    COUNT(*) as record_count
FROM traffic_realtime
WHERE record_time > NOW() - INTERVAL '1 hour'
GROUP BY road_id;

-- 用户统计视图
CREATE OR REPLACE VIEW v_user_stats AS
SELECT 
    u.id,
    u.nickname,
    u.role,
    COALESCE(up.total_points, 0) as total_points,
    COALESCE(up.level, 1) as level,
    (SELECT COUNT(*) FROM ride_diary WHERE user_id = u.id) as diary_count,
    (SELECT COUNT(*) FROM report_event WHERE user_id = u.id) as report_count
FROM "user" u
LEFT JOIN user_point up ON u.id = up.user_id;

-- =============================================
-- 创建函数
-- =============================================

-- 生成上报编号函数
CREATE OR REPLACE FUNCTION generate_report_no()
RETURNS VARCHAR AS $$
DECLARE
    v_no VARCHAR(30);
BEGIN
    v_no := 'RPT' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(nextval('report_no_seq')::TEXT, 6, '0');
    RETURN v_no;
END;
$$ LANGUAGE plpgsql;

-- 创建序列
CREATE SEQUENCE IF NOT EXISTS report_no_seq START 1;

-- 更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为需要的表添加更新时间触发器
CREATE TRIGGER update_road_updated_at BEFORE UPDATE ON road FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_poi_updated_at BEFORE UPDATE ON poi FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_user_updated_at BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_user_route_updated_at BEFORE UPDATE ON user_route FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_diary_updated_at BEFORE UPDATE ON ride_diary FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_report_updated_at BEFORE UPDATE ON report_event FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 完成
-- =============================================
SELECT 'Database initialization completed!' as message;
