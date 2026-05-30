const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const { auth, optionalAuth } = require('../../middleware/auth');
const { logBehavior } = require('../../middleware/behavior');

router.get('/profile', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.phone, u.nickname, u.avatar, u.gender, u.birthday, u.role,
              up.total_points, up.available_points, up.level, up.experience
       FROM "user" u
       LEFT JOIN user_point up ON u.id = up.user_id
       WHERE u.id = $1`,
      [req.userId]
    );

    const stats = await query(
      `SELECT 
        (SELECT COUNT(*) FROM report_event WHERE user_id = $1) as report_count,
        (SELECT COUNT(*) FROM user_route WHERE user_id = $1) as route_count
      `,
      [req.userId]
    );

    res.json({
      code: 200,
      data: {
        ...result.rows[0],
        stats: stats.rows[0]
      }
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({ code: 500, message: '获取用户信息失败' });
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { nickname, gender, birthday, avatar } = req.body;
    const updates = [];
    const values = [req.userId];
    let paramCount = 2;

    if (nickname) {
      updates.push(`nickname = $${paramCount++}`);
      values.push(nickname);
    }
    if (gender) {
      updates.push(`gender = $${paramCount++}`);
      values.push(gender);
    }
    if (birthday) {
      updates.push(`birthday = $${paramCount++}`);
      values.push(birthday);
    }
    if (avatar) {
      updates.push(`avatar = $${paramCount++}`);
      values.push(avatar);
    }

    if (updates.length === 0) {
      return res.status(400).json({ code: 400, message: '没有要更新的内容' });
    }

    updates.push('updated_at = NOW()');

    await query(
      `UPDATE "user" SET ${updates.join(', ')} WHERE id = $1`,
      values
    );

    res.json({ code: 200, message: '更新成功' });
  } catch (error) {
    console.error('更新用户信息失败:', error);
    res.status(500).json({ code: 500, message: '更新失败' });
  }
});

router.get('/points', auth, async (req, res) => {
  try {
    // 获取主用户积分表数据
    const mainResult = await query(
      'SELECT * FROM user_point WHERE user_id = $1',
      [req.userId]
    );
    
    // 获取挑战扩展积分表数据
    const extResult = await query(
      'SELECT * FROM user_points WHERE user_id = $1',
      [req.userId]
    );
    
    // 合并两个表的数据（优先使用主表，如果主表为空则使用扩展表）
    const mainPoints = mainResult.rows[0];
    const extPoints = extResult.rows[0];
    
    let total_points = 0;
    let available_points = 0;
    let used_points = 0;
    let level = 1;
    
    if (mainPoints) {
      total_points = mainPoints.total_points || 0;
      available_points = mainPoints.available_points || 0;
      used_points = mainPoints.used_points || 0;
      level = mainPoints.level || 1;
    } else if (extPoints) {
      // 如果主表为空，从扩展表读取数据并同步到主表
      total_points = extPoints.total_earned || 0;
      available_points = extPoints.points || 0;
      used_points = 0;
      level = 1;
      
      // 同步数据到主表（先尝试更新，如果没有则插入）
      const updateResult = await query(`
        UPDATE user_point 
        SET total_points = $1, available_points = $2, used_points = $3, level = $4
        WHERE user_id = $5
      `, [total_points, available_points, used_points, level, req.userId]);
      
      if (updateResult.rowCount === 0) {
        await query(`
          INSERT INTO user_point (user_id, total_points, available_points, used_points, level)
          VALUES ($1, $2, $3, $4, $5)
        `, [req.userId, total_points, available_points, used_points, level]);
      }
    }

    // 合并 point_log 和 point_transactions 表的数据
    const logs = await query(
      `SELECT 
        pl.id,
        pl.user_id,
        pl.points,
        pl.type,
        pl.description,
        pl.created_at,
        NULL as challenge_id,
        NULL as challenge_title
      FROM point_log pl
      WHERE pl.user_id = $1
      
      UNION ALL
      
      SELECT 
        pt.id,
        pt.user_id,
        pt.amount as points,
        pt.type,
        pt.description,
        pt.created_at,
        pt.related_id as challenge_id,
        c.title as challenge_title
      FROM point_transactions pt
      LEFT JOIN social_challenges c ON pt.related_id = c.id
      WHERE pt.user_id = $1
      
      ORDER BY created_at DESC 
      LIMIT 30`,
      [req.userId]
    );

    res.json({
      code: 200,
      data: {
        points: { total_points, available_points, used_points, level },
        logs: logs.rows
      }
    });
  } catch (error) {
    console.error('获取积分信息失败:', error);
    res.status(500).json({ code: 500, message: '获取积分信息失败' });
  }
});

router.get('/routes', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT id, route_name, start_name, end_name, total_distance, total_time, 
              is_favorite, share_code, share_count, created_at,
              ST_AsGeoJSON(start_point)::json as start_point,
              ST_AsGeoJSON(end_point)::json as end_point
       FROM user_route 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM user_route WHERE user_id = $1',
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
    console.error('获取用户路线失败:', error);
    res.status(500).json({ code: 500, message: '获取路线失败' });
  }
});



router.get('/reports', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let sql = `SELECT id, report_no, event_type, title, address, status, 
                      urgency_level, points_awarded, created_at
               FROM report_event WHERE user_id = $1`;
    const params = [req.userId];
    let paramCount = 2;

    if (status) {
      sql += ` AND status = $${paramCount++}`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    const countResult = await query(
      'SELECT COUNT(*) FROM report_event WHERE user_id = $1',
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
    console.error('获取用户上报失败:', error);
    res.status(500).json({ code: 500, message: '获取上报记录失败' });
  }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        (SELECT COUNT(*) FROM report_event WHERE user_id = $1) as report_count,
        (SELECT COUNT(*) FROM user_route WHERE user_id = $1) as route_count`,
      [req.userId]
    );

    res.json({ code: 200, data: result.rows[0] });
  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({ code: 500, message: '获取统计信息失败' });
  }
});

router.post('/routes', auth, async (req, res) => {
  try {
    const { route_name, start_name, end_name, total_distance, total_time, start_point, end_point, route_geom } = req.body;

    if (!route_name || !start_point || !end_point || !route_geom) {
      return res.status(400).json({ code: 400, message: '缺少必要参数' });
    }

    const result = await query(
      `INSERT INTO user_route (
        user_id, route_name, start_name, end_name, total_distance, total_time,
        start_point, end_point, route_geom, is_favorite, share_code
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 
        ST_SetSRID(ST_MakePoint($7, $8), 4326),
        ST_SetSRID(ST_MakePoint($9, $10), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON($11), 4326),
        false, 
        substring(md5(random()::text), 1, 8)
      ) RETURNING id`,
      [
        req.userId,
        route_name,
        start_name,
        end_name,
        total_distance || 0,
        total_time || 0,
        start_point.lng,
        start_point.lat,
        end_point.lng,
        end_point.lat,
        JSON.stringify(route_geom)
      ]
    );

    res.json({ code: 200, data: { id: result.rows[0].id } });
  } catch (error) {
    console.error('创建路线失败:', error);
    res.status(500).json({ code: 500, message: '创建路线失败' });
  }
});

module.exports = router;
