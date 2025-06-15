let conversationHistory = [];

module.exports = {
  getHistory: () => conversationHistory,

  addUserMessage: (text) => {
    conversationHistory.push({
      role: 'user',
      parts: [{ text }]
    });
  },

  addBotMessage: (text) => {
    conversationHistory.push({
      role: 'model',
      parts: [{ text }]
    });
  },

  reset: () => {
    conversationHistory = [];
  },

  trimTo: (count) => {
    conversationHistory = conversationHistory.slice(-count);
  }
};
