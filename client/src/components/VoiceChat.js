// 🔴 Only changes marked with comments

import React, { useState, useEffect, useRef } from "react";
import "./VoiceChat.css";

const VoiceChat = ({ socket }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [conversationActive, setConversationActive] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const [error, setError] = useState("");
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
    socket.on("conversationStarted", (data) => {
      console.log("🎉 Conversation started:", data);
      setConversationStarted(true);
      setConversationActive(true);
      conversationActiveRef.current = true;
      setShowStartButton(false);

      // 🔴 Don't auto-speak AI greeting — just display it
      setLastMessage(data.message);

      // 🔴 Start listening immediately (wait for user first)
      setTimeout(() => {
        if (conversationActiveRef.current) {
          startListening();
        }
      }, 1000);
    });

    socket.on("aiResponse", (data) => {
      console.log("🤖 AI Response received:", data);
      setLastMessage(data.text);
      speakText(data.text);

      // Reset conversation timeout (🔴 only counts after user speaks & AI responds)
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
      }
      conversationTimeoutRef.current = setTimeout(() => {
        console.log("⏰ Conversation timeout - ending chat");
        endConversation();
      }, 120000); // 120 seconds of inactivity
    });

    socket.on("interrupted", (data) => {
      console.log("⏹️ Conversation interrupted:", data);
      setIsSpeaking(false);
      setLastMessage(data.message);
      if (conversationActiveRef.current) {
        startListening();
      }
    });

    socket.on("error", (data) => {
      console.error("❌ Socket error:", data);
      setError(data.message);
      setIsListening(false);
      setIsSpeaking(false);
    });

    return () => {
      socket.off("conversationStarted");
      socket.off("aiResponse");
      socket.off("interrupted");
      socket.off("error");
    };
  }, [socket]);

 

  const initializeVoiceAssistant = async () => {
    try {
      setError("");
      await requestMicrophonePermission();
      setIsInitialized(true);
    } catch (error) {
      setError("Failed to initialize voice assistant: " + error.message);
    }
  };

  const startConversation = async () => {
    try {
      if (!isInitialized) {
        await initializeVoiceAssistant();
      }
      socket.emit("startConversation", {});
    } catch (error) {
      setError("Failed to start conversation: " + error.message);
    }
  };

  const endConversation = () => {
    console.log("❌ Ending conversation...");

    setConversationActive(false);
    conversationActiveRef.current = false;
    setIsListening(false);
    setIsSpeaking(false);
    setShowStartButton(true);
    setLastMessage(
      'Conversation ended. Click "Start Voice Chat" to begin again.'
    );

    if (conversationTimeoutRef.current) {
      clearTimeout(conversationTimeoutRef.current);
      conversationTimeoutRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (mediaRecorderRef.current && isRecordingRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("Error stopping media recorder:", err);
      }
    }
    isRecordingRef.current = false;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const interruptAI = () => {
    if (isSpeaking) {
      socket.emit("interrupt", {});
      window.speechSynthesis.cancel();
      setIsSpeaking(false);

      if (conversationActiveRef.current) {
        startListening();
      }
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      return stream;
    } catch (error) {
      throw new Error("Microphone permission denied");
    }
  };

  const startListening = async () => {
    if (isRecordingRef.current || isSpeaking) return;
    if (!conversationActiveRef.current && !conversationStarted) return;

    try {
      setError("");

      if (!streamRef.current) {
        await requestMicrophonePermission();
      }

      const stream = streamRef.current;

      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "audio/mp4";
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "audio/wav";
          }
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
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
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            await sendAudioToServer(audioBlob);
          } else {
            setError("No audio detected. Please try speaking louder.");
          }
        } catch (error) {
          setError("Failed to process recorded audio: " + error.message);
        }
        isRecordingRef.current = false;
      };

      mediaRecorder.start(1000);
      setIsListening(true);

      silenceTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          stopListening();
        }
      }, 10000);
    } catch (error) {
      setError("Failed to start recording: " + error.message);
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
        setError("Failed to stop recording");
      }
    }
  };

  const cleanupAudioStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupAudioStream();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (conversationTimeoutRef.current) clearTimeout(conversationTimeoutRef.current);
    };
  }, []);

  const arrayBufferToBase64 = (buffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const sendAudioToServer = async (audioBlob) => {
    try {
      if (audioBlob.size > 5 * 1024 * 1024) {
        setError("Audio file too large. Please record a shorter message.");
        return;
      }
      if (audioBlob.size < 1000) {
        setError("Audio too quiet. Please speak louder.");
        return;
      }

      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = arrayBufferToBase64(arrayBuffer);

      socket.emit("sendAudio", {
        audio: base64Audio,
        format: audioBlob.type || "audio/webm",
      });
    } catch (error) {
      setError("Failed to send audio: " + error.message);
    }
  };

  const speakText = (text) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
  
      // keep full response (no truncation now)
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
  
        // ✅ wait 2s before listening again
        if (conversationActiveRef.current) {
          setTimeout(() => {
            if (conversationActiveRef.current) startListening();
          }, 2000);
        }
      };
  
      utterance.onerror = () => setIsSpeaking(false);
  
      window.speechSynthesis.speak(utterance);
    }
  };
  

  return (
    <div className="voice-chat">
      {error && <div className="error-message">{error}</div>}

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
          <button className="end-conversation-button" onClick={endConversation}>
            ❌ End Chat
          </button>
        </div>
      )}

      <div className="voice-status">
        <div
          className={`status-indicator ${isListening ? "listening" : ""} ${isSpeaking ? "speaking" : ""
            }`}
        >
          {!conversationStarted && !showStartButton && "Initializing..."}
          {conversationStarted &&
            !isListening &&
            !isSpeaking &&
            conversationActive &&
            "Ready to listen"}
          {isListening && "Listening..."}
          {isSpeaking && "AI is speaking..."}
          {!conversationActive && !showStartButton && "Conversation ended"}
        </div>
      </div>
    </div>
  );
};

export default VoiceChat;
