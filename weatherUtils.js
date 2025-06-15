require('dotenv').config();
const axios = require('axios');
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

async function getWeather(lat, lon, forecastTime = null) {
  const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,daily,alerts&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
  const res = await axios.get(url);
  const data = res.data;

  let target;
  if (!forecastTime) {
    target = data.current;
  } else {
    target = data.hourly.reduce((prev, curr) =>
      Math.abs(curr.dt * 1000 - forecastTime) < Math.abs(prev.dt * 1000 - forecastTime) ? curr : prev
    );
  }

  return {
    temp: Math.round(target.temp),
    feelsLike: Math.round(target.feels_like),
    condition: target.weather?.[0]?.description || '정보 없음',
    humidity: target.humidity,
    uvi: target.uvi,
    cloud: target.clouds,
    dewPoint: target.dew_point,
    visibility: target.visibility,
    wind: target.wind_speed,
    windDeg: target.wind_deg,
    pop: target.pop ?? null,
    rain: target.rain?.['1h'] ?? 0,
    sunrise: data.current.sunrise,
    sunset: data.current.sunset,
  };
}

async function getWeatherByCoords(lat, lon) {
  const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=en`;
  const response = await axios.get(url);
  const data = response.data;
  



  return {
    temp: Math.round(data.current.temp),
    condition: data.current.weather[0].main,
    feelsLike: Math.round(data.current.feels_like),
    tempMin: Math.round(data.daily[0].temp.min),
    tempMax: Math.round(data.daily[0].temp.max),
    humidity: data.current.humidity,
    wind: data.current.wind_speed,
     // 아이콘 매핑을 위한 정보 추가
    weatherId: data.current.weather[0].id,  // 아이콘 매핑을 위해 추가
    description: data.current.weather[0].description, // 날씨 문구 출력을 위해 추가
    timestamp: data.current.dt * 1000,  // 밤/낮 판단용
  };
}

module.exports = {
  getWeather,
  getWeatherByCoords
};
