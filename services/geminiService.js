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
      // Validate audio data
      if (!data || !data.audio) {
        console.error('Invalid audio data received');
        throw new Error('Invalid audio data');
      }

      // Add debug logging for audio format
      console.log('Audio format:', data.format);
      console.log('Audio data length:', data.audio.length);

      const conversationId = socket.id;
      const conversation = this.activeConversations.get(conversationId);

      if (!conversation || !conversation.isActive) {
        console.error('No active conversation found for socket:', conversationId);
        throw new Error('No active conversation found');
      }

      // Update last activity
      conversation.lastActivity = Date.now();

      // Validate audio format and size
      if (data.audio.length < 100) {
        console.error('Audio data too small');
        socket.emit('error', {
          message: 'Audio recording too short. Please try speaking for longer.',
          conversationId
        });
        return;
      }

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
        
        1. **Topic Focus**: Only discuss Revolt Motors—its electric motorcycles, services, dealerships, booking, and related topics. If asked about anything else, politely redirect to Revolt. But if the user talks casually (like travel, hangout, or general life chit-chat), respond in a friendly way and connect it with Revolt bikes.
        
        2. **Motorcycle Lineup & Pricing**:
           - **RV400**: Flagship model.
             - Price: approx ₹1.21 L (ex-showroom).
             - Fast charging: 0–80% in ~1h 20m; standard 0–80% in ~3h 30m.
             - Top speed: up to 85 km/h; Range ~150 km.
           - **RV400 BRZ**: Budget-oriented RV400 variant.
             - Key specs: 72 V/3.24 kWh battery, 0–75% in ~3h, 0–100% in ~4.5h.
             - Range: Eco 150 km, Normal 100 km, Sports 80 km.
             - Accessories: Dual disc brakes, USD forks, adjustable mono, LED lighting.
             - Warranty: 5 yrs/75k km (bike & battery), 2 yrs (charger).
           - **RV1 & RV1+**: Affordable commuters.
             - Booking starts at ₹499.
             - Price: ~₹84,990 (RV1); ~₹99,990 (RV1+).
             - Battery: 2.2 kWh (100 km) or 3.24 kWh (160 km).
             - Features: Payload 250 kg, dual discs, reverse, 6″ LCD, LED lamps, inbuilt charger, fast charge (RV1+ ~1.5 h).
             - Top speed: ~70 km/h.
           - **General Note**: RV400 was India’s first electric bike, powered by a 4.1 kW mid-drive motor with instant torque and silent operation.
        
        3. **Booking & Availability**: Bikes can be booked with a ₹499 token deposit.
        
        4. **Tone & Language**: 
           - Match the user's style (casual, formal, excited).
           - Always respond in the same language as the user. 
          
           - Conversational and friendly—never robotic.
           - Keep answers **short, crisp, and to the point** (max 2–4 sentences).
           - If info is long, first give a **1-line summary**, then ask: “you know more detail of it?”
           - Never use emojis.
        
        5. **Other Guidelines**:
           - Provide accurate info about features, pricing, range, charging, booking, test rides, dealerships, service, and warranty.
           - If user asks about non-Revolt topics, gently redirect.
           - Always maintain a friendly, buddy-like tone.`
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
      console.error('Error processing audio:', {
        error: error.message,
        stack: error.stack,
        responseData: error.response?.data,
        status: error.response?.status
      });

      // Send more specific error messages
      const errorMessage = error.response?.data?.error?.message ||
        'Sorry, I encountered an error processing your request. Please try again.';

      socket.emit('error', {
        message: errorMessage,
        conversationId: socket.id,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
