const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const { processChallengeCompletion } = require('../../utils/challengeRewards');
const { auth } = require('../../middleware/auth');

router.get('/feed', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, type = 'all' } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT p.*,
             u.nickname as author_nickname,
             u.avatar as author_avatar,
             0 as author_distance,
             (SELECT COUNT(*) FROM social_follows WHERE following_id = p.user_id) as author_followers,
             EXISTS(SELECT 1 FROM social_likes WHERE user_id = $1 AND post_id = p.id) as is_liked,
             EXISTS(SELECT 1 FROM social_follows WHERE follower_id = $1 AND following_id = p.user_id) as is_following
      FROM social_posts p
      JOIN "user" u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params = [req.userId];
    let paramCount = 2;

    if (type === 'following') {
      sql += ` AND EXISTS(SELECT 1 FROM social_follows WHERE follower_id = $1 AND following_id = p.user_id)`;
    } else if (type === 'challenge') {
      sql += ` AND p.is_challenge_post = TRUE`;
    }

    sql += ` ORDER BY p.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    const countSql = type === 'following'
      ? `SELECT COUNT(*) FROM social_posts p WHERE EXISTS(SELECT 1 FROM social_follows WHERE follower_id = $1 AND following_id = p.user_id)`
      : `SELECT COUNT(*) FROM social_posts`;

    const countResult = await query(
      type === 'following' ? countSql : 'SELECT COUNT(*) FROM social_posts',
      type === 'following' ? [req.userId] : []
    );

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
    console.error('获取动态失败:', error);
    res.status(500).json({ code: 500, message: '获取动态失败' });
  }
});

router.get('/post/:id', auth, async (req, res) => {
  try {
    const sql = `
      SELECT p.*,
             u.nickname as author_nickname,
             u.avatar as author_avatar,
             0 as author_distance,
             (SELECT COUNT(*) FROM social_follows WHERE following_id = p.user_id) as author_followers,
             EXISTS(SELECT 1 FROM social_likes WHERE user_id = $1 AND post_id = p.id) as is_liked,
             EXISTS(SELECT 1 FROM social_follows WHERE follower_id = $1 AND following_id = p.user_id) as is_following
      FROM social_posts p
      JOIN "user" u ON p.user_id = u.id
      WHERE p.id = $2
    `;
    const result = await query(sql, [req.userId, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '动态不存在' });
    }

    const commentsSql = `
      SELECT c.*,
             u.nickname as author_nickname,
             u.avatar as author_avatar,
             EXISTS(SELECT 1 FROM social_likes WHERE user_id = $1 AND comment_id = c.id) as is_liked
      FROM social_comments c
      JOIN "user" u ON c.user_id = u.id
      WHERE c.post_id = $2
      ORDER BY c.created_at ASC
    `;
    const commentsResult = await query(commentsSql, [req.userId, req.params.id]);

    res.json({
      code: 200,
      data: {
        ...result.rows[0],
        comments: commentsResult.rows
      }
    });
  } catch (error) {
    console.error('获取动态详情失败:', error);
    res.status(500).json({ code: 500, message: '获取动态详情失败' });
  }
});

router.post('/post', auth, async (req, res) => {
  try {
    const {
      content, images, video_url, location, latitude, longitude,
      ride_distance, ride_duration, ride_avg_speed,
      is_challenge_post, challenge_id, topic_ids
    } = req.body;

    if (!content) {
      return res.status(400).json({ code: 400, message: '内容不能为空' });
    }

    const insertSql = `
      INSERT INTO social_posts
      (user_id, content, images, video_url, location, latitude, longitude,
       ride_distance, ride_duration, ride_avg_speed, is_challenge_post, challenge_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const insertParams = [
      req.userId, content, images || [], video_url || null, location || null, latitude || null, longitude || null,
      ride_distance || null, ride_duration || null, ride_avg_speed || null, is_challenge_post || false, challenge_id || null
    ];
    console.log('发布动态参数:', insertParams.length, insertParams);
    const result = await query(insertSql, insertParams);

    const postId = result.rows[0].id;

    if (topic_ids && topic_ids.length > 0) {
      const topicInsertSql = `INSERT INTO post_topics (post_id, topic_id) VALUES ${
        topic_ids.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')
      }`;
      const topicParams = topic_ids.flatMap(tid => [postId, tid]);
      console.log('话题插入SQL:', topicInsertSql);
      console.log('话题插入参数:', topicParams);
      await query(topicInsertSql, topicParams);

      await query(
        `UPDATE social_topics SET post_count = post_count + 1 WHERE id = ANY($1)`,
        [topic_ids]
      );
    }

    res.json({
      code: 200,
      message: '发布成功',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('发布动态失败:', error);
    res.status(500).json({ code: 500, message: '发布动态失败' });
  }
});

