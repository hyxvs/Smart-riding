-- 删除日记相关的表
-- 先删除外键依赖的表
DROP TABLE IF EXISTS diary_comment;
DROP TABLE IF EXISTS diary_like;
-- 然后删除主表
DROP TABLE IF EXISTS ride_diary;

-- 清理 user_point 表中与日记相关的记录（如果有）
-- 注意：这会删除所有用户积分记录，如果你想保留其他积分记录，请注释这一行
-- DELETE FROM user_point WHERE id IN (SELECT user_id FROM ride_diary);

-- 清理 point_log 表中与日记相关的记录（如果有）
-- 注意：这会删除所有积分日志记录，如果你想保留其他积分日志记录，请注释这一行
-- DELETE FROM point_log WHERE type = 'diary';

-- 查看结果
SELECT '日记相关表删除完成' AS result;