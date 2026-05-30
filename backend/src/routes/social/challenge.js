const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const { auth } = require('../../middleware/auth');

// ==================== 挑战分类与发现 ====================

// 获取挑战分类列表
router.get('/categories', auth, async (req, res) => {
  try {
    const categories = [
      { id: 'distance', name: '距离挑战', icon: '📏' },
      { id: 'duration', name: '时长挑战', icon: '⏱️' },
      { id: 'count', name: '次数挑战', icon: '🔢' },
      { id: 'speed', name: '速度挑战', icon: '⚡' }
    ];
    
    const difficultyLevels = [
      { id: 'beginner', name: '初级', color: '#10B981' },
      { id: 'intermediate', name: '中级', color: '#F59E0B' },
      { id: 'advanced', name: '高级', color: '#EF4444' }
    ];

    res.json({
      code: 200,
      data: { categories, difficultyLevels }
    });
  } catch (error) {
    console.error('获取分类失败:', error);
    res.status(500).json({ code: 500, message: '获取分类失败' });
  }
});

// 获取热门挑战
router.get('/popular', auth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const sql = `
      SELECT c.*,
             (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = c.id) as current_participants,
             EXISTS(SELECT 1 FROM challenge_participants WHERE challenge_id = c.id AND user_id = $1) as is_participated,
             (SELECT progress FROM challenge_participants WHERE challenge_id = c.id AND user_id = $1) as my_progress
      FROM social_challenges c
      WHERE c.status = 'active'
      ORDER BY current_participants DESC
      LIMIT $2
    `;

    const result = await query(sql, [req.userId, limit]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取热门挑战失败:', error);
    res.status(500).json({ code: 500, message: '获取热门挑战失败' });
  }
});

// 获取推荐挑战（基于用户骑行习惯）
router.get('/recommendations', auth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const sql = `
      SELECT c.*,
             (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = c.id) as participant_count,
             EXISTS(SELECT 1 FROM challenge_participants WHERE challenge_id = c.id AND user_id = $1) as is_participated,
             (SELECT progress FROM challenge_participants WHERE challenge_id = c.id AND user_id = $1) as my_progress
      FROM social_challenges c
      WHERE c.status = 'active'
        AND c.id NOT IN (SELECT challenge_id FROM challenge_participants WHERE user_id = $1)
      ORDER BY c.participant_count DESC, c.created_at DESC
      LIMIT $2
    `;

    const result = await query(sql, [req.userId, limit]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取推荐挑战失败:', error);
    res.status(500).json({ code: 500, message: '获取推荐挑战失败' });
  }
});