router.delete('/post/:id', auth, async (req, res) => {
  try {
    const checkSql = `SELECT user_id FROM social_posts WHERE id = $1`;
    const checkResult = await query(checkSql, [req.params.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '动态不存在' });
    }

    if (checkResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ code: 403, message: '无权限删除' });
    }

    await query(`DELETE FROM social_posts WHERE id = $1`, [req.params.id]);

    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    console.error('删除动态失败:', error);
    res.status(500).json({ code: 500, message: '删除动态失败' });
  }
});

router.post('/like/:postId', auth, async (req, res) => {
  try {
    const { postId } = req.params;

    const checkSql = `SELECT id FROM social_likes WHERE user_id = $1 AND post_id = $2`;
    const checkResult = await query(checkSql, [req.userId, postId]);

    if (checkResult.rows.length > 0) {
      await query(`DELETE FROM social_likes WHERE user_id = $1 AND post_id = $2`, [req.userId, postId]);
      await query(`UPDATE social_posts SET like_count = like_count - 1 WHERE id = $1`, [postId]);
      res.json({ code: 200, message: '已取消点赞' });
    } else {
      await query(`INSERT INTO social_likes (user_id, post_id) VALUES ($1, $2)`, [req.userId, postId]);
      await query(`UPDATE social_posts SET like_count = like_count + 1 WHERE id = $1`, [postId]);
      res.json({ code: 200, message: '点赞成功' });
    }
  } catch (error) {
    console.error('点赞操作失败:', error);
    res.status(500).json({ code: 500, message: '点赞操作失败' });
  }
});

