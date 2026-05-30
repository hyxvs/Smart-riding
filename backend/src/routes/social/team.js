const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const { auth, optionalAuth } = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.get('/list', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let sql = `SELECT t.id, t.title, t.description, t.total_distance,
                      t.plan_start_time, t.plan_end_time, t.max_members, 
                      t.current_members, t.status, t.invite_code, t.created_at,
                      ST_AsGeoJSON(t.route_geom)::json as route_geom,
                      u.id as creator_id, u.nickname as creator_name, u.avatar as creator_avatar
               FROM team_ride t
               JOIN "user" u ON t.creator_id = u.id
               WHERE 1=1`;
    
    const params = [];
    let paramCount = 1;

    if (status) {
      sql += ` AND t.status = $${paramCount++}`;
      params.push(status);
    } else {
      sql += ` AND t.status IN ('recruiting', 'ongoing')`;
    }

    sql += ` ORDER BY t.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    res.json({
      code: 200,
      data: {
        list: result.rows,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取组队列表失败:', error);
    res.status(500).json({ code: 500, message: '获取组队列表失败' });
  }
});

router.post('/create', auth, async (req, res) => {
  try {
    const {
      title, description, routeGeom,
      startLng, startLat, startName,
      endLng, endLat, endName,
      totalDistance, planStartTime, planEndTime, maxMembers
    } = req.body;

    console.log('创建组队请求数据:', req.body);

    if (!title) {
      return res.status(400).json({ code: 400, message: '标题不能为空' });
    }

    if (!routeGeom || !routeGeom.coordinates || routeGeom.coordinates.length < 2) {
      return res.status(400).json({ code: 400, message: '路线不能为空，请至少选择2个点' });
    }

    // 确保坐标是数字
    const sLng = parseFloat(startLng) || 0;
    const sLat = parseFloat(startLat) || 0;
    const eLng = parseFloat(endLng) || 0;
    const eLat = parseFloat(endLat) || 0;

    const inviteCode = uuidv4().substring(0, 6).toUpperCase();

    // 构建GeoJSON字符串
    const routeGeomString = JSON.stringify({
      type: 'LineString',
      coordinates: routeGeom.coordinates
    });

    console.log('SQL参数:', {
      userId: req.userId,
      title,
      routeGeomString,
      startLng: sLng,
      startLat: sLat,
      endLng: eLng,
      endLat: eLat
    });

    const result = await query(`
      INSERT INTO team_ride 
        (creator_id, title, description, route_geom, start_point, end_point,
         start_name, end_name, total_distance, plan_start_time, plan_end_time, 
         max_members, invite_code)
      VALUES 
        ($1, $2, $3, ST_GeomFromGeoJSON($4), 
         ST_SetSRID(ST_MakePoint($5, $6), 4326),
         ST_SetSRID(ST_MakePoint($7, $8), 4326),
         $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, invite_code
    `, [
      req.userId, 
      title, 
      description || '', 
      routeGeomString,
      sLng, 
      sLat, 
      eLng, 
      eLat,
      startName || '起点', 
      endName || '终点',
      totalDistance || 0, 
      planStartTime || null, 
      planEndTime || null, 
      maxMembers || 10, 
      inviteCode
    ]);

    await query(
      `INSERT INTO team_member (team_id, user_id, role, status) VALUES ($1, $2, 'creator', 'joined')`,
      [result.rows[0].id, req.userId]
    );

    res.json({
      code: 200,
      message: '创建成功',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('创建组队失败:', error);
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({ code: 500, message: '创建组队失败: ' + error.message });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, 
              ST_AsGeoJSON(t.route_geom)::json as route_geom,
              ST_AsGeoJSON(t.start_point)::json as start_point,
              ST_AsGeoJSON(t.end_point)::json as end_point,
              u.id as creator_id, u.nickname as creator_name, u.avatar as creator_avatar
       FROM team_ride t
       JOIN "user" u ON t.creator_id = u.id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '组队不存在' });
    }

    const members = await query(
      `SELECT tm.id, tm.role, tm.join_time,
              u.id as user_id, u.nickname as user_name, u.avatar as user_avatar
       FROM team_member tm
       JOIN "user" u ON tm.user_id = u.id
       WHERE tm.team_id = $1 AND tm.status = 'joined'
       ORDER BY tm.join_time`,
      [req.params.id]
    );

    let isJoined = false;
    let myRole = null;
    if (req.userId) {
      const myMember = await query(
        'SELECT role FROM team_member WHERE team_id = $1 AND user_id = $2',
        [req.params.id, req.userId]
      );
      if (myMember.rows.length > 0) {
        isJoined = true;
        myRole = myMember.rows[0].role;
      }
    }

    res.json({
      code: 200,
      data: {
        ...result.rows[0],
        members: members.rows,
        isJoined,
        myRole
      }
    });
  } catch (error) {
    console.error('获取组队详情失败:', error);
    res.status(500).json({ code: 500, message: '获取组队详情失败' });
  }
});

router.post('/:id/join', auth, async (req, res) => {
  try {
    const teamResult = await query(
      'SELECT * FROM team_ride WHERE id = $1',
      [req.params.id]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '组队不存在' });
    }

    const team = teamResult.rows[0];

    if (team.status !== 'recruiting') {
      return res.status(400).json({ code: 400, message: '该组队已停止招募' });
    }

    if (team.current_members >= team.max_members) {
      return res.status(400).json({ code: 400, message: '该组队人数已满' });
    }

    const existingMember = await query(
      'SELECT id FROM team_member WHERE team_id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ code: 400, message: '您已加入该组队' });
    }

    await query(
      `INSERT INTO team_member (team_id, user_id, role) VALUES ($1, $2, 'member')`,
      [req.params.id, req.userId]
    );

    await query(
      'UPDATE team_ride SET current_members = current_members + 1 WHERE id = $1',
      [req.params.id]
    );

    res.json({ code: 200, message: '加入成功' });
  } catch (error) {
    console.error('加入组队失败:', error);
    res.status(500).json({ code: 500, message: '加入组队失败' });
  }
});

router.post('/:id/leave', auth, async (req, res) => {
  try {
    const memberResult = await query(
      'SELECT role FROM team_member WHERE team_id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(400).json({ code: 400, message: '您未加入该组队' });
    }

    if (memberResult.rows[0].role === 'creator') {
      return res.status(400).json({ code: 400, message: '创建者不能退出，请解散组队' });
    }

    await query(
      'UPDATE team_member SET status = $1 WHERE team_id = $2 AND user_id = $3',
      ['left', req.params.id, req.userId]
    );

    await query(
      'UPDATE team_ride SET current_members = current_members - 1 WHERE id = $1',
      [req.params.id]
    );

    res.json({ code: 200, message: '退出成功' });
  } catch (error) {
    console.error('退出组队失败:', error);
    res.status(500).json({ code: 500, message: '退出组队失败' });
  }
});

router.post('/:id/disband', auth, async (req, res) => {
  try {
    const teamResult = await query(
      'SELECT creator_id FROM team_ride WHERE id = $1',
      [req.params.id]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '组队不存在' });
    }

    if (teamResult.rows[0].creator_id !== req.userId) {
      return res.status(403).json({ code: 403, message: '只有创建者可以解散组队' });
    }

    await query(
      "UPDATE team_ride SET status = 'disbanded' WHERE id = $1",
      [req.params.id]
    );

    res.json({ code: 200, message: '解散成功' });
  } catch (error) {
    console.error('解散组队失败:', error);
    res.status(500).json({ code: 500, message: '解散组队失败' });
  }
});

router.post('/join-by-code', auth, async (req, res) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ code: 400, message: '邀请码不能为空' });
    }

    const teamResult = await query(
      'SELECT * FROM team_ride WHERE invite_code = $1',
      [inviteCode.toUpperCase()]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '邀请码无效' });
    }

    const team = teamResult.rows[0];

    if (team.status !== 'recruiting') {
      return res.status(400).json({ code: 400, message: '该组队已停止招募' });
    }

    if (team.current_members >= team.max_members) {
      return res.status(400).json({ code: 400, message: '该组队人数已满' });
    }

    const existingMember = await query(
      'SELECT id FROM team_member WHERE team_id = $1 AND user_id = $2',
      [team.id, req.userId]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ code: 400, message: '您已加入该组队' });
    }

    await query(
      `INSERT INTO team_member (team_id, user_id, role) VALUES ($1, $2, 'member')`,
      [team.id, req.userId]
    );

    await query(
      'UPDATE team_ride SET current_members = current_members + 1 WHERE id = $1',
      [team.id]
    );

    res.json({
      code: 200,
      message: '加入成功',
      data: { teamId: team.id, title: team.title }
    });
  } catch (error) {
    console.error('通过邀请码加入失败:', error);
    res.status(500).json({ code: 500, message: '加入失败' });
  }
});

module.exports = router;