// 按难度和类型筛选挑战
router.get('/filter', auth, async (req, res) => {
  try {
    const { challenge_type, status = 'active', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT c.*,
             (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = c.id) as participant_count,
             EXISTS(SELECT 1 FROM challenge_participants WHERE challenge_id = c.id AND user_id = $1) as is_participated,
             (SELECT progress FROM challenge_participants WHERE challenge_id = c.id AND user_id = $1) as my_progress
      FROM social_challenges c
      WHERE c.status = $2
    `;

    const params = [req.userId, status];
    let paramCount = 3;

    if (challenge_type) {
      sql += ` AND c.challenge_type = $${paramCount++}`;
      params.push(challenge_type);
    }

    sql += ` ORDER BY c.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    const countSql = `
      SELECT COUNT(*) FROM social_challenges c WHERE c.status = $1
      ${challenge_type ? `AND c.challenge_type = '${challenge_type}'` : ''}
    `;
    const countResult = await query(countSql, [status]);

    res.json({
      code: 200,
      data: {
        list: result.rows,
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('筛选挑战失败:', error);
    res.status(500).json({ code: 500, message: '筛选挑战失败' });
  }
});

// ==================== 徽章系统 ====================

// 获取徽章列表
router.get('/badges', auth, async (req, res) => {
  try {
    const sql = `
      SELECT b.*,
             EXISTS(SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = b.id) as is_earned,
             (SELECT earned_at FROM user_badges WHERE user_id = $1 AND badge_id = b.id) as earned_at
      FROM badges b
      ORDER BY b.rarity, b.required_challenges
    `;

    const result = await query(sql, [req.userId]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取徽章失败:', error);
    res.status(500).json({ code: 500, message: '获取徽章失败' });
  }
});

// 获取用户已获得的徽章
router.get('/badges/user', auth, async (req, res) => {
  try {
    const sql = `
      SELECT b.*, ub.earned_at
      FROM user_badges ub
      JOIN badges b ON ub.badge_id = b.id
      WHERE ub.user_id = $1
      ORDER BY ub.earned_at DESC
    `;

    const result = await query(sql, [req.userId]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取用户徽章失败:', error);
    res.status(500).json({ code: 500, message: '获取用户徽章失败' });
  }
});

// ==================== 积分系统 ====================

// 获取用户积分
router.get('/points', auth, async (req, res) => {
  try {
    const sql = `
      SELECT * FROM user_points WHERE user_id = $1
    `;

    const result = await query(sql, [req.userId]);

    if (result.rows.length === 0) {
      await query(`INSERT INTO user_points (user_id) VALUES ($1)`, [req.userId]);
      return res.json({ code: 200, data: { user_id: req.userId, points: 0, total_earned: 0 } });
    }

    res.json({ code: 200, data: result.rows[0] });
  } catch (error) {
    console.error('获取积分失败:', error);
    res.status(500).json({ code: 500, message: '获取积分失败' });
  }
});

// 获取积分变动记录
router.get('/points/history', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const sql = `
      SELECT * FROM point_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [req.userId, limit, offset]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取积分记录失败:', error);
    res.status(500).json({ code: 500, message: '获取积分记录失败' });
  }
});

// ==================== 成就排行榜 ====================

// 获取挑战成就排行榜
router.get('/leaderboard/achievements', auth, async (req, res) => {
  try {
    const sql = `
      SELECT u.id, u.nickname, u.avatar,
             COALESCE(ups.points, 0) as points,
             COALESCE(ucs.total_completed, 0) as completed_challenges,
             COALESCE(ub.count, 0) as badge_count
      FROM "user" u
      LEFT JOIN user_points ups ON u.id = ups.user_id
      LEFT JOIN user_challenge_stats ucs ON u.id = ucs.user_id
      LEFT JOIN (SELECT user_id, COUNT(*) as count FROM user_badges GROUP BY user_id) ub ON u.id = ub.user_id
      ORDER BY COALESCE(ups.points, 0) DESC
      LIMIT 50
    `;

    const result = await query(sql);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取成就排行榜失败:', error);
    res.status(500).json({ code: 500, message: '获取成就排行榜失败' });
  }
});

// ==================== 好友PK ====================

// 发起PK挑战
router.post('/duel/request', auth, async (req, res) => {
  try {
    const { challenged_id, challenge_id } = req.body;

    if (req.userId === challenged_id) {
      return res.status(400).json({ code: 400, message: '不能挑战自己' });
    }

    const checkSql = `SELECT id FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2`;
    const [challengerCheck, challengedCheck] = await Promise.all([
      query(checkSql, [challenge_id, req.userId]),
      query(checkSql, [challenge_id, challenged_id])
    ]);

    if (challengerCheck.rows.length === 0) {
      return res.status(400).json({ code: 400, message: '你需要先参加该挑战' });
    }

    if (challengedCheck.rows.length === 0) {
      return res.status(400).json({ code: 400, message: '对方未参加该挑战' });
    }

    const existingDuel = await query(
      `SELECT id FROM challenge_duels WHERE (challenger_id = $1 AND challenged_id = $2 AND challenge_id = $3) OR (challenger_id = $2 AND challenged_id = $1 AND challenge_id = $3)`,
      [req.userId, challenged_id, challenge_id]
    );

    if (existingDuel.rows.length > 0) {
      return res.status(400).json({ code: 400, message: '已存在PK请求' });
    }

    const insertSql = `
      INSERT INTO challenge_duels (challenger_id, challenged_id, challenge_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await query(insertSql, [req.userId, challenged_id, challenge_id]);

    res.json({ code: 200, message: 'PK请求已发送', data: result.rows[0] });
  } catch (error) {
    console.error('发起PK失败:', error);
    res.status(500).json({ code: 500, message: '发起PK失败' });
  }
});

// 接受/拒绝PK挑战
router.post('/duel/:id/respond', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { accept } = req.body;

    const checkSql = `SELECT * FROM challenge_duels WHERE id = $1 AND challenged_id = $2`;
    const result = await query(checkSql, [id, req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: 'PK请求不存在' });
    }

    const duel = result.rows[0];

    if (duel.status !== 'pending') {
      return res.status(400).json({ code: 400, message: 'PK请求已处理' });
    }

    if (accept) {
      await query(`UPDATE challenge_duels SET status = 'accepted' WHERE id = $1`, [id]);
      res.json({ code: 200, message: '已接受PK挑战' });
    } else {
      await query(`UPDATE challenge_duels SET status = 'completed' WHERE id = $1`, [id]);
      res.json({ code: 200, message: '已拒绝PK挑战' });
    }
  } catch (error) {
    console.error('处理PK请求失败:', error);
    res.status(500).json({ code: 500, message: '处理PK请求失败' });
  }
});

// 获取用户的PK列表
router.get('/duels', auth, async (req, res) => {
  try {
    const sql = `
      SELECT d.*,
             c.title as challenge_title,
             u1.nickname as challenger_nickname,
             u1.avatar as challenger_avatar,
             u2.nickname as challenged_nickname,
             u2.avatar as challenged_avatar
      FROM challenge_duels d
      JOIN social_challenges c ON d.challenge_id = c.id
      JOIN "user" u1 ON d.challenger_id = u1.id
      JOIN "user" u2 ON d.challenged_id = u2.id
      WHERE d.challenger_id = $1 OR d.challenged_id = $1
      ORDER BY d.created_at DESC
    `;

    const result = await query(sql, [req.userId]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取PK列表失败:', error);
    res.status(500).json({ code: 500, message: '获取PK列表失败' });
  }
});

// ==================== 组队挑战 ====================

// 创建团队
router.post('/teams', auth, async (req, res) => {
  try {
    const { name, description, challenge_id, max_members = 5 } = req.body;

    const checkSql = `SELECT id FROM social_challenges WHERE id = $1 AND status = 'active'`;
    const checkResult = await query(checkSql, [challenge_id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '挑战不存在或已结束' });
    }

    const insertSql = `
      INSERT INTO challenge_teams (name, description, challenge_id, max_members, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await query(insertSql, [name, description, challenge_id, max_members, req.userId]);
    const teamId = result.rows[0].id;

    await query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'leader')`, [teamId, req.userId]);

    res.json({ code: 200, message: '团队创建成功', data: result.rows[0] });
  } catch (error) {
    console.error('创建团队失败:', error);
    res.status(500).json({ code: 500, message: '创建团队失败' });
  }
});

// 加入团队
router.post('/teams/:id/join', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const checkSql = `
      SELECT t.*, COUNT(tm.id) as member_count
      FROM challenge_teams t
      LEFT JOIN team_members tm ON t.id = tm.team_id
      WHERE t.id = $1
      GROUP BY t.id
    `;

    const result = await query(checkSql, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '团队不存在' });
    }

    const team = result.rows[0];

    if (team.member_count >= team.max_members) {
      return res.status(400).json({ code: 400, message: '团队已满员' });
    }

    const memberCheck = await query(`SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2`, [id, req.userId]);

    if (memberCheck.rows.length > 0) {
      return res.status(400).json({ code: 400, message: '已加入该团队' });
    }

    await query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [id, req.userId]);

    res.json({ code: 200, message: '加入团队成功' });
  } catch (error) {
    console.error('加入团队失败:', error);
    res.status(500).json({ code: 500, message: '加入团队失败' });
  }
});

