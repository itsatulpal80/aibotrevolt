const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/build')));

// Import routes
const geminiRoutes = require('./routes/gemini');

// Routes
app.use('/api/gemini', geminiRoutes);

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('startConversation', async (data) => {
    try {
      const { geminiService } = require('./services/geminiService');
      await geminiService.startConversation(socket, data);
    } catch (error) {
      console.error('Error starting conversation:', error);
      socket.emit('error', { message: 'Failed to start conversation' });
    }
  });

  socket.on('sendAudio', async (data) => {
    try {
      const { geminiService } = require('./services/geminiService');
      await geminiService.processAudio(socket, data);
    } catch (error) {
      console.error('Error processing audio:', error);
      socket.emit('error', { message: 'Failed to process audio' });
    }
  });

  socket.on('interrupt', async () => {
    try {
      const { geminiService } = require('./services/geminiService');
      await geminiService.interrupt(socket);
    } catch (error) {
      console.error('Error interrupting:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const { geminiService } = require('./services/geminiService');
    geminiService.cleanup(socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
