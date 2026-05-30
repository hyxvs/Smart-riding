const { query } = require('../config/database');

// 更新用户挑战统计
async function updateUserChallengeStats(userId) {
  try {
    // 检查用户是否有统计记录
    const checkSql = `SELECT * FROM user_challenge_stats WHERE user_id = $1`;
    const checkResult = await query(checkSql, [userId]);
    
    // 获取用户完成的挑战数量
    const completedSql = `
      SELECT COUNT(*) as completed_count
      FROM challenge_participants
      WHERE user_id = $1 AND is_completed = true
    `;
    const completedResult = await query(completedSql, [userId]);
    const completedCount = parseInt(completedResult.rows[0].completed_count) || 0;
    
    // 获取用户参与的挑战数量
    const participatedSql = `
      SELECT COUNT(*) as participated_count
      FROM challenge_participants
      WHERE user_id = $1
    `;
    const participatedResult = await query(participatedSql, [userId]);
    const participatedCount = parseInt(participatedResult.rows[0].participated_count) || 0;
    
    if (checkResult.rows.length === 0) {
      // 创建新的统计记录
      const insertSql = `
        INSERT INTO user_challenge_stats (user_id, total_participated, total_completed, last_challenge_date)
        VALUES ($1, $2, $3, CURRENT_DATE)
      `;
      await query(insertSql, [userId, participatedCount, completedCount]);
      console.log(`[STATS] 为用户 ${userId} 创建统计记录: 参与 ${participatedCount}, 完成 ${completedCount}`);
    } else {
      // 更新统计记录
      const updateSql = `
        UPDATE user_challenge_stats
        SET total_participated = $1, total_completed = $2, last_challenge_date = CURRENT_DATE,
            current_streak = CASE 
              WHEN last_challenge_date = CURRENT_DATE - 1 THEN current_streak + 1
              WHEN last_challenge_date = CURRENT_DATE THEN current_streak
              ELSE 1
            END,
            longest_streak = CASE
              WHEN current_streak > longest_streak THEN current_streak
              ELSE longest_streak
            END
        WHERE user_id = $3
      `;
      await query(updateSql, [participatedCount, completedCount, userId]);
      console.log(`[STATS] 更新用户 ${userId} 统计记录: 参与 ${participatedCount}, 完成 ${completedCount}`);
    }
    
    return completedCount;
  } catch (error) {
    console.error('[STATS] 更新用户统计失败:', error);
    return 0;
  }
}

// 检查并授予徽章
async function checkAndGrantBadges(userId, completedCount) {
  try {
    // 获取用户已获得的徽章
    const earnedSql = `SELECT badge_id FROM user_badges WHERE user_id = $1`;
    const earnedResult = await query(earnedSql, [userId]);
    const earnedBadgeIds = earnedResult.rows.map(r => r.badge_id);
    
    // 获取所有徽章
    const badgesSql = `SELECT * FROM badges WHERE required_challenges <= $1`;
    const badgesResult = await query(badgesSql, [completedCount]);
    
    // 检查每个徽章是否应该授予
    for (const badge of badgesResult.rows) {
      if (!earnedBadgeIds.includes(badge.id)) {
        // 授予徽章
        const grantSql = `
          INSERT INTO user_badges (user_id, badge_id)
          VALUES ($1, $2)
        `;
        await query(grantSql, [userId, badge.id]);
        console.log(`[BADGE] 用户 ${userId} 获得徽章: ${badge.name} (需要完成 ${badge.required_challenges} 个挑战)`);
        
        // 发送通知
        await query(`
          INSERT INTO notifications (user_id, type, title, content, related_id)
          VALUES ($1, 'badge', $2, $3, $4)
        `, [userId, '获得新徽章！', `恭喜你获得"${badge.name}"徽章！`, badge.id]);
      }
    }
  } catch (error) {
    console.error('[BADGE] 检查徽章失败:', error);
  }
}

