// weatherAdviceRouter.js
const { getWeather } = require('./weatherUtils');
const { getAirQuality, getPollenAmbee } = require('./airPollenUtils');
const conversationStore = require('./conversationStore');
const axios = require('axios');
const { getUserProfile } = require('./userProfileUtils');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function isAirRelated(text) {
  const keywords = ['미세먼지', '공기', '공기질', '초미세먼지', '황사', '먼지', '숨쉬기', 'air', 'quality'];
  return keywords.some(kw => text.includes(kw));
}

async function handleAirAdvice({ lat, lon, locationName, uid }, res) {
  const air = await getAirQuality(lat, lon);
  
  if (!air) {
    return res.json({ reply: '죄송해요. 미세먼지 정보를 불러오지 못했어요.' });
  }
  
  // 사용자 정보 포맷 구성
  const userInfo = await getUserProfile(uid);
  const userText = userInfo ? `
사용자 정보:
- 이름: ${userInfo.name}
- 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${userInfo.hobbies?.join(', ') || '없음'}
` : '';
  const prompt = `
${userText}
  "${locationName}"의 미세먼지(PM2.5/PM10) 정보는 다음과 같습니다:
  - PM2.5: ${air.pm25}㎍/m³
  - PM10: ${air.pm10}㎍/m³
  
  이 정보를 바탕으로 외출 시 주의할 점이나 마스크 착용 등에 대해 3~4문장으로 자연스럽게 조언해 주세요.
  `;
  
  const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];
  try {
    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );
    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);
    res.json({ 
          reply,
        airQuality: {
        pm25: air?.pm25,
        pm10: air?.pm10
        } 
  });  } catch (e) {
    console.error('❌ Gemini 호출 오류 (미세먼지):', e.message);
    res.json({ reply: '미세먼지에 대한 조언 생성에 실패했어요.' });
  }
}

function isPollenRelated(text) {
  const keywords = ['꽃가루', '알레르기', 'pollen'];
  return keywords.some(kw => text.includes(kw));
}

async function handlePollenAdvice({ lat, lon, locationName, uid }, res) {
  const pollen = await getPollenAmbee(lat, lon);
  
  if (!pollen) {
    return res.json({ reply: '죄송해요. 꽃가루 정보를 불러오지 못했어요.' });
  }

  const typeMap = {
    grass_pollen: '잔디 꽃가루',
    tree_pollen: '수목 꽃가루',
    weed_pollen: '잡초 꽃가루'
  };
  const type = typeMap[pollen.type] || pollen.type;
  const timeStr = new Date(pollen.time).toLocaleString('ko-KR');

  // 사용자 정보 포맷 구성
  const userInfo = await getUserProfile(uid);
  const userText = userInfo ? `
사용자 정보:
- 이름: ${userInfo.name}
- 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${userInfo.hobbies?.join(', ') || '없음'}
` : '';
  const prompt = `
${userText}
"${locationName}"의 꽃가루 정보는 다음과 같습니다:
- 종류: ${type}
- 개수: ${pollen.count}개
- 위험도: ${pollen.risk}
- 측정 시각: ${timeStr}

이 정보를 참고해 알레르기, 외출, 마스크 착용 등에 대해 3~4문장으로 친근하게 조언해 주세요.
`;

  const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];
  try {
    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );
    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);
    res.json({ reply });
  } catch (e) {
    console.error('❌ Gemini 호출 오류 (꽃가루):', e.message);
    res.json({ reply: '꽃가루에 대한 조언 생성에 실패했어요.' });
  }
}


//우산에 대한 답변
function isUmbrellaRelated(text) {
  const keywords = ['우산', '비', '비올까', '소나기', '강수확률', 'rain', 'umbrella', '강수량', '강수', '비와', '비오네', '비가 와', '비 내려', '비내려', '비오나'];
  return keywords.some(kw => text.includes(kw));
}

