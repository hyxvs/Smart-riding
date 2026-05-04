-- 行程规划表
DROP TABLE IF EXISTS trip_plan CASCADE;
CREATE TABLE trip_plan (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE SET NULL,
    session_id VARCHAR(50),
    destination VARCHAR(200) NOT NULL,
    duration_days INT NOT NULL,
    budget DECIMAL(10, 2),
    interests JSONB,
    status VARCHAR(20) DEFAULT 'planning',
    total_distance DECIMAL(10, 2),
    total_time INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_trip_plan_user ON trip_plan(user_id);
CREATE INDEX idx_trip_plan_session ON trip_plan(session_id);

-- 每日行程表
DROP TABLE IF EXISTS day_plan CASCADE;
CREATE TABLE day_plan (
    id SERIAL PRIMARY KEY,
    trip_plan_id INT REFERENCES trip_plan(id) ON DELETE CASCADE,
    day_number INT NOT NULL,
    date DATE,
    start_time TIME,
    end_time TIME,
    theme VARCHAR(100),
    total_distance DECIMAL(10, 2),
    total_time INT,
    weather_info JSONB,
    tips TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_day_plan_trip ON day_plan(trip_plan_id);

-- 行程景点表
DROP TABLE IF EXISTS trip_attraction CASCADE;
CREATE TABLE trip_attraction (
    id SERIAL PRIMARY KEY,
    day_plan_id INT REFERENCES day_plan(id) ON DELETE CASCADE,
    poi_id INT REFERENCES poi(id),
    sequence INT NOT NULL,
    arrival_time TIME,
    departure_time TIME,
    stay_duration INT,
    visit_type VARCHAR(50),
    tickets DECIMAL(8, 2),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_trip_attraction_day ON trip_attraction(day_plan_id);

-- 餐饮推荐表
DROP TABLE IF EXISTS trip_restaurant CASCADE;
CREATE TABLE trip_restaurant (
    id SERIAL PRIMARY KEY,
    day_plan_id INT REFERENCES day_plan(id) ON DELETE CASCADE,
    poi_id INT REFERENCES poi(id),
    meal_type VARCHAR(20) NOT NULL,
    sequence INT NOT NULL,
    arrival_time TIME,
    budget DECIMAL(8, 2),
    recommended_dishes JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_trip_restaurant_day ON trip_restaurant(day_plan_id);

-- 住宿推荐表
DROP TABLE IF EXISTS trip_accommodation CASCADE;
CREATE TABLE trip_accommodation (
    id SERIAL PRIMARY KEY,
    trip_plan_id INT REFERENCES trip_plan(id) ON DELETE CASCADE,
    day_plan_id INT REFERENCES day_plan(id) ON DELETE CASCADE,
    poi_id INT REFERENCES poi(id),
    check_in_date DATE,
    check_out_date DATE,
    price DECIMAL(8, 2),
    room_type VARCHAR(50),
    facilities JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_trip_accommodation_trip ON trip_accommodation(trip_plan_id);
CREATE INDEX idx_trip_accommodation_day ON trip_accommodation(day_plan_id);

-- 预算明细表
DROP TABLE IF EXISTS trip_budget CASCADE;
CREATE TABLE trip_budget (
    id SERIAL PRIMARY KEY,
    trip_plan_id INT REFERENCES trip_plan(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    item_name VARCHAR(100),
    estimated_cost DECIMAL(8, 2) NOT NULL,
    actual_cost DECIMAL(8, 2),
    quantity INT DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_trip_budget_trip ON trip_budget(trip_plan_id);

-- 行程路线表
DROP TABLE IF EXISTS trip_route CASCADE;
CREATE TABLE trip_route (
    id SERIAL PRIMARY KEY,
    day_plan_id INT REFERENCES day_plan(id) ON DELETE CASCADE,
    route_geom GEOMETRY(LINESTRING, 4326),
    start_point GEOMETRY(POINT, 4326),
    end_point GEOMETRY(POINT, 4326),
    total_distance DECIMAL(10, 2),
    total_time INT,
    waypoints JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_trip_route_day ON trip_route(day_plan_id);
CREATE INDEX idx_trip_route_geom ON trip_route USING GIST(route_geom);
