const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, optionalAuth } = require('../middleware/auth');
const { logBehavior } = require('../middleware/behavior');

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
    const result = await query(
      'SELECT * FROM user_point WHERE user_id = $1',
      [req.userId]
    );

    const logs = await query(
      `SELECT * FROM point_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.userId]
    );

    res.json({
      code: 200,
      data: {
        points: result.rows[0] || { total_points: 0, available_points: 0, level: 1 },
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
