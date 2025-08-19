import React, { useState, useEffect, useRef } from 'react';
import './VoiceChat.css';

const VoiceChat = ({ socket }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [conversationActive, setConversationActive] = useState(false);
  const [lastMessage, setLastMessage] = useState('');
  const [error, setError] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [showStartButton, setShowStartButton] = useState(true);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const isRecordingRef = useRef(false);
  const conversationTimeoutRef = useRef(null);
  const conversationActiveRef = useRef(false);

  useEffect(() => {
    if (!socket) return;

    // Socket event listeners
    socket.on('conversationStarted', (data) => {
      console.log('🎉 Conversation started:', data);
      setConversationStarted(true);
      setConversationActive(true);
      conversationActiveRef.current = true; // Update ref immediately
      setShowStartButton(false);
      setLastMessage(data.message);
      speakText(data.message);
      
      // Start listening automatically after the initial greeting
      setTimeout(() => {
        console.log('🎤 Auto-starting listening after greeting...');
        console.log('📊 Current state:', {
          conversationActive: conversationActiveRef.current,
          isRecording: isRecordingRef.current,
          isSpeaking: false
        });
        startListening();
      }, 3000); // Wait 3 seconds after greeting
    });

    socket.on('aiResponse', (data) => {
      console.log('🤖 AI Response received:', data);
      setLastMessage(data.text);
      speakText(data.text);
      
      // Reset conversation timeout
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
      }
      
      // Set timeout to end conversation if no activity
      conversationTimeoutRef.current = setTimeout(() => {
        console.log('⏰ Conversation timeout - ending chat');
        endConversation();
      }, 30000); // 30 seconds of inactivity
      
      // Start listening again after AI finishes speaking
      setTimeout(() => {
        if (conversationActiveRef.current) {
          console.log('🎤 Auto-starting listening after AI response...');
          startListening();
        }
      }, 1000); // Wait 1 second after AI response
    });

    socket.on('interrupted', (data) => {
      console.log('⏹️ Conversation interrupted:', data);
      setIsSpeaking(false);
      setLastMessage(data.message);
      // Start listening immediately when interrupted
      if (conversationActiveRef.current) {
        console.log('🎤 Auto-starting listening after interruption...');
        startListening();
      }
    });

    socket.on('error', (data) => {
      console.error('❌ Socket error:', data);
      setError(data.message);
      setIsListening(false);
      setIsSpeaking(false);
    });

    return () => {
      socket.off('conversationStarted');
      socket.off('aiResponse');
      socket.off('interrupted');
      socket.off('error');
    };
  }, [socket, conversationActive]);

  const initializeVoiceAssistant = async () => {
    try {
      setError('');
      await requestMicrophonePermission();
      setIsInitialized(true);
    } catch (error) {
      setError('Failed to initialize voice assistant: ' + error.message);
    }
  };

  const startConversation = async () => {
    try {
      if (!isInitialized) {
        await initializeVoiceAssistant();
      }
      socket.emit('startConversation', {});
    } catch (error) {
      setError('Failed to start conversation: ' + error.message);
    }
  };

  const endConversation = () => {
    setConversationActive(false);
    conversationActiveRef.current = false; // Update ref immediately
    setIsListening(false);
    setIsSpeaking(false);
    setShowStartButton(true);
    setLastMessage('Conversation ended. Click "Start Voice Chat" to begin again.');
    
    if (conversationTimeoutRef.current) {
      clearTimeout(conversationTimeoutRef.current);
    }
    
    // Stop any ongoing speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const interruptAI = () => {
    if (isSpeaking) {
      socket.emit('interrupt', {});
      // Stop speech immediately
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;
      return stream;
    } catch (error) {
      throw new Error('Microphone permission denied');
    }
  };

  const startListening = async () => {
    console.log('🎤 startListening called with state:', {
      isRecording: isRecordingRef.current,
      isSpeaking,
      conversationActive: conversationActiveRef.current
    });
    
    if (isRecordingRef.current || isSpeaking) {
      console.log('❌ Cannot start listening - already recording or speaking');
      return;
    }

    // Use ref for more reliable state checking
    if (!conversationActiveRef.current && !conversationStarted) {
      console.log('❌ Cannot start listening - conversation not active');
      return;
    }

    try {
      setError('');
      console.log('🎤 Starting automatic voice recording...');
      
      if (!streamRef.current) {
        console.log('📱 Requesting microphone permission...');
        await requestMicrophonePermission();
        console.log('✅ Microphone permission granted');
      }

      const stream = streamRef.current;
      
      // Check if MediaRecorder is supported
      if (!window.MediaRecorder) {
        throw new Error('MediaRecorder not supported in this browser');
      }

      // Try different audio formats for better compatibility
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/wav';
          }
        }
      }

      console.log('🎵 Using audio format:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      isRecordingRef.current = true;

      mediaRecorder.ondataavailable = (event) => {
        console.log('📊 Audio data chunk received:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        console.log('✅ MediaRecorder started successfully - Listening for voice...');
      };

      mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event.error);
        setError('Recording error: ' + event.error.message);
        isRecordingRef.current = false;
        setIsListening(false);
      };

      mediaRecorder.onstop = async () => {
        console.log('⏹️ MediaRecorder stopped, processing audio...');
        console.log('📦 Total audio chunks:', audioChunksRef.current.length);
        try {
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            console.log('🎵 Audio blob created:', audioBlob.size, 'bytes');
            await sendAudioToServer(audioBlob);
          } else {
            console.log('🔇 No audio data recorded - silence detected');
            setError('No audio detected. Please try speaking louder.');
          }
        } catch (error) {
          console.error('❌ Error processing recorded audio:', error);
          setError('Failed to process recorded audio: ' + error.message);
        }
        isRecordingRef.current = false;
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsListening(true);
      console.log('🎤 Voice recording started successfully - Speak now!');
      
      // Stop recording after 10 seconds of silence or when user stops speaking
      silenceTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          console.log('⏰ Silence timeout reached, stopping recording');
          stopListening();
        }
      }, 10000);

    } catch (error) {
      console.error('❌ Recording error:', error);
      setError('Failed to start recording: ' + error.message);
      isRecordingRef.current = false;
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      try {
        mediaRecorderRef.current.stop();
        setIsListening(false);
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
      } catch (error) {
        console.error('Error stopping recording:', error);
        setError('Failed to stop recording');
      }
    }
  };

  // Cleanup function to stop all tracks
  const cleanupAudioStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanupAudioStream();
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
      }
    };
  }, []);

  // Helper function to convert array buffer to base64
  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const sendAudioToServer = async (audioBlob) => {
    try {
      console.log('🚀 Sending audio to server...');
      console.log('📊 Audio blob size:', audioBlob.size, 'bytes');
      console.log('🎵 Audio type:', audioBlob.type);
      
      // Check if audio blob is too large (limit to 5MB)
      if (audioBlob.size > 5 * 1024 * 1024) {
        console.log('⚠️ Audio file too large');
        setError('Audio file too large. Please record a shorter message.');
        return;
      }

      // Check if audio blob is too small (might be silence)
      if (audioBlob.size < 1000) {
        console.log('🔇 Audio too quiet');
        setError('Audio too quiet. Please speak louder.');
        return;
      }

      console.log('🔄 Converting audio to base64...');
      // Convert audio to base64 using a more efficient method
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = arrayBufferToBase64(arrayBuffer);
      
      console.log('✅ Audio converted to base64');
      console.log('📏 Base64 length:', base64Audio.length, 'characters');

      console.log('📡 Emitting audio to server via Socket.IO...');
      // Send to server
      socket.emit('sendAudio', {
        audio: base64Audio,
        format: audioBlob.type || 'audio/webm'
      });
      
      console.log('✅ Audio sent to server successfully!');
      console.log('⏳ Waiting for AI response...');

    } catch (error) {
      console.error('❌ Audio conversion/sending error:', error);
      setError('Failed to send audio: ' + error.message);
    }
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      // Stop any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsListening(false);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="voice-chat">
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {showStartButton && (
        <div className="start-button-container">
          <button 
            className="start-chat-button"
            onClick={startConversation}
            disabled={!socket}
          >
            🎤 Start Voice Chat
          </button>
          <p className="start-hint">Click to begin your conversation with Rev</p>
        </div>
      )}

      {lastMessage && (
        <div className="message-display">
          <div className="message-text">{lastMessage}</div>
        </div>
      )}

      {conversationActive && (
        <div className="conversation-controls">
          <button 
            className="interrupt-button"
            onClick={interruptAI}
            disabled={!isSpeaking}
          >
            🔇 Stop AI
          </button>
          <button 
            className="end-conversation-button"
            onClick={endConversation}
          >
            ❌ End Chat
          </button>
        </div>
      )}

      <div className="voice-status">
        <div className={`status-indicator ${isListening ? 'listening' : ''} ${isSpeaking ? 'speaking' : ''}`}>
          {!conversationStarted && !showStartButton && 'Initializing...'}
          {conversationStarted && !isListening && !isSpeaking && conversationActive && 'Ready to listen'}
          {isListening && 'Listening...'}
          {isSpeaking && 'AI is speaking...'}
          {!conversationActive && !showStartButton && 'Conversation ended'}
        </div>
      </div>
    </div>
  );
};

export default VoiceChat;