router.post('/comment', auth, async (req, res) => {
  try {
    const { post_id, content, parent_comment_id } = req.body;

    if (!content || !post_id) {
      return res.status(400).json({ code: 400, message: '评论内容不能为空' });
    }

    const sql = `
      INSERT INTO social_comments (post_id, user_id, content, parent_comment_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await query(sql, [post_id, req.userId, content, parent_comment_id]);

    await query(`UPDATE social_posts SET comment_count = comment_count + 1 WHERE id = $1`, [post_id]);

    res.json({
      code: 200,
      message: '评论成功',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('评论失败:', error);
    res.status(500).json({ code: 500, message: '评论失败' });
  }
});

router.delete('/comment/:id', auth, async (req, res) => {
  try {
    const checkSql = `SELECT user_id, post_id FROM social_comments WHERE id = $1`;
    const checkResult = await query(checkSql, [req.params.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '评论不存在' });
    }

    if (checkResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ code: 403, message: '无权限删除' });
    }

    await query(`DELETE FROM social_comments WHERE id = $1`, [req.params.id]);
    await query(`UPDATE social_posts SET comment_count = comment_count - 1 WHERE id = $1`, [checkResult.rows[0].post_id]);

    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    console.error('删除评论失败:', error);
    res.status(500).json({ code: 500, message: '删除评论失败' });
  }
});

router.post('/follow/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (parseInt(userId) === req.userId) {
      return res.status(400).json({ code: 400, message: '不能关注自己' });
    }

    const checkSql = `SELECT id FROM social_follows WHERE follower_id = $1 AND following_id = $2`;
    const checkResult = await query(checkSql, [req.userId, userId]);

    if (checkResult.rows.length > 0) {
      await query(`DELETE FROM social_follows WHERE follower_id = $1 AND following_id = $2`, [req.userId, userId]);
      res.json({ code: 200, message: '已取消关注' });
    } else {
      await query(`INSERT INTO social_follows (follower_id, following_id) VALUES ($1, $2)`, [req.userId, userId]);
      res.json({ code: 200, message: '关注成功' });
    }
  } catch (error) {
    console.error('关注操作失败:', error);
    res.status(500).json({ code: 500, message: '关注操作失败' });
  }
});

router.get('/following', auth, async (req, res) => {
  try {
    const sql = `
      SELECT u.id, u.nickname, u.avatar, 0 as total_distance, 1 as level,
             EXISTS(SELECT 1 FROM social_follows WHERE follower_id = $1 AND following_id = u.id) as is_following
      FROM "user" u
      WHERE EXISTS(SELECT 1 FROM social_follows WHERE follower_id = $1 AND following_id = u.id)
      ORDER BY (SELECT created_at FROM social_follows WHERE follower_id = $1 AND following_id = u.id) DESC
    `;
    const result = await query(sql, [req.userId]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取关注列表失败:', error);
    res.status(500).json({ code: 500, message: '获取关注列表失败' });
  }
});

router.get('/followers', auth, async (req, res) => {
  try {
    const sql = `
      SELECT u.id, u.nickname, u.avatar, 0 as total_distance, 1 as level,
             EXISTS(SELECT 1 FROM social_follows WHERE follower_id = $1 AND following_id = u.id) as is_following
      FROM "user" u
      WHERE EXISTS(SELECT 1 FROM social_follows WHERE following_id = $1 AND follower_id = u.id)
      ORDER BY (SELECT created_at FROM social_follows WHERE follower_id = u.id AND following_id = $1) DESC
    `;
    const result = await query(sql, [req.userId]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取粉丝列表失败:', error);
    res.status(500).json({ code: 500, message: '获取粉丝列表失败' });
  }
});

router.get('/nearby', auth, async (req, res) => {
  try {
    const { latitude, longitude, radius = 5000 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ code: 400, message: '需要提供位置信息' });
    }

    await query(
      `INSERT INTO rider_locations (user_id, latitude, longitude, last_activity)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET latitude = $2, longitude = $3, last_activity = NOW()`,
      [req.userId, latitude, longitude]
    );

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const rad = parseFloat(radius);

    const latDelta = rad / 111000;
    const lonDelta = rad / (111000 * Math.cos(lat * Math.PI / 180));

    const sql = `
      SELECT u.id, u.nickname, u.avatar, 0 as total_distance, 1 as level,
             rl.latitude, rl.longitude, rl.last_activity,
             (6371 * acos(cos(radians($3)) * cos(radians(rl.latitude)) * cos(radians(rl.longitude) - radians($4)) + sin(radians($3)) * sin(radians(rl.latitude)))) AS distance
      FROM rider_locations rl
      JOIN "user" u ON rl.user_id = u.id
      WHERE rl.user_id != $1
        AND rl.is_visible = TRUE
        AND rl.latitude BETWEEN $2 - $5 AND $2 + $5
        AND rl.longitude BETWEEN $4 - $6 AND $4 + $6
        AND rl.last_activity > NOW() - INTERVAL '30 minutes'
      HAVING (6371 * acos(cos(radians($3)) * cos(radians(rl.latitude)) * cos(radians(rl.longitude) - radians($4)) + sin(radians($3)) * sin(radians(rl.latitude)))) < $2
      ORDER BY distance ASC
      LIMIT 50
    `;

    const result = await query(sql, [req.userId, lat, lat, lon, latDelta, lonDelta]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取附近骑友失败:', error);
    res.status(500).json({ code: 500, message: '获取附近骑友失败' });
  }
});

router.get('/topics', auth, async (req, res) => {
  try {
    const sql = `SELECT * FROM social_topics ORDER BY is_hot DESC, post_count DESC`;
    const result = await query(sql);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取话题列表失败:', error);
    res.status(500).json({ code: 500, message: '获取话题列表失败' });
  }
});

router.get('/topics/:id/posts', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const sql = `
      SELECT p.*,
             u.nickname as author_nickname,
             u.avatar as author_avatar,
             EXISTS(SELECT 1 FROM social_likes WHERE user_id = $1 AND post_id = p.id) as is_liked
      FROM social_posts p
      JOIN "user" u ON p.user_id = u.id
      JOIN post_topics pt ON p.id = pt.post_id
      WHERE pt.topic_id = $2
      ORDER BY p.created_at DESC
      LIMIT $3 OFFSET $4
    `;
    const result = await query(sql, [req.userId, req.params.id, limit, offset]);

    const countResult = await query(
      `SELECT COUNT(*) FROM post_topics WHERE topic_id = $1`,
      [req.params.id]
    );

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
    console.error('获取话题动态失败:', error);
    res.status(500).json({ code: 500, message: '获取话题动态失败' });
  }
});

router.get('/challenges', auth, async (req, res) => {
  try {
    const { status = 'active', type } = req.query;

    let sql = `
      SELECT c.*,
             u.nickname as creator_nickname,
             (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = c.id) as current_participants,
             EXISTS(SELECT 1 FROM challenge_participants WHERE challenge_id = c.id AND user_id = $1) as is_participated,
             (SELECT progress FROM challenge_participants WHERE challenge_id = c.id AND user_id = $1) as my_progress
      FROM social_challenges c
      LEFT JOIN "user" u ON c.created_by = u.id
      WHERE 1=1
    `;
    const params = [req.userId];
    let paramCount = 2;

    if (status) {
      sql += ` AND c.status = $${paramCount++}`;
      params.push(status);
    }
    if (type) {
      sql += ` AND c.challenge_type = $${paramCount++}`;
      params.push(type);
    }

    sql += ` ORDER BY c.start_date DESC LIMIT $${paramCount++}`;
    params.push(50);

    const result = await query(sql, params);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取挑战列表失败:', error);
    res.status(500).json({ code: 500, message: '获取挑战列表失败' });
  }
});

router.get('/challenges/:id', auth, async (req, res) => {
  try {
    const sql = `
      SELECT c.*,
             u.nickname as creator_nickname
      FROM social_challenges c
      LEFT JOIN "user" u ON c.created_by = u.id
      WHERE c.id = $2
    `;
    const result = await query(sql, [req.userId, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '挑战不存在' });
    }

    const participantsSql = `
      SELECT cp.*, u.nickname, u.avatar
      FROM challenge_participants cp
      JOIN "user" u ON cp.user_id = u.id
      WHERE cp.challenge_id = $1
      ORDER BY cp.progress DESC
      LIMIT 100
    `;
    const participantsResult = await query(participantsSql, [req.params.id]);

    res.json({
      code: 200,
      data: {
        ...result.rows[0],
        participants: participantsResult.rows
      }
    });
  } catch (error) {
    console.error('获取挑战详情失败:', error);
    res.status(500).json({ code: 500, message: '获取挑战详情失败' });
  }
});

router.post('/challenges/:id/join', auth, async (req, res) => {
  try {
    const checkSql = `SELECT id FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2`;
    const checkResult = await query(checkSql, [req.params.id, req.userId]);

    if (checkResult.rows.length > 0) {
      return res.status(400).json({ code: 400, message: '已参加该挑战' });
    }

    const joinSql = `
      INSERT INTO challenge_participants (challenge_id, user_id)
      VALUES ($1, $2)
    `;
    await query(joinSql, [req.params.id, req.userId]);

    await query(
      `UPDATE social_challenges SET participant_count = participant_count + 1 WHERE id = $1`,
      [req.params.id]
    );

    res.json({ code: 200, message: '参加成功' });
  } catch (error) {
    console.error('参加挑战失败:', error);
    res.status(500).json({ code: 500, message: '参加挑战失败' });
  }
});

router.put('/challenges/:id/progress', auth, async (req, res) => {
  try {
    const { progress_value } = req.body;

    const checkSql = `SELECT cp.progress_value as current_progress_value, c.target_value 
                      FROM challenge_participants cp
                      JOIN social_challenges c ON cp.challenge_id = c.id
                      WHERE cp.challenge_id = $1 AND cp.user_id = $2`;
    const checkResult = await query(checkSql, [req.params.id, req.userId]);

    if (checkResult.rows.length === 0) {
      return res.status(400).json({ code: 400, message: '未参加该挑战' });
    }

    const currentProgressValue = parseFloat(checkResult.rows[0].current_progress_value) || 0;
    const targetValue = parseFloat(checkResult.rows[0].target_value) || 1;
    
    // 计算新的进度值（实际距离）
    const newProgressValue = currentProgressValue + parseFloat(progress_value);
    // 计算进度百分比
    const newProgress = Math.min((newProgressValue / targetValue) * 100, 100);
    const isCompleted = newProgress >= 100;

    console.log(`[PROGRESS UPDATE] 用户 ${req.userId} 更新挑战 ${req.params.id} 的进度: 当前值=${currentProgressValue}, 新增=${progress_value}, 目标=${targetValue}, 新进度=${newProgress}%`);

    const updateSql = `
      UPDATE challenge_participants
      SET progress = $1, progress_value = $2, is_completed = $3,
          completed_at = CASE WHEN $3 THEN NOW() ELSE completed_at END,
          updated_at = NOW()
      WHERE challenge_id = $4 AND user_id = $5
    `;
    await query(updateSql, [newProgress, newProgressValue, isCompleted, req.params.id, req.userId]);

    if (isCompleted) {
      await query(
        `UPDATE social_challenges SET completion_count = completion_count + 1 WHERE id = $1`,
        [req.params.id]
      );
      
      // 处理挑战完成奖励（徽章、积分、统计）
      await processChallengeCompletion(req.userId, req.params.id);
    }

    res.json({ code: 200, message: '更新成功', data: { progress: newProgress, is_completed: isCompleted } });
  } catch (error) {
    console.error('更新进度失败:', error);
    res.status(500).json({ code: 500, message: '更新进度失败' });
  }
});

router.get('/leaderboard', auth, async (req, res) => {
  try {
    const { type = 'distance', period = 'month' } = req.query;

    let orderField;
    switch (type) {
      case 'rides': orderField = 'total_rides'; break;
      case 'elevation': orderField = 'total_elevation'; break;
      default: orderField = 'total_distance';
    }

    let periodValue;
    const now = new Date();
    if (period === 'week') {
      periodValue = `${now.getFullYear()}-W${Math.ceil((now.getMonth() * 30 + now.getDate()) / 7)}`;
    } else if (period === 'year') {
      periodValue = now.getFullYear().toString();
    } else {
      periodValue = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    let sql = `
      SELECT l.*, u.nickname, u.avatar, 1 as level
      FROM leaderboard l
      JOIN "user" u ON l.user_id = u.id
      WHERE l.period_type = $1 AND l.period_value = $2
      ORDER BY l.${orderField} DESC
      LIMIT 100
    `;
    const result = await query(sql, [period, periodValue]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取排行榜失败:', error);
    res.status(500).json({ code: 500, message: '获取排行榜失败' });
  }
});

router.get('/user/:userId/posts', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const sql = `
      SELECT p.*,
             u.nickname as author_nickname,
             u.avatar as author_avatar,
             EXISTS(SELECT 1 FROM social_likes WHERE user_id = $1 AND post_id = p.id) as is_liked,
             EXISTS(SELECT 1 FROM social_follows WHERE follower_id = $1 AND following_id = p.user_id) as is_following
      FROM social_posts p
      JOIN "user" u ON p.user_id = u.id
      WHERE p.user_id = $2
      ORDER BY p.created_at DESC
      LIMIT $3 OFFSET $4
    `;
    const result = await query(sql, [req.userId, req.params.userId, limit, offset]);

    const countResult = await query(
      `SELECT COUNT(*) FROM social_posts WHERE user_id = $1`,
      [req.params.userId]
    );

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
    console.error('获取用户动态失败:', error);
    res.status(500).json({ code: 500, message: '获取用户动态失败' });
  }
});

// 分享动态
router.post('/share/:postId', auth, async (req, res) => {
  try {
    const { postId } = req.params;

    const checkSql = `SELECT id FROM social_posts WHERE id = $1`;
    const checkResult = await query(checkSql, [postId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '动态不存在' });
    }

    const shareCheckSql = `SELECT id FROM social_shares WHERE user_id = $1 AND post_id = $2`;
    const shareCheckResult = await query(shareCheckSql, [req.userId, postId]);

    if (shareCheckResult.rows.length > 0) {
      return res.status(400).json({ code: 400, message: '已分享过该动态' });
    }

    await query(`INSERT INTO social_shares (user_id, post_id) VALUES ($1, $2)`, [req.userId, postId]);
    await query(`UPDATE social_posts SET share_count = share_count + 1 WHERE id = $1`, [postId]);

    res.json({ code: 200, message: '分享成功' });
  } catch (error) {
    console.error('分享操作失败:', error);
    res.status(500).json({ code: 500, message: '分享操作失败' });
  }
});

// 获取用户分享列表
router.get('/shares', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const sql = `
      SELECT p.*,
             u.nickname as author_nickname,
             u.avatar as author_avatar,
             EXISTS(SELECT 1 FROM social_likes WHERE user_id = $1 AND post_id = p.id) as is_liked
      FROM social_shares s
      JOIN social_posts p ON s.post_id = p.id
      JOIN "user" u ON p.user_id = u.id
      WHERE s.user_id = $1
      ORDER BY s.shared_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await query(sql, [req.userId, limit, offset]);

    const countResult = await query(
      `SELECT COUNT(*) FROM social_shares WHERE user_id = $1`,
      [req.userId]
    );

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
    console.error('获取分享列表失败:', error);
    res.status(500).json({ code: 500, message: '获取分享列表失败' });
  }
});

module.exports = router;