async function handleUmbrellaAdvice({ lat, lon, locationName, uid }, res) {
  try {
    const weather = await getWeather(lat, lon);
    if (!weather) return res.json({ reply: '날씨 정보를 불러오지 못했어요.' });

    const rainAmount = weather.rain;
    const popPercent = weather.pop !== null ? Math.round(weather.pop * 100) : null;

    let rainInfo = '';
    if (rainAmount > 0) {
      rainInfo = `지금 ${locationName}에는 최근 1시간 동안 ${rainAmount}mm의 비가 내렸어요.`;
    } else if (popPercent !== null && popPercent >= 50) {
      rainInfo = `오늘 ${locationName}에는 강수확률이 ${popPercent}%로 우산이 필요할 수 있어요.`;
    } else {
      rainInfo = `현재 ${locationName}에는 비가 오지 않고, 강수 확률도 낮아요.`;
    }

  // 사용자 정보 포맷 구성
  const userInfo = await getUserProfile(uid);
  const userText = userInfo ? `
사용자 정보:
- 이름: ${userInfo.name}
- 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${userInfo.hobbies?.join(', ') || '없음'}
` : '';
  const prompt = `
${userText}
현재 "${locationName}"의 날씨 정보는 다음과 같아요:
- 상태: ${weather.condition}
- 기온: ${weather.temp}℃
- 풍속: ${weather.wind}m/s
- 강수확률: ${popPercent !== null ? popPercent + '%' : '정보 없음'}
- 최근 1시간 강수량: ${rainAmount}mm

${rainInfo}

이 정보를 바탕으로 오늘 우산이 필요할지, 외출 시 어떤 점에 주의하면 좋을지 실용적인 조언을 3~4문장으로 자연스럽게 알려주세요.
`;

    const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );
    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);
    res.json({ reply });
  } catch (err) {
    console.error('❌ Gemini 호출 오류 (우산):', err.message);
    res.json({ reply: '우산에 대한 조언 생성에 실패했어요.' });
  }
}

//옷차림에 대한 답변
function isClothingRelated(text) {
  const keywords = ['뭘 입을까', '옷', '겉옷', '옷차림', '입을까', '패딩', '반팔', '두꺼운', '얇은', 'wearing', 'wear'];
  return keywords.some(kw => text.includes(kw));
}

async function handleClothingAdvice({ lat, lon, locationName, uid }, res) {
  try {
    const weather = await getWeather(lat, lon);
    if (!weather) return res.json({ reply: '날씨 정보를 불러오지 못했어요.' });

  // 사용자 정보 포맷 구성
  const userInfo = await getUserProfile(uid);
  const userText = userInfo ? `
사용자 정보:
- 이름: ${userInfo.name}
- 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${userInfo.hobbies?.join(', ') || '없음'}
` : '';
  const prompt = `
${userText}
지금 "${locationName}"의 날씨는 다음과 같습니다:
- 현재 기온: ${weather.temp}℃
- 체감 온도: ${weather.feelsLike}℃
- 최저 기온: ${weather.tempMin}℃
- 최고 기온: ${weather.tempMax}℃
- 상태: ${weather.condition}
- 풍속: ${weather.wind}m/s

이 정보를 참고해서 오늘 어떤 옷차림이 좋을지 실용적이고 친근하게 3~4문장으로 조언해 주세요.
특히 일교차를 고려해 겉옷이 필요한지, 반팔이 괜찮은지 등을 포함해 주세요.
`;

    const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );
    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);
    res.json({ reply });
  } catch (err) {
    console.error('❌ Gemini 호출 오류 (옷차림):', err.message);
    res.json({ reply: '옷차림에 대한 조언 생성에 실패했어요.' });
  }
}

function isHumidityRelated(text) {
  const keywords = ['습도', '건조해', '촉촉해', 'humidity', '습하', '건조하', '습해', '건조', '축축'];
  return keywords.some(kw => text.includes(kw));
}