// 退出团队
router.post('/teams/:id/leave', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const checkSql = `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`;
    const result = await query(checkSql, [id, req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '未加入该团队' });
    }

    if (result.rows[0].role === 'leader') {
      return res.status(400).json({ code: 400, message: '队长不能退出团队，请先转让队长' });
    }

    await query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [id, req.userId]);

    res.json({ code: 200, message: '退出团队成功' });
  } catch (error) {
    console.error('退出团队失败:', error);
    res.status(500).json({ code: 500, message: '退出团队失败' });
  }
});

// 获取挑战的团队列表
router.get('/teams/challenge/:challengeId', auth, async (req, res) => {
  try {
    const { challengeId } = req.params;

    const sql = `
      SELECT t.*,
             COUNT(tm.id) as member_count,
             EXISTS(SELECT 1 FROM team_members WHERE team_id = t.id AND user_id = $1) as is_member
      FROM challenge_teams t
      LEFT JOIN team_members tm ON t.id = tm.team_id
      WHERE t.challenge_id = $2
      GROUP BY t.id
      ORDER BY member_count DESC
    `;

    const result = await query(sql, [req.userId, challengeId]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取团队列表失败:', error);
    res.status(500).json({ code: 500, message: '获取团队列表失败' });
  }
});

// 获取团队详情
router.get('/teams/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const teamSql = `SELECT * FROM challenge_teams WHERE id = $1`;
    const teamResult = await query(teamSql, [id]);

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '团队不存在' });
    }

    const membersSql = `
      SELECT tm.*, u.nickname, u.avatar
      FROM team_members tm
      JOIN "user" u ON tm.user_id = u.id
      WHERE tm.team_id = $1
      ORDER BY tm.role DESC, tm.joined_at ASC
    `;

    const membersResult = await query(membersSql, [id]);

    res.json({
      code: 200,
      data: {
        team: teamResult.rows[0],
        members: membersResult.rows
      }
    });
  } catch (error) {
    console.error('获取团队详情失败:', error);
    res.status(500).json({ code: 500, message: '获取团队详情失败' });
  }
});

