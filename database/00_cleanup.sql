-- =============================================
-- ⚠️ 仅用于新数据库初始化
-- 此文件用于清理重复/旧版表
-- 执行顺序: 0（在所有表创建之前执行）
-- =============================================

-- =============================================
-- 删除重复的旧版表（保留功能更完整的版本）
-- =============================================

-- 1. 删除 notification 表（保留 notifications 表，功能更完整）
DROP TABLE IF EXISTS notification CASCADE;

-- 2. 删除 point_transactions 表（保留 point_log 表，功能更完整）
DROP TABLE IF EXISTS point_transactions CASCADE;

-- 3. team_member 表保留（字段更多，包含 status），team_members 表保留（challenge_teams 需要）
-- 注意：这两个表用途不同，不删除

-- 4. user_point 和 user_points 功能重复，但 user_points 在 challenge_extensions 中使用
-- 保留 user_points，user_point 在 init.sql 中定义