// 给用户积分奖励
async function grantPoints(userId, challengeId, points = 10) {
  try {
    // 检查用户是否有积分记录（user_points - 挑战扩展表）
    const checkSql = `SELECT * FROM user_points WHERE user_id = $1`;
    const checkResult = await query(checkSql, [userId]);
    
    if (checkResult.rows.length === 0) {
      // 创建新的积分记录
      const insertSql = `
        INSERT INTO user_points (user_id, points, total_earned)
        VALUES ($1, $2, $2)
      `;
      await query(insertSql, [userId, points]);
      console.log(`[POINTS] 为用户 ${userId} 创建积分记录: ${points} 分`);
    } else {
      // 更新积分记录
      const updateSql = `
        UPDATE user_points
        SET points = points + $1, total_earned = total_earned + $1, last_updated = NOW()
        WHERE user_id = $2
      `;
      await query(updateSql, [points, userId]);
      console.log(`[POINTS] 用户 ${userId} 获得 ${points} 积分`);
    }
    
    // 同时更新 user_point 表（主用户积分表，前端读取）
    const mainCheckSql = `SELECT * FROM user_point WHERE user_id = $1`;
    const mainCheckResult = await query(mainCheckSql, [userId]);
    
    if (mainCheckResult.rows.length === 0) {
      await query(`
        INSERT INTO user_point (user_id, total_points, available_points, used_points)
        VALUES ($1, $2, $2, 0)
      `, [userId, points]);
    } else {
      await query(`
        UPDATE user_point
        SET total_points = total_points + $1, available_points = available_points + $1, updated_at = NOW()
        WHERE user_id = $2
      `, [points, userId]);
    }
    
    // 记录积分变动到 point_transactions
    await query(`
      INSERT INTO point_transactions (user_id, type, amount, description, related_id)
      VALUES ($1, 'earn', $2, $3, $4)
    `, [userId, points, '完成挑战奖励', challengeId]);
    
    // 记录积分变动到 point_log（前端显示的流水表）
    const balanceResult = await query(`SELECT available_points FROM user_point WHERE user_id = $1`, [userId]);
    const balanceAfter = balanceResult.rows[0]?.available_points || points;
    
    await query(`
      INSERT INTO point_log (user_id, points, type, description, balance_after)
      VALUES ($1, $2, 'earn', $3, $4)
    `, [userId, points, '完成挑战奖励', balanceAfter]);
    
    // 更新用户挑战统计中的积分
    await query(`
      UPDATE user_challenge_stats
      SET total_points_earned = total_points_earned + $1
      WHERE user_id = $2
    `, [points, userId]);
  } catch (error) {
    console.error('[POINTS] 授予积分失败:', error);
  }
}

// 挑战完成时的完整奖励流程
async function processChallengeCompletion(userId, challengeId) {
  console.log(`[REWARDS] 处理用户 ${userId} 完成挑战 ${challengeId} 的奖励`);
  
  // 1. 更新用户统计
  const completedCount = await updateUserChallengeStats(userId);
  
  // 2. 检查并授予徽章
  await checkAndGrantBadges(userId, completedCount);
  
  // 3. 给用户积分奖励（根据挑战难度调整积分）
  const challengeSql = `SELECT challenge_type FROM social_challenges WHERE id = $1`;
  const challengeResult = await query(challengeSql, [challengeId]);
  const challengeType = challengeResult.rows[0]?.challenge_type || 'distance';
  
  // 不同类型的挑战给予不同积分
  let points = 10;
  if (challengeType === 'speed') points = 15;
  if (challengeType === 'duration') points = 12;
  
  await grantPoints(userId, challengeId, points);
  
  console.log(`[REWARDS] 奖励处理完成`);
}

module.exports = {
  updateUserChallengeStats,
  checkAndGrantBadges,
  grantPoints,
  processChallengeCompletion
};