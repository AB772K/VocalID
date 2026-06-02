import React, { useState, useRef, useEffect } from 'react';
import { Mic, Play, Upload, Trash2, Clock, AlertCircle } from 'lucide-react';
import '../styles/VoiceRecorder.css';

const VoiceRecorder = ({ userId, onRecordingComplete, currentEnrollmentsCount = 0 }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [enrollmentInfo, setEnrollmentInfo] = useState(null);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  // Set exact recording limit (30 seconds)
  const RECORDING_LIMIT = 30;
  const MAX_ENROLLMENTS = 5;

  // Fetch enrollment info when component mounts or userId changes
  useEffect(() => {
    if (userId) {
      fetchEnrollmentInfo();
    }
  }, [userId]);

  const fetchEnrollmentInfo = async () => {
    try {
      const response = await fetch(`/api/user/${userId}/enrollment-info`);
      const data = await response.json();
      if (data.enrollments) {
        setEnrollmentInfo(data);
      }
    } catch (error) {
      console.error('Error fetching enrollment info:', error);
    }
  };

  const startRecording = async () => {
    // Check if user can record more
    if (enrollmentInfo && !enrollmentInfo.can_record_more) {
      alert(`Maximum ${MAX_ENROLLMENTS} voice enrollments reached. Please delete existing ones to record new samples.`);
      return;
    }

    try {
      // Reset everything
      setRecordedAudio(null);
      setRecordingTime(0);
      audioChunks.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1
        } 
      });
      
      streamRef.current = stream;
      
      // Use the default MIME type that the browser supports
      const options = { 
        mimeType: 'audio/webm;codecs=opus' 
      };
      
      // Check if the browser supports the MIME type
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        delete options.mimeType;
      }
      
      mediaRecorder.current = new MediaRecorder(stream, options);
      
      audioChunks.current = [];
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };
      
      mediaRecorder.current.onstop = () => {
        console.log('MediaRecorder STOPPED - Creating audio blob');
        
        // Get the actual MIME type from the recording
        const mimeType = mediaRecorder.current.mimeType || 'audio/webm;codecs=opus';
        console.log('Recording MIME type:', mimeType);
        
        const audioBlob = new Blob(audioChunks.current, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudio({
          blob: audioBlob,
          url: audioUrl,
          mimeType: mimeType
        });
        
        // Stop the microphone
        if (streamRef.current) {
          console.log('Stopping microphone tracks');
          streamRef.current.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
          });
          streamRef.current = null;
        }
        
        setIsRecording(false);
      };
      
      // Start recording
      console.log('STARTING recording with options:', mediaRecorder.current.mimeType);
      mediaRecorder.current.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      
      // Update timer every second
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          return newTime;
        });
      }, 1000);
      
      // Set the absolute stop timeout
      timerRef.current = setTimeout(() => {
        console.log('30 SECOND TIMEOUT FIRED - FORCE STOPPING');
        forceStopRecording();
      }, RECORDING_LIMIT * 1000);
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Cannot access microphone. Please check permissions and try again.');
    }
  };

  const stopRecordingEarly = () => {
    console.log('MANUAL EARLY STOP');
    forceStopRecording();
  };

  const forceStopRecording = () => {
    console.log('FORCE STOP RECORDING CALLED');
    
    // Clear all timers first
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Stop media recorder if it exists and is recording
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      console.log('Stopping MediaRecorder');
      try {
        mediaRecorder.current.stop();
      } catch (e) {
        console.error('Error stopping MediaRecorder:', e);
      }
    }
    
    // Force stop microphone stream
    if (streamRef.current) {
      console.log('Force stopping microphone stream');
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }
    
    // Force update state
    setIsRecording(false);
    
    // If we have chunks, create audio immediately
    if (audioChunks.current.length > 0 && (!mediaRecorder.current || mediaRecorder.current.state !== 'recording')) {
      console.log('Creating audio from chunks');
      const mimeType = mediaRecorder.current?.mimeType || 'audio/webm;codecs=opus';
      const audioBlob = new Blob(audioChunks.current, { type: mimeType });
      const audioUrl = URL.createObjectURL(audioBlob);
      setRecordedAudio({
        blob: audioBlob,
        url: audioUrl,
        mimeType: mimeType
      });
    }
  };

  const playRecording = () => {
    if (recordedAudio) {
      const audio = new Audio(recordedAudio.url);
      audio.play();
    }
  };