// 습도에 대한 조언 생성
async function handleHumidityAdvice({ lat, lon, locationName, uid }, res) {
  try {
    const weather = await getWeather(lat, lon);
    if (!weather) return res.json({ reply: '날씨 정보를 불러오지 못했어요.' });

  // 사용자 정보 포맷 구성
  const userInfo = await getUserProfile(uid);
  const userText = userInfo ? `
사용자 정보:
- 이름: ${userInfo.name}
- 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${userInfo.hobbies?.join(', ') || '없음'}
` : '';
  const prompt = `
${userText}
현재 "${locationName}"의 날씨 정보는 다음과 같아요:
- 기온: ${weather.temp}℃
- 상태: ${weather.condition}
- 습도: ${weather.humidity}%
- 풍속: ${weather.wind}m/s

현재 습도가 어떤 상황인지 간단히 알려주고,
생활에 도움이 되는 짧은 조언을 1~2개, 2~3문장 이내로 자연스럽게 안내해 주세요.
너무 길지 않게, 실용적이고 친근한 말투로 알려주세요.
`;

    const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );
    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);
    res.json({ reply });
  } catch (err) {
    console.error('❌ Gemini 호출 오류 (습도):', err.message);
    res.json({ reply: '습도에 대한 조언 생성에 실패했어요.' });
  }
}

//가시거리에 대한 조언
function isVisibilityRelated(text) {
  const keywords = ['가시거리', '앞이 잘 보일까', '시야', 'visibility', '안개', '흐릿'];
  return keywords.some(kw => text.includes(kw));
}
async function handleVisibilityAdvice({ lat, lon, locationName, uid }, res) {
  try {
    const weather = await getWeather(lat, lon);
    if (!weather) return res.json({ reply: '날씨 정보를 불러오지 못했어요.' });

  // 사용자 정보 포맷 구성
  const userInfo = await getUserProfile(uid);
  const userText = userInfo ? `
사용자 정보:
- 이름: ${userInfo.name}
- 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${userInfo.hobbies?.join(', ') || '없음'}
` : '';
  const prompt = `
${userText}
현재 "${locationName}"의 가시거리는 약 ${weather.visibility}미터입니다.

이 수치를 바탕으로 운전, 외출 등에서 유의할 점을 간단히 1~2가지 조언으로 알려주세요.
내용은 너무 길지 않게, 2~3문장 이내로 실용적이고 자연스럽게 작성해 주세요.
`;

    const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );
    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);
    res.json({ reply });
  } catch (err) {
    console.error('❌ Gemini 호출 오류 (가시거리):', err.message);
    res.json({ reply: '가시거리에 대한 조언 생성에 실패했어요.' });
  }
}

function isSunTimeRelated(text) {
  const keywords = ['일출', '일몰', '해뜨는 시간', '해지는 시간', '해 뜨는', '해 지는', 'sunrise', 'sunset'];
  return keywords.some(kw => text.includes(kw));
}

//일몰, 일출에 대한 조언
async function handleSunTimeAdvice({ lat, lon, locationName, uid }, res) {
  try {
    const weather = await getWeather(lat, lon);
    if (!weather || !weather.sunrise || !weather.sunset)
      return res.json({ reply: '일출/일몰 정보를 불러오지 못했어요.' });

    const sunriseStr = new Date(weather.sunrise * 1000).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const sunsetStr = new Date(weather.sunset * 1000).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });

  // 사용자 정보 포맷 구성
  const userInfo = await getUserProfile(uid);
  const userText = userInfo ? `
사용자 정보:
- 이름: ${userInfo.name}
- 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${userInfo.hobbies?.join(', ') || '없음'}
` : '';
  const prompt = `
${userText}
"${locationName}"의 오늘 일출/일몰 시간은 다음과 같습니다:
- 일출: ${sunriseStr}
- 일몰: ${sunsetStr}

이 정보를 참고해 외출 타이밍이나 야외 활동 관련 간단한 조언을 1~2개만, 2~3문장으로 알려주세요.
`;

    const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );
    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);
    res.json({ reply });
  } catch (err) {
    console.error('❌ Gemini 호출 오류 (일출/일몰):', err.message);
    res.json({ reply: '일출/일몰에 대한 조언 생성에 실패했어요.' });
  }
}