// ==================== 用户创建挑战 ====================

// 用户创建挑战（5秒后自动审核通过）
router.post('/create', auth, async (req, res) => {
  try {
    console.log(`[CHALLENGE CREATE] 用户 ${req.userId} 开始创建挑战`);
    console.log(`[CHALLENGE CREATE] 请求体:`, req.body);
    
    const { title, description, challenge_type, target_value, target_unit, start_date, end_date, difficulty_level } = req.body;

    // 注意：数据库中没有 difficulty_level 和 is_featured 字段，先不插入
    const insertSql = `
      INSERT INTO social_challenges (
        title, description, challenge_type, target_value, target_unit,
        start_date, end_date, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
      RETURNING *
    `;

    const result = await query(insertSql, [title, description, challenge_type, target_value, target_unit, start_date, end_date, req.userId]);
    const challengeId = result.rows[0].id;

    console.log(`[CHALLENGE CREATE] 挑战 ${challengeId} 创建成功！标题: ${title}`);

    // 创建者自动参与挑战
    await query(`INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2)`, [challengeId, req.userId]);
    await query(`UPDATE social_challenges SET participant_count = participant_count + 1 WHERE id = $1`, [challengeId]);

    console.log(`创建者已自动参与挑战 ${challengeId}`);
    console.log(`挑战 ${challengeId}，5秒后自动审核...`);

    // 5秒后自动审核通过
    setTimeout(async () => {
      try {
        const updateSql = `UPDATE social_challenges SET status = 'active' WHERE id = $1 AND status = 'pending' RETURNING *`;
        const updateResult = await query(updateSql, [challengeId]);
        if (updateResult.rows.length > 0) {
          console.log(`挑战 ${challengeId} 已自动审核通过！`);
        } else {
          console.log(`挑战 ${challengeId} 审核失败或已审核`);
        }
      } catch (error) {
        console.error(`挑战 ${challengeId} 自动审核失败:`, error);
      }
    }, 5000);

    res.json({ code: 200, message: '挑战创建成功，等待审核（5秒后自动通过）', data: result.rows[0] });
  } catch (error) {
    console.error('创建挑战失败:', error);
    res.status(500).json({ code: 500, message: '创建挑战失败：' + error.message });
  }
});

