const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, adminOnly, optionalAuth } = require('../middleware/auth');

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPoiFilters(req) {
  const page = toPositiveInt(req.query.page, 1);
  const limit = toPositiveInt(req.query.limit, 20);
  const offset = (page - 1) * limit;
  const isAdmin = req.userRole === 'admin';
  const { keyword, category, bbox } = req.query;
  const isRedSpot = toBoolean(req.query.isRedSpot);
  const status = req.query.status;
  const lng = toNullableNumber(req.query.lng);
  const lat = toNullableNumber(req.query.lat);
  const radius = toNullableNumber(req.query.radius);

  const whereClauses = ['geom IS NOT NULL'];
  const params = [];
  let distanceSql = '';

  if (!isAdmin) {
    params.push('normal');
    whereClauses.push(`status = $${params.length}`);
  } else if (status) {
    params.push(status);
    whereClauses.push(`status = $${params.length}`);
  }

  if (keyword) {
    params.push(`%${keyword}%`);
    whereClauses.push(`(name ILIKE $${params.length} OR address ILIKE $${params.length})`);
  }

  if (category) {
    params.push(category);
    whereClauses.push(`category = $${params.length}`);
  }

  if (isRedSpot !== null) {
    params.push(isRedSpot);
    whereClauses.push(`is_red_spot = $${params.length}`);
  }

  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
    if ([minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
      params.push(minLng, minLat, maxLng, maxLat);
      whereClauses.push(`
        geom && ST_MakeEnvelope(
          $${params.length - 3},
          $${params.length - 2},
          $${params.length - 1},
          $${params.length},
          4326
        )
      `);
    }
  }

  if (lng !== null && lat !== null && radius !== null) {
    params.push(lng, lat, radius);
    distanceSql = `,
      ST_Distance(
        geom::geography,
        ST_SetSRID(ST_MakePoint($${params.length - 2}, $${params.length - 1}), 4326)::geography
      ) AS distance
    `;
    whereClauses.push(`
      ST_DWithin(
        geom::geography,
        ST_SetSRID(ST_MakePoint($${params.length - 2}, $${params.length - 1}), 4326)::geography,
        $${params.length}
      )
    `);
  }

  return {
    page,
    limit,
    offset,
    whereSql: whereClauses.join(' AND '),
    params,
    distanceSql,
    hasNearbyFilter: lng !== null && lat !== null && radius !== null,
    isAdmin
  };
}