const uploadRecording = async () => {
  if (!recordedAudio || !userId) return;
  
  setIsUploading(true);
  
  try {
    // Convert WebM to WAV using the Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await recordedAudio.blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Convert to WAV
    const wavBlob = await audioBufferToWav(audioBuffer);
    const audioFile = new File([wavBlob], `voice_sample_${userId}.wav`, {
      type: 'audio/wav'
    });
    
    console.log('📤 Uploading CONVERTED WAV file:', {
      size: audioFile.size,
      type: audioFile.type,
      originalType: recordedAudio.blob.type
    });
    
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    formData.append('user_id', userId.toString());
    
    const response = await fetch('/api/audio/upload-enrollment', {
      method: 'POST',
      body: formData,
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('🎯 Upload successful:', result);
      
      // Check if real MFCC was extracted
      if (result.mfcc_extracted && result.audio_duration !== 5.0) {
        alert(`Voice sample ${result.enrollment_count}/5 saved successfully! Real MFCC features extracted.`);
      } else {
        alert(`Voice sample ${result.enrollment_count}/5 saved (using fallback features).`);
      }
      
      setRecordedAudio(null);
      setRecordingTime(0);
      
      // Refresh enrollment info
      await fetchEnrollmentInfo();
      
      if (onRecordingComplete) {
        onRecordingComplete();
      }
    } else {
      let errorMessage = 'Upload failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch (e) {
        errorMessage = `Server error: ${response.status}`;
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error('Upload error:', error);
    alert(`Upload failed: ${error.message}. Please try again.`);
  } finally {
    setIsUploading(false);
  }
};

// Helper function to convert AudioBuffer to WAV
const audioBufferToWav = (buffer) => {
  return new Promise((resolve) => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const bufferLength = buffer.length;
    const dataLength = bufferLength * numChannels * bytesPerSample;
    
    // Create WAV header
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    
    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // File length
    view.setUint32(4, 36 + dataLength, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // Format chunk identifier
    writeString(view, 12, 'fmt ');
    // Format chunk length
    view.setUint32(16, 16, true);
    // Sample format (raw)
    view.setUint16(20, format, true);
    // Channel count
    view.setUint16(22, numChannels, true);
    // Sample rate
    view.setUint32(24, sampleRate, true);
    // Byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * blockAlign, true);
    // Block align (channel count * bytes per sample)
    view.setUint16(32, blockAlign, true);
    // Bits per sample
    view.setUint16(34, bitDepth, true);
    // Data chunk identifier
    writeString(view, 36, 'data');
    // Data chunk length
    view.setUint32(40, dataLength, true);
    
    // Write the PCM samples
    const wavBytes = new Uint8Array(header.byteLength + dataLength);
    wavBytes.set(new Uint8Array(header), 0);
    
    // Interleave the audio data
    const offset = 44;
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    
    const interleaved = new Float32Array(bufferLength * numChannels);
    for (let i = 0; i < bufferLength; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        interleaved[i * numChannels + channel] = channels[channel][i];
      }
    }
    
    // Convert to 16-bit PCM
    const pcmData = new Int16Array(interleaved.length);
    for (let i = 0; i < interleaved.length; i++) {
      pcmData[i] = Math.max(-32768, Math.min(32767, interleaved[i] * 32768));
    }
    
    wavBytes.set(new Uint8Array(pcmData.buffer), offset);
    
    resolve(new Blob([wavBytes], { type: 'audio/wav' }));
  });
};

const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

  const clearRecording = () => {
    setRecordedAudio(null);
    setRecordingTime(0);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('CLEANUP - Stopping everything');
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const canRecordMore = enrollmentInfo ? enrollmentInfo.can_record_more : (currentEnrollmentsCount < MAX_ENROLLMENTS);
  const currentCount = enrollmentInfo ? enrollmentInfo.enrollment_count : currentEnrollmentsCount;

  return (
    <div className="voice-recorder">
      <div className="recorder-header">
        <h3>Voice Enrollment</h3>
        <p>Record your voice to create a unique voiceprint ({currentCount}/{MAX_ENROLLMENTS} samples)</p>
      </div>
      
      {/* Enrollment Status */}
      {enrollmentInfo && (
        <div className="enrollment-status">
          <div className={`status-card ${canRecordMore ? 'active' : 'full'}`}>
            <h4>
              {canRecordMore ? '🎙️ Ready to Record' : '✅ Enrollment Complete'}
            </h4>
            <p>
              {canRecordMore 
                ? `You can record ${MAX_ENROLLMENTS - currentCount} more voice sample(s)`
                : 'You have reached the maximum of 5 voice samples'
              }
            </p>
            {enrollmentInfo.enrollments && enrollmentInfo.enrollments.length > 0 && (
              <div className="mfcc-status">
                <strong>MFCC Status:</strong>
                {enrollmentInfo.enrollments.map((enrollment, index) => (
                  <span key={enrollment.audio_id} className={`mfcc-indicator ${enrollment.has_mfcc ? 'success' : 'error'}`}>
                    Sample {index + 1}: {enrollment.has_mfcc ? '✅ MFCC Stored' : '❌ No MFCC'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Recording Instructions */}
      <div className="recording-instructions">
        <div className="instruction-card">
          <h4>🎙️ How to Record:</h4>
          <ul>
            <li>Speak naturally in your normal voice for 5-10 seconds</li>
            <li>Record in a quiet environment for best results</li>
            <li><strong>Recording WILL stop automatically at exactly {RECORDING_LIMIT} seconds</strong></li>
            <li>MFCC features will be automatically extracted and stored</li>
          </ul>
        </div>
      </div>
      
      {/* Recording Timer */}
      {(isRecording || recordedAudio) && (
        <div className={`recording-timer ${recordingTime >= RECORDING_LIMIT - 5 && isRecording ? 'warning' : ''} ${!isRecording ? 'completed' : ''}`}>
          <Clock size={16} />
          <span>
            {isRecording ? `Recording: ${formatTime(recordingTime)} / ${formatTime(RECORDING_LIMIT)}` 
                        : `Recorded: ${formatTime(recordingTime)}`}
          </span>
          {isRecording && recordingTime >= RECORDING_LIMIT - 5 && recordingTime < RECORDING_LIMIT && (
            <span className="time-warning">(Auto-stop in {RECORDING_LIMIT - recordingTime}s)</span>
          )}
          {!isRecording && (
            <span className="time-complete">✓ Recording Complete</span>
          )}
        </div>
      )}
      
      {/* Recording Controls */}
      <div className="recorder-controls">
        {!isRecording && !recordedAudio && (
          <button 
            onClick={startRecording}
            className={`record-btn ${canRecordMore ? 'start' : 'disabled'}`}
            title={canRecordMore ? "Start Recording" : "Maximum enrollments reached"}
            disabled={!canRecordMore}
          >
            <Mic size={20} />
            {canRecordMore 
              ? `Start Recording (${MAX_ENROLLMENTS - currentCount} remaining)`
              : 'Maximum Enrollments Reached'
            }
          </button>
        )}
        
        {isRecording && recordingTime < RECORDING_LIMIT && (
          <button 
            onClick={stopRecordingEarly}
            className="record-btn stop-early"
            title="Stop Recording Early"
          >
            Stop Early
          </button>
        )}
        
        {recordedAudio && (
          <div className="playback-controls">
            <div className="playback-buttons">
              <button 
                onClick={playRecording}
                className="control-btn play"
                title="Play Recording"
              >
                <Play size={16} />
                Play
              </button>
              <button 
                onClick={uploadRecording}
                disabled={isUploading || !canRecordMore}
                className="control-btn upload"
                title="Upload Recording"
              >
                <Upload size={16} />
                {isUploading ? 'Uploading...' : 'Save'}
              </button>
              <button 
                onClick={clearRecording}
                className="control-btn delete"
                title="Delete Recording"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
      
      {isRecording && (
        <div className="recording-indicator">
          <div className="pulse"></div>
          <span>Recording... {RECORDING_LIMIT - recordingTime}s remaining</span>
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;