import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Square, Play, CheckCircle, XCircle, Clock, LogOut, Info, AlertTriangle, RefreshCw } from 'lucide-react';
import '../styles/VoiceChallenge.css';

const VoiceChallenge = () => {
  const [user, setUser] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [verificationDetails, setVerificationDetails] = useState(null);
  const [voiceBiometric, setVoiceBiometric] = useState(null);
  const [spoofInfo, setSpoofInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const streamRef = useRef(null);
  const navigate = useNavigate();
  const recordingIntervalRef = useRef(null);

  useEffect(() => {
    const userData = localStorage.getItem('auth_user');
    if (!userData) {
      navigate('/voice-login');
      return;
    }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    generateNewChallenge(parsedUser.user_id);
  }, [navigate]);

  useEffect(() => {
    if (!challenge || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleChallengeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [challenge, timeLeft]);

  const generateNewChallenge = async (userId) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/generate-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!response.ok) throw new Error('Failed to generate challenge');
      const data = await response.json();
      setChallenge(data);
      setTimeLeft(300);
      setVerificationStatus(null);
      setRecordedAudio(null);
      setVerificationDetails(null);
      setVoiceBiometric(null);
      setSpoofInfo(null);
      setRecordingTime(0);
    } catch (error) {
      console.error('Error generating challenge:', error);
      alert('Failed to generate authentication challenge');
    } finally {
      setLoading(false);
    }
  };

  const handleChallengeExpired = () => {
    setVerificationStatus('expired');
    setRecordedAudio(null);
    setTimeout(() => {
      if (user) generateNewChallenge(user.user_id);
    }, 2000);
  };

  const startRecording = async () => {
    try {
      setRecordedAudio(null);
      setRecordingTime(0);
      setVerificationStatus(null);
      setVerificationDetails(null);
      setVoiceBiometric(null);
      setSpoofInfo(null);
      audioChunks.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          sampleRate: 16000,
          channelCount: 1
        },
      });

      streamRef.current = stream;

      const options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('WebM with Opus not supported, using default');
        mediaRecorder.current = new MediaRecorder(stream);
      } else {
        mediaRecorder.current = new MediaRecorder(stream, options);
      }

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = () => {
        console.log('MediaRecorder stopped, creating audio blob...');
        try {
          const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
          const audioUrl = URL.createObjectURL(audioBlob);
          setRecordedAudio({ blob: audioBlob, url: audioUrl });
        } catch (error) {
          console.error('Error creating audio blob:', error);
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            track.stop();
          });
          streamRef.current = null;
        }

        setIsRecording(false);

        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
      };

      mediaRecorder.current.start(100);
      setIsRecording(true);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Cannot access microphone. Please check permissions and try again.');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      try {
        mediaRecorder.current.stop();
      } catch (e) {
        console.error('Error stopping MediaRecorder:', e);
        cleanupAfterRecording();
      }
    } else {
      cleanupAfterRecording();
    }
  };

  const cleanupAfterRecording = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }

    setIsRecording(false);

    if (audioChunks.current.length > 0 && !recordedAudio) {
      try {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudio({ blob: audioBlob, url: audioUrl });
      } catch (error) {
        console.error('Error creating audio from chunks:', error);
      }
    }
  };

  const playRecording = () => {
    if (recordedAudio && recordedAudio.url) {
      const audio = new Audio(recordedAudio.url);
      audio.play().catch(e => console.error('Error playing audio:', e));
    }
  };

  const verifyRecording = async () => {
    if (!recordedAudio || !challenge || !user) {
      alert('Please record audio first');
      return;
    }

    setLoading(true);
    setVerificationStatus('verifying');

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await recordedAudio.blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const wavBlob = await audioBufferToWav(audioBuffer);

      const audioFile = new File([wavBlob], `challenge_${user.user_id}.wav`, {
        type: 'audio/wav'
      });

      const formData = new FormData();
      formData.append('audio_file', audioFile);
      formData.append('challenge_id', challenge.challenge_id);
      formData.append('user_id', user.user_id.toString());

      const response = await fetch('/api/auth/verify-challenge-enhanced', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const result = await response.json();
      setVerificationDetails(result.text_verification);
      if (result.voice_biometric) setVoiceBiometric(result.voice_biometric);
      if (result.spoof_detected !== undefined) {
        setSpoofInfo({ detected: result.spoof_detected, score: result.spoof_score });
      }

      if (result.success) {
        setVerificationStatus('success');
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.removeItem('auth_user');
        setTimeout(() => navigate('/user/dashboard'), 2000);
      } else {
        setVerificationStatus('failed');
      }
    } catch (error) {
      console.error('Verification error:', error);
      setVerificationStatus('error');
      alert('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const audioBufferToWav = (buffer) => {
    return new Promise((resolve) => {
      const numChannels = 1;
      const sampleRate = buffer.sampleRate;
      const bufferLength = buffer.length;
      const bytesPerSample = 2;
      const blockAlign = numChannels * bytesPerSample;
      const dataLength = bufferLength * numChannels * bytesPerSample;

      const header = new ArrayBuffer(44);
      const view = new DataView(header);

      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + dataLength, true);
      writeString(view, 8, 'WAVE');
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * blockAlign, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, 16, true);
      writeString(view, 36, 'data');
      view.setUint32(40, dataLength, true);

      const wavBytes = new Uint8Array(44 + dataLength);
      wavBytes.set(new Uint8Array(header), 0);

      const channelData = buffer.getChannelData(0);
      const pcmData = new Int16Array(bufferLength);
      for (let i = 0; i < bufferLength; i++) {
        pcmData[i] = Math.max(-32768, Math.min(32767, channelData[i] * 32768));
      }
      wavBytes.set(new Uint8Array(pcmData.buffer), 44);
      resolve(new Blob([wavBytes], { type: 'audio/wav' }));
    });
  };

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const handleCancel = () => {
    if (isRecording) {
      stopRecording();
    }
    localStorage.removeItem('auth_user');
    navigate('/voice-login');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  if (!user) return <div className="voice-challenge loading">Loading user information...</div>;
  if (loading && !challenge) return <div className="voice-challenge loading">Preparing authentication challenge...</div>;
  if (!challenge) return <div className="voice-challenge error">Failed to load challenge. Please try again.</div>;

  return (
    <div className="voice-challenge">
      <div className="challenge-header">
        <div className="user-info">
          <h2>Voice Authentication</h2>
          <p>Welcome, <strong>{user.full_name}</strong></p>
          <p className="user-id">User ID: {user.user_id}</p>
        </div>
        <button onClick={handleCancel} className="cancel-btn">
          <LogOut size={16} /> Cancel
        </button>
      </div>

      <div className="challenge-card">
        <div className="challenge-phrase">
          <div className="phrase-label">Speak this phrase clearly:</div>
          <div className="phrase-text">
            {challenge.phrase}
            <button
              className="refresh-phrase-btn"
              onClick={() => generateNewChallenge(user.user_id)}
              disabled={isRecording || loading}
              title="Refresh phrase"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="time-remaining">
            <Clock size={16} />
            Challenge expires in: <strong>{formatTime(timeLeft)}</strong>
          </div>
        </div>

        {/* Recording Section (unchanged) */}
        <div className="recording-section">
          {!isRecording && !recordedAudio && timeLeft > 0 && (
            <div className="recording-controls">
              <button onClick={startRecording} className="record-btn start">
                <Mic size={20} /> Start Recording
              </button>
              <p className="recording-tip">Click to start speaking the phrase above</p>
            </div>
          )}

          {isRecording && (
            <div className="recording-active">
              <div className="recording-indicator">
                <div className="pulse"></div>
                <span>Recording in progress... Speak now!</span>
              </div>
              <div className="recording-time">
                <Clock size={16} />
                <span>Recording time: {formatTime(recordingTime)}</span>
              </div>
              <button onClick={stopRecording} className="record-btn stop">
                <Square size={20} /> Stop Recording
              </button>
              <p className="recording-tip">Click stop when you finish speaking the phrase</p>
            </div>
          )}

          {recordedAudio && !isRecording && timeLeft > 0 && (
            <div className="playback-section">
              <div className="playback-controls">
                <button onClick={playRecording} className="control-btn play">
                  <Play size={16} /> Play Recording
                </button>
                <button
                  onClick={verifyRecording}
                  disabled={loading}
                  className="control-btn verify"
                >
                  {loading ? (
                    <>
                      <div className="spinner"></div>
                      Verifying...
                    </>
                  ) : (
                    'Verify Identity'
                  )}
                </button>
                <button
                  onClick={() => {
                    setRecordedAudio(null);
                    setVerificationStatus(null);
                    setVerificationDetails(null);
                    setVoiceBiometric(null);
                    setSpoofInfo(null);
                    setRecordingTime(0);
                  }}
                  className="control-btn retry"
                >
                  Record Again
                </button>
              </div>
              <p className="recording-tip">Listen to your recording, then verify or record again</p>
            </div>
          )}

          {timeLeft === 0 && (
            <div className="expired-section">
              <p>Challenge expired. Please generate a new one.</p>
              <button
                onClick={() => generateNewChallenge(user.user_id)}
                className="control-btn retry"
              >
                Generate New Challenge
              </button>
            </div>
          )}
        </div>

        {/* Verification Status */}
        {verificationStatus && (
          <div className={`verification-status ${verificationStatus}`}>
            {verificationStatus === 'success' && (
              <><CheckCircle size={20} /><span>Authentication successful! Redirecting to dashboard...</span></>
            )}
            {verificationStatus === 'failed' && (
              <><XCircle size={20} /><span>Verification failed. Please try again.</span></>
            )}
            {verificationStatus === 'error' && (
              <><XCircle size={20} /><span>Authentication error. Please try again.</span></>
            )}
            {verificationStatus === 'verifying' && (
              <><div className="spinner"></div><span>Verifying your voice...</span></>
            )}
            {verificationStatus === 'expired' && (
              <><XCircle size={20} /><span>Challenge expired. Generating new challenge...</span></>
            )}
          </div>
        )}

        {/* Spoof Warning */}
        {spoofInfo && spoofInfo.detected && verificationStatus === 'failed' && (
          <div className="spoof-warning">
            <div className="spoof-header">
              <AlertTriangle size={20} />
              <strong>Spoofing Detected</strong>
            </div>
            <p className="spoof-text">
              Audio appears synthetic or replayed. Please speak naturally and try again.
            </p>
          </div>
        )}

        {/* Verification Details */}
        {(verificationDetails || voiceBiometric) && (
          <div className="verification-details">
            <div className="details-header">
              <Info size={16} />
              <span>Verification Details</span>
            </div>
            <div className="details-content">
              {verificationDetails && (
                <>
                  <div className="detail-item">
                    <span className="label">Original Phrase:</span>
                    <span className="value">{verificationDetails.original_phrase}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Spoken Text:</span>
                    <span className="value">{verificationDetails.spoken_text || 'No speech detected'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Text Similarity:</span>
                    <span className="value">
                      {verificationDetails.similarity_score
                        ? `${(verificationDetails.similarity_score * 100).toFixed(1)}%`
                        : 'N/A'}
                    </span>
                  </div>
                </>
              )}

              {voiceBiometric && (
                <>
                  <div className="detail-item">
                    <span className="label">Voice Match:</span>
                    <span className="value">
                      {(voiceBiometric.biometric_score * 100).toFixed(1)}%
                    </span>
                  </div>
                </>
              )}

              {spoofInfo && spoofInfo.detected && (
                <div className="detail-item">
                  <span className="label">Spoof Score:</span>
                  <span className="value spoof-value detected">
                    {(spoofInfo.score * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default VoiceChallenge;