function isUVRelated(text) {
  const keywords = ['자외선', 'uv', '햇빛', '선크림', '썬크림', '태양', '강한 햇살'];
  return keywords.some(kw => text.toLowerCase().includes(kw));
}

//자외선에 대한 조언 
async function handleUVAdvice({ lat, lon, locationName, uid }, res) {
  try {
    const weather = await getWeather(lat, lon);
    if (!weather || weather.uvi === undefined || weather.uvi === null) {
      return res.json({ reply: '자외선 정보를 불러오지 못했어요.' });
    }

    const uv = weather.uvi;
    let level = '정보 없음';
    if (uv < 3) level = '낮음';
    else if (uv < 6) level = '보통';
    else if (uv < 8) level = '높음';
    else if (uv < 11) level = '매우 높음';
    else level = '위험';

  // 사용자 정보 포맷 구성
  const userInfo = await getUserProfile(uid);
  const userText = userInfo ? `
사용자 정보:
- 이름: ${userInfo.name}
- 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${userInfo.hobbies?.join(', ') || '없음'}
` : '';
  const prompt = `
${userText}
현재 "${locationName}"의 자외선 지수는 ${uv}로 "${level}" 수준입니다.

사용자가 오늘 외출 시 참고할 수 있도록, 자외선 차단/외출 시간 조절/피부 보호 등 간단한 조언을 2~3문장으로 자연스럽게 안내해 주세요.
내용은 너무 길지 않게, 실용적이고 친근한 말투로 작성해주세요.
`;

    const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );
    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);
    res.json({ reply });
  } catch (err) {
    console.error('❌ Gemini 호출 오류 (자외선):', err.message);
    res.json({ reply: '자외선에 대한 조언 생성에 실패했어요.' });
  }
}

//풍향 퐁속에 대한 조언
function isWindRelated(text) {
  const keywords = ['바람', '풍속', '풍향', '세찬 바람', '바람세기', 'wind', '강풍'];
  return keywords.some(kw => text.includes(kw));
}
//각도 텍스트로 변환
function getWindDirectionText(deg) {
  if (deg === undefined || deg === null) return '정보 없음';
  const directions = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  const index = Math.round(deg / 45) % 8;
  return directions[index];
}

async function handleWindAdvice({ lat, lon, locationName, uid }, res) {
  try {
    const weather = await getWeather(lat, lon);
    if (!weather) return res.json({ reply: '날씨 정보를 불러오지 못했어요.' });

    const speed = weather.wind;
    const deg = weather.windDeg;
    const direction = getWindDirectionText(deg);

  // 사용자 정보 포맷 구성
  const userInfo = await getUserProfile(uid);
  const userText = userInfo ? `
사용자 정보:
- 이름: ${userInfo.name}
- 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${userInfo.hobbies?.join(', ') || '없음'}
` : '';
  const prompt = `
${userText}
현재 "${locationName}"의 바람 정보는 다음과 같습니다:
- 풍속: ${speed} m/s
- 풍향: ${direction} (${deg}°)

바람이 강하거나 방향이 특이할 경우 외출 시 주의할 점을 2~3문장 이내로 간단하게 조언해 주세요.
`;

    const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );
    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);
    res.json({ reply });
  } catch (err) {
    console.error('❌ Gemini 호출 오류 (풍향/풍속):', err.message);
    res.json({ reply: '바람에 대한 조언 생성에 실패했어요.' });
  }
}

//구름에 대한 조언
function isCloudRelated(text) {
  const keywords = ['구름', '흐림', '하늘 상태', '맑음', '흐려', 'cloud', 'cloudy'];
  return keywords.some(kw => text.includes(kw));
}

