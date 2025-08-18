const axios = require('axios');
const { Readable } = require('stream');

class GeminiService {
  constructor() {
    this.activeConversations = new Map();
    this.apiKey = process.env.GEMINI_API_KEY;
    // Use a working model for development
    this.model = process.env.GEMINI_MODEL || 'gemini-2.0-flash-live-001';
    this.baseURL = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  async startConversation(socket, data) {
    try {
      const conversationId = socket.id;
      
      // Initialize conversation state
      this.activeConversations.set(conversationId, {
        socket,
        isActive: true,
        lastActivity: Date.now(),
        conversationHistory: []
      });

      // Send initial response
      socket.emit('conversationStarted', {
        message: 'Hello! I\'m Rev, your Revolt Motors assistant. How can I help you today?',
        conversationId
      });

      console.log(`Conversation started for socket: ${conversationId}`);
    } catch (error) {
      console.error('Error starting conversation:', error);
      throw error;
    }
  }

  async processAudio(socket, data) {
    try {
      const conversationId = socket.id;
      const conversation = this.activeConversations.get(conversationId);
      
      if (!conversation || !conversation.isActive) {
        throw new Error('No active conversation found');
      }

      // Update last activity
      conversation.lastActivity = Date.now();

      // Convert base64 audio to buffer
      const audioBuffer = Buffer.from(data.audio, 'base64');
      
      // Prepare the request for Gemini Live API
      const requestBody = {
        contents: [{
          role: "user",
          parts: [{
            inline_data: {
              mime_type: "audio/webm",
              data: data.audio
            }
          }]
        }],
        generation_config: {
          temperature: 0.7,
          top_p: 0.8,
          top_k: 40
        },
        system_instruction: {
          parts: [{
            text: `You are Rev, a helpful and knowledgeable assistant for Revolt Motors. You should:
            1. Only provide information about Revolt Motors, their electric vehicles, services, and related topics
            2. Be conversational and friendly in your responses
            3. Keep responses concise but informative
            4. If asked about topics unrelated to Revolt Motors, politely redirect the conversation back to Revolt Motors
            5. Speak naturally and conversationally
            6. Respond in the same language the user is speaking in`
          }]
        }
      };

      // Make request to Gemini Live API
      console.log(`Making request to Gemini API with model: ${this.model}`);
      console.log(`Audio data size: ${data.audio.length} characters`);
      
      const response = await axios.post(
        `${this.baseURL}/${this.model}:generateContent?key=${this.apiKey}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000 // 30 second timeout
        }
      );

      console.log('Gemini API response received:', response.status);

      if (response.data && response.data.candidates && response.data.candidates[0]) {
        const aiResponse = response.data.candidates[0].content.parts[0].text;
        
        // Store in conversation history
        conversation.conversationHistory.push({
          user: 'User spoke',
          assistant: aiResponse,
          timestamp: Date.now()
        });

        // Send response back to client
        socket.emit('aiResponse', {
          text: aiResponse,
          conversationId
        });

        console.log(`AI Response sent for socket: ${conversationId}`);
      } else {
        console.error('Invalid response structure:', response.data);
        throw new Error('Invalid response from Gemini API');
      }

    } catch (error) {
      console.error('Error processing audio:', error);
      console.error('Error details:', error.response?.data || error.message);
      
      // Send error response to client
      socket.emit('error', {
        message: 'Sorry, I encountered an error processing your request. Please try again.',
        conversationId: socket.id
      });
      
      throw error;
    }
  }

  async interrupt(socket) {
    try {
      const conversationId = socket.id;
      const conversation = this.activeConversations.get(conversationId);
      
      if (conversation) {
        // Mark conversation as interrupted
        conversation.isActive = false;
        
        // Send interruption acknowledgment
        socket.emit('interrupted', {
          message: 'I\'m listening...',
          conversationId
        });
        
        // Reactivate conversation after a short delay
        setTimeout(() => {
          if (conversation) {
            conversation.isActive = true;
          }
        }, 1000);
        
        console.log(`Conversation interrupted for socket: ${conversationId}`);
      }
    } catch (error) {
      console.error('Error handling interruption:', error);
      throw error;
    }
  }

  cleanup(socketId) {
    try {
      const conversation = this.activeConversations.get(socketId);
      if (conversation) {
        conversation.isActive = false;
        this.activeConversations.delete(socketId);
        console.log(`Cleaned up conversation for socket: ${socketId}`);
      }
    } catch (error) {
      console.error('Error cleaning up conversation:', error);
    }
  }

  // Cleanup old conversations (run periodically)
  cleanupOldConversations() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    for (const [socketId, conversation] of this.activeConversations.entries()) {
      if (now - conversation.lastActivity > maxAge) {
        this.cleanup(socketId);
      }
    }
  }
}

// Create singleton instance
const geminiService = new GeminiService();

// Run cleanup every 5 minutes
setInterval(() => {
  geminiService.cleanupOldConversations();
}, 5 * 60 * 1000);

module.exports = { geminiService };
