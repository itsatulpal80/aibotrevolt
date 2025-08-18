import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';
import VoiceChat from './components/VoiceChat';

function App() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to Socket.IO server
    const newSocket = io('http://localhost:5000');
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <div className="logo">
          <div className="logo-icon">◆</div>
          <span className="logo-text">REVOLT</span>
        </div>
        <div className="toggle-switch">
          <input type="checkbox" id="toggle" />
          <label htmlFor="toggle"></label>
        </div>
      </header>
      
      <main className="App-main">
        <div className="chat-section">
          <div className="robot-section">
            <div className="robot-icon">
              <div className="robot-head"></div>
              <div className="robot-wheel"></div>
            </div>
            <h1 className="chat-title">Talk to Rev</h1>
            <p className="chat-subtitle">Your Revolt Motors Voice Assistant</p>
          </div>
          
          {isConnected ? (
            <VoiceChat socket={socket} />
          ) : (
            <div className="connection-status">
              Connecting to voice assistant...
            </div>
          )}
        </div>
      </main>
      
      <footer className="App-footer">
        <div className="system-message">
          <div>Activate Windows</div>
          <div>Go to Settings to activate Windows.</div>
        </div>
      </footer>
    </div>
  );
}

export default App;
