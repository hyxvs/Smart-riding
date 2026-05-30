-- =============================================
-- ⚠️ 仅用于新数据库初始化
-- 智能装备管家 - 数据库表结构
-- 执行顺序: 2
-- =============================================

-- 1. 装备主表
DROP TABLE IF EXISTS equipment CASCADE;
CREATE TABLE equipment (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    brand VARCHAR(100),
    model VARCHAR(100),
    purchase_date DATE,
    purchase_price DECIMAL(10, 2),
    total_distance DECIMAL(10, 2) DEFAULT 0,
    current_mileage DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    images TEXT[],
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_equipment_user ON equipment(user_id);
CREATE INDEX idx_equipment_category ON equipment(category);
CREATE INDEX idx_equipment_status ON equipment(status);

-- 2. 装备分类表（支持自定义分类）
DROP TABLE IF EXISTS equipment_category CASCADE;
CREATE TABLE equipment_category (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    icon VARCHAR(50),
    maintenance_interval_days INT DEFAULT 90,
    mileage_interval_km DECIMAL(10, 2) DEFAULT 500,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_equip_category_user ON equipment_category(user_id);

-- 3. 保养记录表
DROP TABLE IF EXISTS equipment_maintenance CASCADE;
CREATE TABLE equipment_maintenance (
    id SERIAL PRIMARY KEY,
    equipment_id INT REFERENCES equipment(id) ON DELETE CASCADE,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    maintenance_type VARCHAR(50) NOT NULL,
    description TEXT,
    maintenance_date DATE NOT NULL,
    cost DECIMAL(10, 2) DEFAULT 0,
    mileage_at_maintenance DECIMAL(10, 2) DEFAULT 0,
    service_provider VARCHAR(200),
    contact_phone VARCHAR(20),
    next_maintenance_date DATE,
    next_mileage DECIMAL(10, 2),
    images TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_maintenance_equipment ON equipment_maintenance(equipment_id);
CREATE INDEX idx_maintenance_user ON equipment_maintenance(user_id);
CREATE INDEX idx_maintenance_date ON equipment_maintenance(maintenance_date);

-- 4. 保养提醒表
DROP TABLE IF EXISTS maintenance_reminder CASCADE;
CREATE TABLE maintenance_reminder (
    id SERIAL PRIMARY KEY,
    equipment_id INT REFERENCES equipment(id) ON DELETE CASCADE,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    reminder_type VARCHAR(20) NOT NULL,
    remind_at DATE NOT NULL,
    mileage DECIMAL(10, 2),
    message TEXT,
    is_reminded BOOLEAN DEFAULT FALSE,
    reminded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_reminder_equipment ON maintenance_reminder(equipment_id);
CREATE INDEX idx_reminder_user ON maintenance_reminder(user_id);
CREATE INDEX idx_reminder_remind_at ON maintenance_reminder(remind_at);

-- =============================================
-- 修复装备分类表结构（支持user_id为NULL）
-- =============================================
ALTER TABLE equipment_category 
DROP CONSTRAINT IF EXISTS equipment_category_user_id_fkey;

ALTER TABLE equipment_category 
ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE equipment_category 
ADD CONSTRAINT equipment_category_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

-- =============================================
-- 初始化默认装备分类
-- =============================================
INSERT INTO equipment_category (user_id, name, icon, maintenance_interval_days, mileage_interval_km) VALUES
(NULL, '公路车', '🚴', 60, 300),
(NULL, '山地车', '🏔️', 45, 200),
(NULL, '城市通勤车', '🏙️', 90, 500),
(NULL, '折叠车', '📦', 90, 400),
(NULL, '电动车', '⚡', 30, 1000),
(NULL, '头盔', '⛑️', 365, 0),
(NULL, '码表', '⌚', 365, 0),
(NULL, '车灯', '💡', 180, 0),
(NULL, '锁具', '🔒', 90, 0),
(NULL, '打气筒', '🔧', 180, 0);
