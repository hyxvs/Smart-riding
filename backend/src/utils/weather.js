const iconv = require('iconv-lite');

const GAODE_MAP_KEY = process.env.GAODE_MAP_KEY;

const WEATHER_ICONS = {
  晴: 'Sunny',
  多云: 'Cloudy',
  阴: 'Cloudy',
  小雨: 'Rainy',
  中雨: 'Rainy',
  大雨: 'Rainy',
  暴雨: 'Rainy',
  雷阵雨: 'Rainy',
  小雪: 'Snowy',
  中雪: 'Snowy',
  大雪: 'Snowy',
  雨夹雪: 'Snowy',
  雾: 'Foggy',
  霾: 'Foggy',
  沙尘暴: 'Wind'
};

const WEATHER_SUGGESTIONS = {
  晴: { clothing: '轻薄衣物，涂抹防晒霜', activity: '适合骑行，注意补充水分', safety: '紫外线较强，避免长时间暴晒' },
  多云: { clothing: '薄外套，早晚温差大', activity: '适合骑行，享受舒适天气', safety: '注意路面湿滑情况' },
  阴: { clothing: '外套，建议多层穿搭', activity: '适合骑行，空气湿润', safety: '注意能见度，减速慢行' },
  小雨: { clothing: '防水外套，带雨具', activity: '可考虑室内活动，谨慎骑行', safety: '路面湿滑，减速慢行，避免急刹车' },
  中雨: { clothing: '厚雨衣，速干衣物', activity: '建议延期或室内活动', safety: '路面积水，注意防滑，建议暂停骑行' },
  大雨: { clothing: '全身防水装备', activity: '不建议骑行', safety: '道路积水严重，避免外出骑行' },
  暴雨: { clothing: '避免外出', activity: '不建议任何户外活动', safety: '强降雨可能引发灾害，避免外出' },
  雷阵雨: { clothing: '避免外出', activity: '不建议骑行，尽快寻找安全地点', safety: '雷电风险较高，尽快远离空旷地带' },
  小雪: { clothing: '防寒衣物、手套和帽子', activity: '谨慎骑行，注意路面结冰', safety: '路面湿滑，减速慢行' },
  中雪: { clothing: '厚防寒服，搭配防滑鞋', activity: '不建议长途骑行', safety: '道路结冰风险高，建议减少骑行' },
  大雪: { clothing: '全身防寒装备', activity: '不建议骑行', safety: '道路封闭风险较高，避免外出' },
  雾: { clothing: '保暖外套', activity: '谨慎骑行', safety: '能见度低，开启灯光并减速慢行' },
  霾: { clothing: '佩戴口罩和护目镜', activity: '减少户外骑行', safety: '空气质量较差，注意呼吸防护' },
  沙尘暴: { clothing: '防尘口罩和护目镜', activity: '避免外出骑行', safety: '空气质量极差，避免长时间停留室外' }
};

function ensureGaodeKey() {
  if (!GAODE_MAP_KEY || GAODE_MAP_KEY === 'your_gaode_map_key') {
    throw new Error('天气服务未配置，请联系管理员');
  }
}

function extractCharset(contentType = '') {
  const match = contentType.match(/charset\s*=\s*([^;]+)/i);
  return match ? match[1].trim().toLowerCase() : '';
}

function normalizeCharset(charset) {
  if (!charset) return '';
  if (charset === 'utf-8') return 'utf8';
  if (charset === 'gb2312') return 'gbk';
  return charset;
}

function tryParseJson(buffer, charset) {
  const decoded = iconv.decode(buffer, charset);
  return {
    charset,
    text: decoded,
    data: JSON.parse(decoded)
  };
}

function decodeGaodeJson(buffer, contentType = '') {
  const declaredCharset = normalizeCharset(extractCharset(contentType));
  const candidates = [declaredCharset, 'utf8', 'gb18030', 'gbk'].filter(Boolean);
  const tried = new Set();
  const errors = [];

  for (const charset of candidates) {
    if (tried.has(charset)) continue;
    tried.add(charset);

    try {
      return tryParseJson(buffer, charset);
    } catch (error) {
      errors.push(`${charset}: ${error.message}`);
    }
  }

  throw new Error(`无法解析高德天气返回内容，已尝试编码: ${errors.join(' | ')}`);
}

