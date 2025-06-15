// airPollenService.js

const axios = require('axios');
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const AMBEE_POLLEN_API_KEY = process.env.AMBEE_POLLEN_API_KEY;

// ✅ 미세먼지 정보 가져오기
async function getAirQuality(lat, lon) {
  try {
    const urlV3 = `https://api.openweathermap.org/data/3.0/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
    const res = await axios.get(urlV3);
    const data = res.data;
    const pm25 = data.list[0].components.pm2_5;
    const pm10 = data.list[0].components.pm10;
    return { pm25, pm10 };
  } catch (err) {
    const urlV25 = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
    try {
      const res = await axios.get(urlV25);
      const data = res.data;
      const pm25 = data.list[0].components.pm2_5;
      const pm10 = data.list[0].components.pm10;
      return { pm25, pm10 };
    } catch (fallbackErr) {
      console.error('❌ 미세먼지 API 호출 실패:', fallbackErr.message);
      return null;
    }
  }
}

// ✅ 꽃가루 정보 가져오기
async function getPollenAmbee(lat, lon) {
  try {
    const url = 'https://api.ambeedata.com/latest/pollen/by-lat-lng';
    const res = await axios.get(url, {
      params: { lat, lng: lon },
      headers: {
        'x-api-key': AMBEE_POLLEN_API_KEY,
        'Accept': 'application/json'
      }
    });

    const arr = res.data?.data;
    if (!Array.isArray(arr) || arr.length === 0) return null;

    const info = arr[0];
    const risks = info.Risk;
    const counts = info.Count;
    const updatedAt = info.updatedAt;

    const priorityMap = { 'High': 3, 'Medium': 2, 'Low': 1 };
    let topType = Object.keys(risks)[0];
    for (const type of Object.keys(risks)) {
      if (priorityMap[risks[type]] > priorityMap[risks[topType]]) {
        topType = type;
      }
    }

    return {
      type: topType,
      count: counts[topType],
      risk: risks[topType],
      time: updatedAt
    };
  } catch (err) {
    console.error('❌ 꽃가루 API 호출 실패:', err.message);
    return null;
  }
}

module.exports = {
  getAirQuality,
  getPollenAmbee
};