router.get('/list', optionalAuth, async (req, res) => {
  try {
    const {
      page,
      limit,
      offset,
      whereSql,
      params,
      distanceSql,
      hasNearbyFilter
    } = buildPoiFilters(req);

    const listParams = hasNearbyFilter ? [...params, limit] : [...params, limit, offset];
    const orderSql = hasNearbyFilter ? 'ORDER BY distance ASC' : 'ORDER BY created_at DESC, id DESC';

    const [result, countResult, statsResult] = await Promise.all([
      query(`
        SELECT
          id,
          name,
          category,
          sub_category,
          address,
          description,
          is_red_spot,
          red_description,
          safety_rating,
          scenery_rating,
          opening_hours,
          contact_phone,
          images,
          status,
          created_at,
          updated_at,
          ST_AsGeoJSON(geom)::json AS location
          ${distanceSql}
        FROM poi
        WHERE ${whereSql}
        ${orderSql}
        LIMIT $${params.length + 1}
        ${hasNearbyFilter ? '' : `OFFSET $${params.length + 2}`}
      `, listParams),
      query(`
        SELECT COUNT(*)::int AS total
        FROM poi
        WHERE ${whereSql}
      `, params),
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_red_spot = true)::int AS red_spots,
          COUNT(*) FILTER (WHERE status = 'disabled')::int AS disabled
        FROM poi
      `)
    ]);

    res.json({
      code: 200,
      data: {
        list: result.rows,
        total: countResult.rows[0]?.total || 0,
        page,
        limit,
        stats: statsResult.rows[0] || {
          total: 0,
          red_spots: 0,
          disabled: 0
        }
      }
    });
  } catch (error) {
    console.error('获取 POI 列表失败:', error);
    res.status(500).json({ code: 500, message: '获取 POI 列表失败' });
  }
});

router.get('/categories/list', optionalAuth, async (req, res) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const result = await query(`
      SELECT category, COUNT(*)::int AS count
      FROM poi
      WHERE category IS NOT NULL
        ${isAdmin ? '' : `AND status = 'normal'`}
      GROUP BY category
      ORDER BY count DESC, category ASC
    `);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取 POI 分类失败:', error);
    res.status(500).json({ code: 500, message: '获取 POI 分类失败' });
  }
});

router.get('/red-spots/list', async (req, res) => {
  try {
    const limit = Math.min(toPositiveInt(req.query.limit, 50), 200);
    const result = await query(`
      SELECT
        id,
        name,
        category,
        address,
        red_description,
        safety_rating,
        scenery_rating,
        ST_AsGeoJSON(geom)::json AS location
      FROM poi
      WHERE status = 'normal'
        AND is_red_spot = true
        AND geom IS NOT NULL
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `, [limit]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取红色资源点列表失败:', error);
    res.status(500).json({ code: 500, message: '获取红色资源点列表失败' });
  }
});

async function handlePoiSearch(req, res, keywordInput) {
  try {
    const keyword = keywordInput || req.query.keyword || '';
    const limit = Math.min(toPositiveInt(req.query.limit, 10), 50);

    if (!keyword.trim()) {
      return res.json({ code: 200, data: [] });
    }

    const result = await query(`
      SELECT
        id,
        name,
        category,
        address,
        ST_AsGeoJSON(geom)::json AS location,
        similarity(name, $1) AS similarity
      FROM poi
      WHERE status = 'normal'
        AND (name % $1 OR name ILIKE $2)
      ORDER BY similarity DESC, id DESC
      LIMIT $3
    `, [keyword, `%${keyword}%`, limit]);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('搜索 POI 失败:', error);
    res.status(500).json({ code: 500, message: '搜索 POI 失败' });
  }
}

router.get('/search', async (req, res) => {
  await handlePoiSearch(req, res, req.query.keyword);
});

router.get('/search/:keyword', async (req, res) => {
  await handlePoiSearch(req, res, req.params.keyword);
});

router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const {
      name,
      category,
      subCategory,
      address,
      description,
      isRedSpot = false,
      redDescription,
      safetyRating,
      sceneryRating,
      openingHours,
      contactPhone,
      images = [],
      status = 'normal',
      lng,
      lat
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ code: 400, message: 'POI 名称不能为空' });
    }

    if (!['normal', 'disabled'].includes(status)) {
      return res.status(400).json({ code: 400, message: 'POI 状态不合法' });
    }

    const lngValue = toNullableNumber(lng);
    const latValue = toNullableNumber(lat);
    const result = await query(`
      INSERT INTO poi (
        name,
        category,
        sub_category,
        geom,
        address,
        description,
        is_red_spot,
        red_description,
        safety_rating,
        scenery_rating,
        opening_hours,
        contact_phone,
        images,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        CASE
          WHEN $4::double precision IS NOT NULL AND $5::double precision IS NOT NULL
          THEN ST_SetSRID(ST_MakePoint($4::double precision, $5::double precision), 4326)
          ELSE NULL
        END,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15
      )
      RETURNING id
    `, [
      String(name).trim(),
      category || null,
      subCategory || null,
      lngValue,
      latValue,
      address || null,
      description || null,
      Boolean(isRedSpot),
      redDescription || null,
      toNullableNumber(safetyRating),
      toNullableNumber(sceneryRating),
      openingHours || null,
      contactPhone || null,
      Array.isArray(images) ? images : [],
      status
    ]);

    res.json({
      code: 200,
      message: 'POI 新增成功',
      data: { id: result.rows[0]?.id }
    });
  } catch (error) {
    console.error('新增 POI 失败:', error);
    res.status(500).json({ code: 500, message: '新增 POI 失败' });
  }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const {
      name,
      category,
      subCategory,
      address,
      description,
      isRedSpot,
      redDescription,
      safetyRating,
      sceneryRating,
      openingHours,
      contactPhone,
      images,
      status,
      lng,
      lat
    } = req.body;

    const fields = [];
    const params = [];

    if (name !== undefined) {
      params.push(String(name).trim());
      fields.push(`name = $${params.length}`);
    }

    if (category !== undefined) {
      params.push(category || null);
      fields.push(`category = $${params.length}`);
    }

    if (subCategory !== undefined) {
      params.push(subCategory || null);
      fields.push(`sub_category = $${params.length}`);
    }

    if (address !== undefined) {
      params.push(address || null);
      fields.push(`address = $${params.length}`);
    }

    if (description !== undefined) {
      params.push(description || null);
      fields.push(`description = $${params.length}`);
    }

    if (isRedSpot !== undefined) {
      params.push(Boolean(isRedSpot));
      fields.push(`is_red_spot = $${params.length}`);
    }

    if (redDescription !== undefined) {
      params.push(redDescription || null);
      fields.push(`red_description = $${params.length}`);
    }

    if (safetyRating !== undefined) {
      params.push(toNullableNumber(safetyRating));
      fields.push(`safety_rating = $${params.length}`);
    }

    if (sceneryRating !== undefined) {
      params.push(toNullableNumber(sceneryRating));
      fields.push(`scenery_rating = $${params.length}`);
    }

    if (openingHours !== undefined) {
      params.push(openingHours || null);
      fields.push(`opening_hours = $${params.length}`);
    }

    if (contactPhone !== undefined) {
      params.push(contactPhone || null);
      fields.push(`contact_phone = $${params.length}`);
    }

    if (images !== undefined) {
      params.push(Array.isArray(images) ? images : []);
      fields.push(`images = $${params.length}`);
    }

    if (status !== undefined) {
      if (!['normal', 'disabled'].includes(status)) {
        return res.status(400).json({ code: 400, message: 'POI 状态不合法' });
      }
      params.push(status);
      fields.push(`status = $${params.length}`);
    }

    if (lng !== undefined || lat !== undefined) {
      const lngValue = toNullableNumber(lng);
      const latValue = toNullableNumber(lat);
      params.push(lngValue, latValue);
      fields.push(`
        geom = CASE
          WHEN $${params.length - 1}::double precision IS NOT NULL AND $${params.length}::double precision IS NOT NULL
          THEN ST_SetSRID(ST_MakePoint($${params.length - 1}::double precision, $${params.length}::double precision), 4326)
          ELSE NULL
        END
      `);
    }

    if (!fields.length) {
      return res.status(400).json({ code: 400, message: '没有可更新的字段' });
    }

    params.push(req.params.id);
    const result = await query(`
      UPDATE poi
      SET ${fields.join(', ')},
          updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING id
    `, params);

    if (!result.rows.length) {
      return res.status(404).json({ code: 404, message: 'POI 不存在' });
    }

    res.json({ code: 200, message: 'POI 更新成功' });
  } catch (error) {
    console.error('更新 POI 失败:', error);
    res.status(500).json({ code: 500, message: '更新 POI 失败' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const params = [req.params.id];
    let whereSql = 'id = $1';

    if (!isAdmin) {
      params.push('normal');
      whereSql += ` AND status = $${params.length}`;
    }

    const result = await query(`
      SELECT
        id,
        name,
        category,
        sub_category,
        address,
        description,
        is_red_spot,
        red_description,
        safety_rating,
        scenery_rating,
        opening_hours,
        contact_phone,
        images,
        status,
        created_at,
        updated_at,
        ST_AsGeoJSON(geom)::json AS location
      FROM poi
      WHERE ${whereSql}
    `, params);

    if (!result.rows.length) {
      return res.status(404).json({ code: 404, message: 'POI 不存在' });
    }

    res.json({ code: 200, data: result.rows[0] });
  } catch (error) {
    console.error('获取 POI 详情失败:', error);
    res.status(500).json({ code: 500, message: '获取 POI 详情失败' });
  }
});

module.exports = router;
