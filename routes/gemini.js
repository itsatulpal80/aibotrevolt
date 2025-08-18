const express = require('express');
const router = express.Router();
const { geminiService } = require('../services/geminiService');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Gemini service is running',
    timestamp: new Date().toISOString()
  });
});

// Get conversation history
router.get('/conversation/:socketId', (req, res) => {
  try {
    const { socketId } = req.params;
    const conversation = geminiService.activeConversations.get(socketId);
    
    if (conversation) {
      res.json({
        success: true,
        conversation: {
          isActive: conversation.isActive,
          lastActivity: conversation.lastActivity,
          history: conversation.conversationHistory
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get active conversations count
router.get('/active-conversations', (req, res) => {
  try {
    const activeCount = Array.from(geminiService.activeConversations.values())
      .filter(conv => conv.isActive).length;
    
    res.json({
      success: true,
      activeConversations: activeCount,
      totalConversations: geminiService.activeConversations.size
    });
  } catch (error) {
    console.error('Error getting active conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