// 获取待审核挑战列表（管理员）
router.get('/pending', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const sql = `
      SELECT c.*, u.nickname as creator_nickname, u.avatar as creator_avatar
      FROM social_challenges c
      JOIN "user" u ON c.created_by = u.id
      WHERE c.status = 'pending'
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await query(sql, [limit, offset]);

    const countResult = await query(`SELECT COUNT(*) FROM social_challenges WHERE status = 'pending'`);

    res.json({
      code: 200,
      data: {
        list: result.rows,
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取待审核挑战失败:', error);
    res.status(500).json({ code: 500, message: '获取待审核挑战失败' });
  }
});

// 审核挑战（管理员）
router.post('/:id/approve', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { approve } = req.body;

    const updateSql = `
      UPDATE social_challenges
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(updateSql, [approve ? 'active' : 'rejected', id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '挑战不存在' });
    }

    res.json({ code: 200, message: approve ? '挑战已通过审核' : '挑战已拒绝' });
  } catch (error) {
    console.error('审核挑战失败:', error);
    res.status(500).json({ code: 500, message: '审核挑战失败' });
  }
});

// 编辑挑战
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    const checkSql = `SELECT created_by, status FROM social_challenges WHERE id = $1`;
    const checkResult = await query(checkSql, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '挑战不存在' });
    }

    if (checkResult.rows[0].created_by !== req.userId) {
      return res.status(403).json({ code: 403, message: '无权限编辑' });
    }

    let updateFields = [];
    let params = [];
    let paramCount = 1;

    if (title) {
      updateFields.push(`title = $${paramCount++}`);
      params.push(title);
    }
    if (description) {
      updateFields.push(`description = $${paramCount++}`);
      params.push(description);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ code: 400, message: '没有需要更新的字段' });
    }

    updateFields.push(`updated_at = NOW()`);
    params.push(id);

    const updateSql = `UPDATE social_challenges SET ${updateFields.join(', ')} WHERE id = $${paramCount}`;
    await query(updateSql, params);

    res.json({ code: 200, message: '挑战更新成功' });
  } catch (error) {
    console.error('编辑挑战失败:', error);
    res.status(500).json({ code: 500, message: '编辑挑战失败' });
  }
});

// ==================== 挑战统计分析 ====================

