const axios = require('axios');
const { Readable } = require('stream');

class GeminiService {
  constructor() {
    this.activeConversations = new Map();
    this.apiKey = process.env.GEMINI_API_KEY;
    // Use a working model for development
    this.model = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
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
        conversationHistory: [],
        userTone: null,
        userLanguage: null
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
          temperature: 0.8,
          top_p: 0.9,
          top_k: 40
        },
        system_instruction: {
          parts: [{
            text: `You are Rev, a helpful and knowledgeable assistant for Revolt Motors. Follow these guidelines:

1. **Topic Focus**: Only provide information about Revolt Motors, their electric vehicles, services, dealerships, and related topics. If asked about other topics, politely redirect to Revolt Motors.

2. **Tone Matching**: Match the user's tone and style. If they use casual language like "kya hal ha", respond similarly. If they're formal, be formal. If they're excited, be enthusiastic.

3. **Language Adaptation**: Respond in the same language the user is speaking (Hindi, English, etc.). Use natural, conversational language.

4. **Conversation Style**: Be friendly, helpful, and engaging. Keep responses concise but informative.

5. **Vehicle Information**: Provide accurate details about Revolt Motors bikes, features, pricing, availability, and services.

6. **Natural Flow**: Make the conversation feel natural and human-like. Don't be robotic.

7. **Greeting Responses**: If user says "kya hal ha" or similar greetings, respond warmly and ask how you can help with Revolt Motors.

Remember: You're a helpful friend who knows everything about Revolt Motors and adapts to the user's communication style.`
          }]
        }
      };

      // Add conversation history for context
      if (conversation.conversationHistory.length > 0) {
        const recentHistory = conversation.conversationHistory.slice(-3); // Last 3 exchanges
        recentHistory.forEach(exchange => {
          requestBody.contents.unshift({
            role: "user",
            parts: [{ text: exchange.user }]
          });
          requestBody.contents.unshift({
            role: "model",
            parts: [{ text: exchange.assistant }]
          });
        });
      }

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

        // Keep only last 10 exchanges to prevent context overflow
        if (conversation.conversationHistory.length > 10) {
          conversation.conversationHistory = conversation.conversationHistory.slice(-10);
        }

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
