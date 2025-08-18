# Revolt Voice Chat Assistant

A real-time conversational voice interface using the Gemini Live API, replicating the functionality of the Revolt Motors chatbot.

## Features

- 🎤 Real-time voice conversation with AI
- 🔄 Interruption support (stop AI while speaking)
- 🌍 Multi-language support
- ⚡ Low latency responses (1-2 seconds)
- 🎨 Clean, modern UI matching Revolt Motors design
- 🔒 Server-to-server architecture for security

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Gemini API key
- Modern web browser with microphone support

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd revolt-voice-chat
```

### 2. Install Dependencies

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### 3. Configure Environment Variables

1. Copy the environment example file:
```bash
cp env.example .env
```

2. Edit `.env` file and add your Gemini API key:
```env
GEMINI_API_KEY=your_actual_api_key_here
GEMINI_MODEL=gemini-2.5-flash-preview-native-audio-dialog
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
```

### 4. Get Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Create a free account
3. Generate an API key
4. Add the key to your `.env` file

**Note**: For development, you can use these models to avoid rate limits:
- `gemini-2.0-flash-live-001`
- `gemini-live-2.5-flash-preview`

### 5. Run the Application

#### Development Mode

```bash
# Terminal 1: Start backend server
npm run dev

# Terminal 2: Start frontend (in a new terminal)
npm run client
```

#### Production Mode

```bash
# Build the frontend
npm run build

# Start the server
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Usage

1. **Start Conversation**: Click the blue microphone button to begin
2. **Speak**: Click and hold the microphone button while speaking
3. **Listen**: The AI will respond with voice and text
4. **Interrupt**: Click the button while AI is speaking to interrupt
5. **Continue**: Click the microphone button again to continue the conversation

## API Endpoints

### Health Check
```
GET /api/gemini/health
```

### Get Conversation History
```
GET /api/gemini/conversation/:socketId
```

### Get Active Conversations
```
GET /api/gemini/active-conversations
```

## Socket.IO Events

### Client to Server
- `startConversation` - Initialize a new conversation
- `sendAudio` - Send audio data to AI
- `interrupt` - Interrupt AI response

### Server to Client
- `conversationStarted` - Confirmation of conversation start
- `aiResponse` - AI response with text
- `interrupted` - Confirmation of interruption
- `error` - Error messages

## Architecture

```
┌─────────────┐    WebSocket    ┌─────────────┐    HTTP API    ┌─────────────┐
│   React     │ ◄─────────────► │   Node.js   │ ◄────────────► │   Gemini    │
│  Frontend   │                 │   Backend   │                │   Live API  │
└─────────────┘                 └─────────────┘                └─────────────┘
```

## System Instructions

The AI is configured with these system instructions:

```
You are Rev, a helpful and knowledgeable assistant for Revolt Motors. You should:
1. Only provide information about Revolt Motors, their electric vehicles, services, and related topics
2. Be conversational and friendly in your responses
3. Keep responses concise but informative
4. If asked about topics unrelated to Revolt Motors, politely redirect the conversation back to Revolt Motors
5. Speak naturally and conversationally
6. Respond in the same language the user is speaking in
```

## Troubleshooting

### Common Issues

1. **Microphone Permission Denied**
   - Ensure your browser has microphone access
   - Check browser settings for microphone permissions

2. **API Key Issues**
   - Verify your Gemini API key is correct
   - Check API key permissions and quotas

3. **Connection Issues**
   - Ensure both frontend and backend are running
   - Check firewall settings
   - Verify ports 3000 and 5000 are available

4. **Audio Format Issues**
   - The app uses WebM audio format
   - Ensure your browser supports MediaRecorder API

### Debug Mode

Enable debug logging by setting:
```env
NODE_ENV=development
DEBUG=true
```

## Deployment

### Heroku Deployment

1. Create a Heroku app
2. Set environment variables in Heroku dashboard
3. Deploy using Heroku CLI or GitHub integration

### Docker Deployment

```bash
# Build Docker image
docker build -t revolt-voice-chat .

# Run container
docker run -p 5000:5000 --env-file .env revolt-voice-chat
```

### Environment Variables for Production

```env
GEMINI_API_KEY=your_production_api_key
GEMINI_MODEL=gemini-2.5-flash-preview-native-audio-dialog
PORT=5000
NODE_ENV=production
CLIENT_URL=https://your-domain.com
```

## Performance Optimization

- Audio compression for faster transmission
- Connection pooling for multiple users
- Caching for frequently asked questions
- Rate limiting to prevent API abuse

## Security Considerations

- API keys stored in environment variables
- CORS configuration for client origins
- Input validation and sanitization
- Rate limiting on API endpoints

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section
- Review the Gemini Live API documentation

## Demo Video Requirements

When creating your demo video, ensure it shows:
- Natural conversation flow
- Clear interruption demonstration
- Low latency responses
- Multi-language support (if applicable)
- Overall responsiveness

Upload to Google Drive with public viewing permissions and share the link.