// 获取挑战统计
router.get('/stats/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const statsSql = `
      SELECT
        (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = $1) as total_participants,
        (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = $1 AND is_completed = TRUE) as completed_count,
        (SELECT AVG(progress) FROM challenge_participants WHERE challenge_id = $1) as avg_progress,
        (SELECT MAX(progress) FROM challenge_participants WHERE challenge_id = $1) as max_progress
      FROM social_challenges WHERE id = $1
    `;

    const result = await query(statsSql, [id]);

    const completionRate = result.rows[0].total_participants > 0
      ? (result.rows[0].completed_count / result.rows[0].total_participants * 100).toFixed(2)
      : 0;

    res.json({
      code: 200,
      data: {
        ...result.rows[0],
        completion_rate: parseFloat(completionRate)
      }
    });
  } catch (error) {
    console.error('获取挑战统计失败:', error);
    res.status(500).json({ code: 500, message: '获取挑战统计失败' });
  }
});

// 获取用户挑战档案
router.get('/user/stats', auth, async (req, res) => {
  try {
    const sql = `
      SELECT 
        COALESCE(ucs.user_id, $1::INT) as user_id,
        COALESCE(ucs.total_participated, 0) as total_participated,
        COALESCE(ucs.total_completed, 0) as total_completed,
        COALESCE(ucs.total_points_earned, 0) as total_points_earned,
        COALESCE(ucs.longest_streak, 0) as longest_streak,
        COALESCE(ucs.current_streak, 0) as current_streak,
        ucs.last_challenge_date,
        COALESCE(ups.points, 0) as points,
        COALESCE(ub.count, 0) as badge_count
      FROM (SELECT $1::INT as user_id) as u
      LEFT JOIN user_challenge_stats ucs ON u.user_id = ucs.user_id
      LEFT JOIN user_points ups ON u.user_id = ups.user_id
      LEFT JOIN (SELECT user_id, COUNT(*) as count FROM user_badges GROUP BY user_id) ub ON u.user_id = ub.user_id
    `;

    const result = await query(sql, [req.userId]);

    const recentSql = `
      SELECT c.*, cp.progress, cp.is_completed, cp.joined_at
      FROM challenge_participants cp
      JOIN social_challenges c ON cp.challenge_id = c.id
      WHERE cp.user_id = $1
      ORDER BY cp.joined_at DESC
      LIMIT 10
    `;

    const recentResult = await query(recentSql, [req.userId]);

    res.json({
      code: 200,
      data: {
        stats: {
          user_id: result.rows[0].user_id,
          total_participated: result.rows[0].total_participated,
          total_completed: result.rows[0].total_completed,
          total_points_earned: result.rows[0].total_points_earned,
          longest_streak: result.rows[0].longest_streak,
          current_streak: result.rows[0].current_streak,
          last_challenge_date: result.rows[0].last_challenge_date
        },
        points: result.rows[0].points,
        badge_count: result.rows[0].badge_count,
        completed_challenges: result.rows[0].total_completed,
        recent_challenges: recentResult.rows
      }
    });
  } catch (error) {
    console.error('获取用户挑战档案失败:', error);
    res.status(500).json({ code: 500, message: '获取用户挑战档案失败' });
  }
});

// 获取挑战参与趋势
router.get('/trends', auth, async (req, res) => {
  try {
    const { period = 'week' } = req.query;

    let dateRange = '';
    if (period === 'week') {
      dateRange = 'CURRENT_DATE - INTERVAL \'7 days\'';
    } else if (period === 'month') {
      dateRange = 'CURRENT_DATE - INTERVAL \'30 days\'';
    } else {
      dateRange = 'CURRENT_DATE - INTERVAL \'90 days\'';
    }

    const sql = `
      SELECT 
        DATE(cp.joined_at) as date,
        COUNT(DISTINCT cp.user_id) as new_participants,
        COUNT(DISTINCT CASE WHEN cp.is_completed THEN cp.user_id END) as completions
      FROM challenge_participants cp
      WHERE cp.joined_at >= ${dateRange}
      GROUP BY DATE(cp.joined_at)
      ORDER BY date ASC
    `;

    const result = await query(sql);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取挑战趋势失败:', error);
    res.status(500).json({ code: 500, message: '获取挑战趋势失败' });
  }
});

// ==================== 通知 ====================

// 获取通知列表
router.get('/notifications', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const sql = `
      SELECT * FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [req.userId, limit, offset]);

    await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`, [req.userId]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取通知失败:', error);
    res.status(500).json({ code: 500, message: '获取通知失败' });
  }
});

// 获取未读通知数量
router.get('/notifications/unread', auth, async (req, res) => {
  try {
    const sql = `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`;
    const result = await query(sql, [req.userId]);

    res.json({ code: 200, data: { count: parseInt(result.rows[0].count) } });
  } catch (error) {
    console.error('获取未读通知失败:', error);
    res.status(500).json({ code: 500, message: '获取未读通知失败' });
  }
});

module.exports = router;