async function getFetch() {
  return (await import('node-fetch')).default;
}

async function fetchGaodeJson(pathname, params) {
  ensureGaodeKey();

  const fetch = await getFetch();
  const searchParams = new URLSearchParams({
    key: GAODE_MAP_KEY,
    output: 'JSON',
    ...params
  });
  const url = `https://restapi.amap.com${pathname}?${searchParams.toString()}`;
  const response = await fetch(url, { timeout: 10000 });

  if (!response.ok) {
    throw new Error(`高德接口错误: ${response.status}`);
  }

  const buffer = await response.buffer();
  const parsed = decodeGaodeJson(buffer, response.headers.get('content-type') || '');

  if (parsed.data.status !== '1') {
    throw new Error(parsed.data.info || '获取高德数据失败');
  }

  return parsed;
}

async function callGaodeWeatherApi(city, extensions = 'base') {
  return fetchGaodeJson('/v3/weather/weatherInfo', {
    city,
    extensions
  });
}

async function getAdcodeFromCoordinates(lng, lat) {
  const { data } = await fetchGaodeJson('/v3/geocode/regeo', {
    location: `${lng},${lat}`
  });

  const adcode = data?.regeocode?.addressComponent?.adcode;

  if (!adcode) {
    throw new Error('未获取到当前位置所属行政区编码');
  }

  return adcode;
}

function getWeatherIcon(weather = '') {
  for (const [key, icon] of Object.entries(WEATHER_ICONS)) {
    if (weather.includes(key)) {
      return icon;
    }
  }

  return 'Cloudy';
}

function getWeatherSuggestions(weather = '') {
  for (const [key, suggestion] of Object.entries(WEATHER_SUGGESTIONS)) {
    if (weather.includes(key)) {
      return suggestion;
    }
  }

  return {
    clothing: '根据实时温度准备合适衣物',
    activity: '根据天气情况灵活安排骑行计划',
    safety: '注意道路状况，保持安全骑行'
  };
}

function toInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildCurrentWeatherData(liveWeather) {
  return {
    city: liveWeather.city,
    weather: liveWeather.weather,
    temperature: toInteger(liveWeather.temperature),
    windDirection: liveWeather.winddirection,
    windPower: liveWeather.windpower,
    humidity: toInteger(liveWeather.humidity),
    reportTime: liveWeather.reporttime,
    icon: getWeatherIcon(liveWeather.weather),
    suggestions: getWeatherSuggestions(liveWeather.weather)
  };
}

function buildForecastData(forecast) {
  const cityName = [forecast.province, forecast.city].filter(Boolean).join('');

  return {
    city: cityName,
    reportTime: forecast.reporttime,
    forecasts: (forecast.casts || []).map(cast => ({
      date: cast.date,
      week: cast.week,
      dayWeather: cast.dayweather,
      nightWeather: cast.nightweather,
      dayTemp: toInteger(cast.daytemp),
      nightTemp: toInteger(cast.nighttemp),
      dayWind: cast.daywind,
      nightWind: cast.nightwind,
      dayPower: cast.daypower,
      nightPower: cast.nightpower,
      dayIcon: getWeatherIcon(cast.dayweather),
      nightIcon: getWeatherIcon(cast.nightweather),
      daySuggestions: getWeatherSuggestions(cast.dayweather),
      nightSuggestions: getWeatherSuggestions(cast.nightweather)
    }))
  };
}

function formatWeatherResponse(weatherData) {
  return [
    `【${weatherData.city}当前天气】`,
    `天气：${weatherData.weather}`,
    `温度：${weatherData.temperature ?? '--'}°C`,
    `风向：${weatherData.windDirection || '--'}`,
    `风力：${weatherData.windPower || '--'}`,
    `湿度：${weatherData.humidity ?? '--'}%`,
    '',
    '【骑行建议】',
    `穿着建议：${weatherData.suggestions.clothing}`,
    `活动建议：${weatherData.suggestions.activity}`,
    `安全提示：${weatherData.suggestions.safety}`
  ].join('\n');
}

module.exports = {
  callGaodeWeatherApi,
  getAdcodeFromCoordinates,
  getWeatherIcon,
  getWeatherSuggestions,
  buildCurrentWeatherData,
  buildForecastData,
  formatWeatherResponse
};
