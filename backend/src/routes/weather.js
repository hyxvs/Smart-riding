const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const {
  callGaodeWeatherApi,
  getAdcodeFromCoordinates,
  getWeatherSuggestions,
  getWeatherIcon,
  buildCurrentWeatherData,
  buildForecastData
} = require('../utils/weather');

function resolveCityInput(query) {
  const { city, adcode, lng, lat } = query;

  return {
    city: city || adcode || '',
    lng,
    lat
  };
}

async function resolveWeatherTarget(query) {
  const { city, lng, lat } = resolveCityInput(query);

  if (city) {
    return city;
  }

  if (lng && lat) {
    return getAdcodeFromCoordinates(lng, lat);
  }

  throw new Error('请提供城市名称、行政区编码或经纬度坐标');
}

router.get('/current', optionalAuth, async (req, res) => {
  try {
    const target = await resolveWeatherTarget(req.query);
    const { data } = await callGaodeWeatherApi(target, 'base');
    const liveWeather = data?.lives?.[0];

    if (!liveWeather) {
      return res.status(404).json({ code: 404, message: '暂未查询到该地区实时天气' });
    }

    res.json({
      code: 200,
      data: buildCurrentWeatherData(liveWeather)
    });
  } catch (error) {
    console.error('获取当前天气失败:', error);
    res.status(500).json({ code: 500, message: error.message || '获取天气信息失败' });
  }
});

router.get('/forecast', optionalAuth, async (req, res) => {
  try {
    const target = await resolveWeatherTarget(req.query);
    const { data } = await callGaodeWeatherApi(target, 'all');
    const forecast = data?.forecasts?.[0];

    if (!forecast || !forecast.casts) {
      return res.status(404).json({ code: 404, message: '暂未查询到该地区天气预报' });
    }

    res.json({
      code: 200,
      data: buildForecastData(forecast)
    });
  } catch (error) {
    console.error('获取天气预报失败:', error);
    res.status(500).json({ code: 500, message: error.message || '获取天气预报失败' });
  }
});

router.get('/suggestions', optionalAuth, async (req, res) => {
  try {
    const { weather } = req.query;

    if (!weather) {
      return res.status(400).json({ code: 400, message: '请提供天气状况' });
    }

    res.json({
      code: 200,
      data: {
        weather,
        icon: getWeatherIcon(weather),
        ...getWeatherSuggestions(weather)
      }
    });
  } catch (error) {
    console.error('获取骑行建议失败:', error);
    res.status(500).json({ code: 500, message: '获取骑行建议失败' });
  }
});

module.exports = router;
