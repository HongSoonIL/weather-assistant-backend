require('dotenv').config();
const axios = require('axios');
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function geocodeGoogle(address) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await axios.get(url);
  const results = res.data.results;
  if (!results || results.length === 0) return null;
  const { lat, lng } = results[0].geometry.location;
  return { lat, lon: lng };
}

async function reverseGeocode(lat, lon) {
  const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
    params: {
      latlng: `${lat},${lon}`,
      key: GOOGLE_MAPS_API_KEY,
      language: 'en'
    }
  });

  const components = response.data.results[0]?.address_components;

  const city = components?.find(c =>
    c.types.includes('locality') || c.types.includes('administrative_area_level_1')
  )?.long_name;

  const country = components?.find(c =>
    c.types.includes('country')
  )?.short_name;

  return city && country ? `${city}, ${country}` : 'Unknown';
}

module.exports = {
  geocodeGoogle,
  reverseGeocode
};