import React, { useState, useEffect, useRef } from 'react';
import './VoiceChat.css';

const VoiceChat = ({ socket }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [lastMessage, setLastMessage] = useState('');
  const [error, setError] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    if (!socket) return;

    // Socket event listeners
    socket.on('conversationStarted', (data) => {
      setConversationStarted(true);
      setLastMessage(data.message);
      speakText(data.message);
      // Start listening automatically after the initial greeting
      setTimeout(() => {
        startListening();
      }, 3000); // Wait 3 seconds after greeting
    });

    socket.on('aiResponse', (data) => {
      setLastMessage(data.text);
      speakText(data.text);
      // Start listening again after AI finishes speaking
      setTimeout(() => {
        startListening();
      }, 1000); // Wait 1 second after AI response
    });

    socket.on('interrupted', (data) => {
      setIsSpeaking(false);
      setLastMessage(data.message);
      // Start listening immediately when interrupted
      startListening();
    });

    socket.on('error', (data) => {
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
  }, [socket]);

  // Initialize microphone and start conversation automatically
  useEffect(() => {
    if (socket && !isInitialized) {
      initializeVoiceAssistant();
    }
  }, [socket, isInitialized]);

  const initializeVoiceAssistant = async () => {
    try {
      setError('');
      await requestMicrophonePermission();
      setIsInitialized(true);
      // Start conversation automatically
      socket.emit('startConversation', {});
    } catch (error) {
      setError('Failed to initialize voice assistant: ' + error.message);
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
    if (isRecordingRef.current || isSpeaking) return;

    try {
      setError('');
      
      if (!streamRef.current) {
        await requestMicrophonePermission();
      }

      const stream = streamRef.current;
      
      // Check if MediaRecorder is supported
      if (!window.MediaRecorder) {
        throw new Error('MediaRecorder not supported in this browser');
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      isRecordingRef.current = true;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          await sendAudioToServer(audioBlob);
        } catch (error) {
          console.error('Error processing recorded audio:', error);
          setError('Failed to process recorded audio');
        }
        isRecordingRef.current = false;
      };

      mediaRecorder.start();
      setIsListening(true);
      
      // Stop recording after 10 seconds of silence or when user stops speaking
      silenceTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          stopListening();
        }
      }, 10000);

    } catch (error) {
      console.error('Recording error:', error);
      setError('Failed to start recording: ' + error.message);
      isRecordingRef.current = false;
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
      // Check if audio blob is too large (limit to 5MB)
      if (audioBlob.size > 5 * 1024 * 1024) {
        setError('Audio file too large. Please record a shorter message.');
        return;
      }

      // Convert audio to base64 using a more efficient method
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = arrayBufferToBase64(arrayBuffer);

      // Send to server
      socket.emit('sendAudio', {
        audio: base64Audio,
        format: 'webm'
      });

    } catch (error) {
      console.error('Audio conversion error:', error);
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

      {lastMessage && (
        <div className="message-display">
          <div className="message-text">{lastMessage}</div>
        </div>
      )}

      <div className="voice-status">
        <div className={`status-indicator ${isListening ? 'listening' : ''} ${isSpeaking ? 'speaking' : ''}`}>
          {!conversationStarted && 'Initializing...'}
          {conversationStarted && !isListening && !isSpeaking && 'Ready to listen'}
          {isListening && 'Listening...'}
          {isSpeaking && 'AI is speaking...'}
        </div>
      </div>
    </div>
  );
};

export default VoiceChat;
