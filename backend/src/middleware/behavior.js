const { query } = require('../config/database');

const logBehavior = async (userId, action, targetType, targetId, extraData, ip) => {
  try {
    await query(
      `INSERT INTO user_behavior_log (user_id, action, target_type, target_id, extra_data, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, targetType, targetId, JSON.stringify(extraData), ip]
    );
  } catch (error) {
    console.error('记录行为日志失败:', error);
  }
};

module.exports = { logBehavior };