async function handleCloudAdvice({ lat, lon, locationName, uid }, res) {
  try {
    const weather = await getWeather(lat, lon);
    if (!weather) return res.json({ reply: '날씨 정보를 불러오지 못했어요.' });

    const cloud = weather.cloud;

  // 사용자 정보 포맷 구성
  const userInfo = await getUserProfile(uid);
  const userText = userInfo ? `
사용자 정보:
- 이름: ${userInfo.name}
- 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${userInfo.hobbies?.join(', ') || '없음'}
` : '';
  const prompt = `
${userText}
현재 "${locationName}"의 구름량은 약 ${cloud}%입니다.

구름량을 기준으로 오늘 하늘 상태와 햇빛/그늘 여부, 외출 시 유의점 등을
실용적이고 친근하게 2~3문장 이내로 요약해서 안내해 주세요.
`;

    const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );
    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);
    res.json({ reply });
  } catch (err) {
    console.error('❌ Gemini 호출 오류 (구름량):', err.message);
    res.json({ reply: '구름량에 대한 조언 생성에 실패했어요.' });
  }
}

//이슬점에 대한 답변
function isDewPointRelated(text) {
  const keywords = ['이슬점', 'dew', '끈적', '불쾌', '습할까', '쾌적할까'];
  return keywords.some(kw => text.includes(kw));
}

async function handleDewPointAdvice({ lat, lon, locationName, uid }, res) {
  try {
    const weather = await getWeather(lat, lon);
    if (!weather || weather.dewPoint === undefined) {
      return res.json({ reply: '이슬점 정보를 불러오지 못했어요.' });
    }

    const dew = weather.dewPoint;
    let feeling = '';

    if (dew < 11) {
      feeling = '공기가 다소 건조해서 쾌적하게 느껴질 수 있어요.';
    } else if (dew < 16) {
      feeling = '쾌적한 날씨로 활동하기 좋은 수준이에요.';
    } else if (dew < 21) {
      feeling = '조금 습하게 느껴질 수 있어요. 시원한 옷차림을 추천해요.';
    } else if (dew < 25) {
      feeling = '꽤 습해서 불쾌감이 생길 수 있어요. 시원한 환경을 유지하세요.';
    } else {
      feeling = '매우 습하고 끈적일 수 있어요. 땀 배출이 어려우니 주의가 필요해요.';
    }

  // 사용자 정보 포맷 구성
  const userInfo = await getUserProfile(uid);
  const userText = userInfo ? `
사용자 정보:
- 이름: ${userInfo.name}
- 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${userInfo.hobbies?.join(', ') || '없음'}
` : '';
  const prompt = `
${userText}
현재 "${locationName}"의 이슬점은 ${dew.toFixed(1)}℃입니다.

${feeling}

위 정보를 기반으로 실용적인 습도 체감 조언을 2~3문장 이내로 자연스럽게 알려주세요.
`;

    const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );
    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);
    res.json({ reply });
  } catch (err) {
    console.error('❌ Gemini 호출 오류 (이슬점):', err.message);
    res.json({ reply: '이슬점에 대한 조언 생성에 실패했어요.' });
  }
}


module.exports = {
  // 인식 함수
  isAirRelated,
  isPollenRelated,
  isUmbrellaRelated,
  isClothingRelated,
  isHumidityRelated,
  isVisibilityRelated,
  isSunTimeRelated,
  isUVRelated,
  isWindRelated,
  isCloudRelated,
  isDewPointRelated,

  // 처리 함수
  handleAirAdvice,
  handlePollenAdvice,
  handleUmbrellaAdvice,
  handleClothingAdvice,
  handleHumidityAdvice,
  handleVisibilityAdvice,
  handleSunTimeAdvice,
  handleUVAdvice,
  handleWindAdvice,
  handleCloudAdvice,
  handleDewPointAdvice
};
