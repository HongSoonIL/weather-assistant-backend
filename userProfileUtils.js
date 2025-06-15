// userProfileUtils.js
const { db } = require('./firebaseAdmin');

// 사용자 프로필 저장
async function saveUserProfile(uid, profileData) {
  try {
    await db.collection('users').doc(uid).set(profileData);
    return true;
  } catch (err) {
    console.error('❌ 사용자 정보 저장 실패:', err.message);
    return false;
  }
}

// 사용자 프로필 불러오기
async function getUserProfile(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return null;
    return doc.data();
  } catch (err) {
    console.error('❌ 사용자 정보 불러오기 실패:', err.message);
    return null;
  }
}

module.exports = {
  saveUserProfile,
  getUserProfile
};