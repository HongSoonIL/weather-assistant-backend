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
    const nearest = data.hourly.reduce((prev, curr) => {
      const diffPrev = Math.abs(prev.dt * 1000 - forecastTime);
      const diffCurr = Math.abs(curr.dt * 1000 - forecastTime);
      return diffCurr < diffPrev ? curr : prev;
    });
    target = nearest;
  }

  return {
    temp: Math.round(target.temp),
    feelsLike: Math.round(target.feels_like),
    condition: target.weather?.[0]?.description || '정보 없음',
    icon: target.weather?.[0]?.icon || '',
    humidity: target.humidity,
    uvi: target.uvi,
    cloud: target.clouds,
    dewPoint: target.dew_point,
    visibility: target.visibility,
    wind: target.wind_speed,
    windDeg: target.wind_deg
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
    wind: data.current.wind_speed
  };
}

module.exports = {
  getWeather,
  getWeatherByCoords
};
