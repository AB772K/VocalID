import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Voicemail, List, Mic, Square, Play, Send, Bell, RefreshCw } from 'lucide-react';
import { authAPI } from '../services/api';
import '../styles/UserDashboard.css';

const UserDashboard = () => {
  const [user, setUser] = useState(null);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [attendanceStatus, setAttendanceStatus] = useState({
    last_verification_time: null,
    next_prompt_seconds: 0,
    consecutive_misses: 0,
  });
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [attendanceLoadingPrompt, setAttendanceLoadingPrompt] = useState(false);
  const [attendanceChallenge, setAttendanceChallenge] = useState(null);
  const [attendanceScheduledTime, setAttendanceScheduledTime] = useState(null);
  const [attendanceRecording, setAttendanceRecording] = useState(false);
  const [attendanceRecordingTime, setAttendanceRecordingTime] = useState(0);
  const [attendanceRecordedAudio, setAttendanceRecordedAudio] = useState(null);
  const [attendanceVerifying, setAttendanceVerifying] = useState(false);
  const [attendanceResult, setAttendanceResult] = useState(null);
  const [attendanceRetryCount, setAttendanceRetryCount] = useState(0);

  const attendanceTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const audioChunksRef = useRef([]);
  const navigate = useNavigate();
  const attendanceLogsLimit = 10;

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/user/login');
      return;
    }
    const userObj = JSON.parse(userData);
    setUser(userObj);
    initializeAttendance(userObj.user_id);
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    fetchAttendanceLogs(user.user_id, logsPage);
  }, [user, logsPage]);

  useEffect(() => {
    return () => {
      clearAttendanceTimer();
      cleanupRecordingResources();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (attendanceRecordedAudio?.url) {
        URL.revokeObjectURL(attendanceRecordedAudio.url);
      }
    };
  }, [attendanceRecordedAudio]);

  const fetchAttendanceLogs = async (userId, page = 0) => {
    if (!userId) return;

    const offset = page * attendanceLogsLimit;
    setLogsLoading(true);
    try {
        const response = await fetch(
        `/api/user/${userId}/attendance-logs?limit=${attendanceLogsLimit}&offset=${offset}`
      );
      if (!response.ok) {
        throw new Error('Failed to load attendance logs');
      }

      const data = await response.json();
      setAttendanceLogs(data.logs || []);
      setLogsTotal(Number(data.total || 0));
    } catch (error) {
      console.error('Failed to load attendance logs:', error);
      setAttendanceLogs([]);
      setLogsTotal(0);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleRefreshLogs = () => {
    if (user && !logsLoading) {
      fetchAttendanceLogs(user.user_id, logsPage);
    }
  };

  const clearAttendanceTimer = () => {
    if (attendanceTimerRef.current) {
      clearTimeout(attendanceTimerRef.current);
      attendanceTimerRef.current = null;
    }
  };

  const scheduleAttendancePrompt = (seconds, userId) => {
    clearAttendanceTimer();
    const delayMs = Math.max(0, Number(seconds || 0)) * 1000;
    attendanceTimerRef.current = setTimeout(() => {
      triggerAttendancePrompt(userId);
    }, delayMs);
  };

  const fetchAttendanceStatus = async (userId) => {
    try {
      const status = await authAPI.getAttendanceStatus(userId);
      setAttendanceStatus(status);
      return status;
    } catch (error) {
      console.error('Failed to load attendance status:', error);
      return null;
    }
  };

  const initializeAttendance = async (userId) => {
    const status = await fetchAttendanceStatus(userId);
    if (!status) return;

    if ((status.next_prompt_seconds || 0) <= 0) {
      triggerAttendancePrompt(userId);
    } else {
      scheduleAttendancePrompt(status.next_prompt_seconds, userId);
    }
  };

  const playAttendanceBeep = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();

    // First oscillator – low frequency (piercing square wave)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.type = 'square';
    osc1.frequency.value = 880; // A5 – sharp tone
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);

    // Second oscillator – higher frequency (adds urgency)
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 1320; // E6 – higher pitch
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);

    const now = audioContext.currentTime;
    const duration = 0.6; // 600ms – long enough to be noticed

    // Fast, loud attack for both
    [gain1, gain2].forEach(gain => {
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.95, now + 0.02); // almost full volume
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    });

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
    osc1.onended = () => audioContext.close();
  } catch (error) {
    console.error('Could not play attendance alarm:', error);
  }
};

  const triggerAttendancePrompt = async (userId) => {
    clearAttendanceTimer();
    playAttendanceBeep();
    setAttendanceModalOpen(true);
    setAttendanceLoadingPrompt(true);
    setAttendanceRetryCount(0);
    setAttendanceResult(null);
    setAttendanceChallenge(null);

    try {
      const challenge = await authAPI.generateChallenge(userId);
      setAttendanceChallenge(challenge);
      setAttendanceScheduledTime(new Date().toISOString());
    } catch (error) {
      console.error('Failed to generate attendance challenge:', error);
      setAttendanceResult({
        success: false,
        message: 'Failed to generate attendance challenge. Retrying later.',
      });
      setAttendanceModalOpen(false);
      scheduleAttendancePrompt(300, userId);
    } finally {
      setAttendanceLoadingPrompt(false);
    }
  };

  const cleanupRecordingResources = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setAttendanceRecording(false);
  };

  const startAttendanceRecording = async () => {
    try {
      if (attendanceRecordedAudio?.url) {
        URL.revokeObjectURL(attendanceRecordedAudio.url);
      }

      setAttendanceRecordedAudio(null);
      setAttendanceResult(null);
      setAttendanceRecordingTime(0);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });

      streamRef.current = stream;

      const options = { mimeType: 'audio/webm;codecs=opus' };
      mediaRecorderRef.current = MediaRecorder.isTypeSupported(options.mimeType)
        ? new MediaRecorder(stream, options)
        : new MediaRecorder(stream);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAttendanceRecordedAudio({ blob: audioBlob, url: audioUrl, mimeType });
        cleanupRecordingResources();
      };

      mediaRecorderRef.current.start(100);
      setAttendanceRecording(true);
      recordingIntervalRef.current = setInterval(() => {
        setAttendanceRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start attendance recording:', error);
      cleanupRecordingResources();
    }
  };

  const stopAttendanceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      cleanupRecordingResources();
    }
  };

  const verifyAttendanceResponse = async () => {
    if (!attendanceRecordedAudio || !attendanceChallenge || !user) {
      return;
    }

    setAttendanceVerifying(true);
    try {
      const mimeType = attendanceRecordedAudio.mimeType || 'audio/webm';
      const extension = mimeType.includes('webm') ? 'webm' : 'wav';
      const audioFile = new File(
        [attendanceRecordedAudio.blob],
        `attendance_${user.user_id}.${extension}`,
        { type: mimeType }
      );

      const response = await authAPI.verifyAttendance(
        attendanceChallenge.challenge_id,
        audioFile,
        user.user_id,
        attendanceScheduledTime
      );

      setAttendanceResult(response);
      const nextIntervalSeconds = response?.next_interval_seconds || 2700;

      if (response.success) {
        await fetchAttendanceStatus(user.user_id);
        scheduleAttendancePrompt(nextIntervalSeconds, user.user_id);

        setTimeout(() => {
          setAttendanceModalOpen(false);
          setAttendanceChallenge(null);
          setAttendanceRetryCount(0);
          if (attendanceRecordedAudio?.url) {
            URL.revokeObjectURL(attendanceRecordedAudio.url);
          }
          setAttendanceRecordedAudio(null);
          setAttendanceRecording(false);
          setAttendanceRecordingTime(0);
        }, 1000);
        return;
      }

      const nextRetryCount = attendanceRetryCount + 1;
      setAttendanceRetryCount(nextRetryCount);

      if (nextRetryCount < 3) {
        if (attendanceRecordedAudio?.url) {
          URL.revokeObjectURL(attendanceRecordedAudio.url);
        }
        cleanupRecordingResources();
        audioChunksRef.current = [];
        setAttendanceRecordedAudio(null);
        setAttendanceRecording(false);
        setAttendanceRecordingTime(0);
        setAttendanceResult(null);
        setAttendanceLoadingPrompt(true);

        try {
          const newChallenge = await authAPI.generateChallenge(user.user_id);
          setAttendanceChallenge(newChallenge);
          setAttendanceScheduledTime(new Date().toISOString());
        } catch (retryError) {
          console.error('Failed to generate retry attendance challenge:', retryError);
          setAttendanceResult({
            success: false,
            message: 'Failed to generate a new challenge. Please try again shortly.',
          });
        } finally {
          setAttendanceLoadingPrompt(false);
        }
        return;
      }

      await fetchAttendanceStatus(user.user_id);
      scheduleAttendancePrompt(nextIntervalSeconds, user.user_id);

      setTimeout(() => {
        setAttendanceModalOpen(false);
        setAttendanceChallenge(null);
        setAttendanceRetryCount(0);
        if (attendanceRecordedAudio?.url) {
          URL.revokeObjectURL(attendanceRecordedAudio.url);
        }
        setAttendanceRecordedAudio(null);
        setAttendanceRecording(false);
        setAttendanceRecordingTime(0);
      }, 1000);
    } catch (error) {
      console.error('Attendance verification failed:', error);
      const nextIntervalSeconds =
        error?.response?.data?.next_interval_seconds || 2700;

      setAttendanceResult({
        success: false,
        message: error?.response?.data?.message || 'Attendance verification failed',
      });

      await fetchAttendanceStatus(user.user_id);
      scheduleAttendancePrompt(nextIntervalSeconds, user.user_id);
    } finally {
      setAttendanceVerifying(false);
    }
  };

  const handleLogout = () => {
    clearAttendanceTimer();
    cleanupRecordingResources();
    localStorage.removeItem('user');
    navigate('/voice-login');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div className="dashboard user-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <Voicemail className="logo-icon" />
          <h1>VocalID User Portal</h1>
        </div>
        <div className="header-right">
          <span>Welcome, {user.full_name}</span>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="cardd">
          <div className="card-header">
            <User className="card-icon" />
            <h2>User Information</h2>
          </div>
          <div className="user-card-content">
            <div className="user-info user-profile-list">
              <div>
                <strong>User ID:</strong> {user.user_id}
              </div>
              <div>
                <strong>Full Name:</strong> {user.full_name}
              </div>
              <div>
                <strong>Consecutive Attendance Misses:</strong> {attendanceStatus.consecutive_misses || 0}
              </div>
              <div>
                <strong>Last Attendance Verification:</strong> {formatDate(attendanceStatus.last_verification_time)}
              </div>
            </div>
          </div>
        </div>

        <div className="cardd">
          <div className="card-header">
            <List className="card-icon" />
            <h2>My Attendance Logs</h2>
            <button
              onClick={handleRefreshLogs}
              disabled={logsLoading}
              className="refresh-btn"
            >
              <RefreshCw size={16} className={logsLoading ? 'spinning' : ''} />
              Refresh
            </button>
          </div>

          <div className="tab-content">
            <div className="attendance-table-scroll">
              {logsLoading ? (
                <div className="loading-enrollments">Loading attendance logs...</div>
              ) : attendanceLogs.length === 0 ? (
                <p className="no-data">No attendance logs found.</p>
              ) : (
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Date/Time</th>
                      <th>Phrase Used</th>
                      <th>Spoken Text</th>
                      <th>Text Match Score</th>
                      <th>Text Passed</th>
                      <th>Biometric Score</th>
                      <th>Spoof Score</th>
                      <th>Spoof Detected</th>
                      <th>Final Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceLogs.map((log) => (
                      <tr key={log.log_id}>
                        <td>
                          {formatDate(log.verification_timestamp)}
                        </td>
                        <td>{log.phrase_used || 'N/A'}</td>
                        <td>{log.spoken_text || 'N/A'}</td>
                        <td>
                          {typeof log.text_match_score === 'number'
                            ? `${(log.text_match_score * 100).toFixed(1)}%`
                            : 'N/A'}
                        </td>
                        <td>
                          {log.text_verification_passed ? 'Yes' : 'No'}
                        </td>
                        <td>
                          {typeof log.biometric_score === 'number'
                            ? `${(log.biometric_score * 100).toFixed(1)}%`
                            : 'N/A'}
                        </td>
                        <td>
                          {typeof log.spoof_score === 'number'
                            ? `${(log.spoof_score * 100).toFixed(1)}%`
                            : 'N/A'}
                        </td>
                        <td>
                          {log.spoof_detected ? 'Yes' : 'No'}
                        </td>
                        <td className="decision-cell">
                          {log.final_decision || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pagination-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => setLogsPage(prev => Math.max(0, prev - 1))}
                disabled={logsPage === 0 || logsLoading}
              >
                Previous
              </button>

              <span className="pagination-info">
                Showing {logsTotal === 0 ? 0 : logsPage * attendanceLogsLimit + 1} - {Math.min((logsPage + 1) * attendanceLogsLimit, logsTotal)} of {logsTotal}
              </span>

              <button
                type="button"
                className="primary-button"
                onClick={() => setLogsPage(prev => prev + 1)}
                disabled={(logsPage + 1) * attendanceLogsLimit >= logsTotal || logsLoading}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {attendanceModalOpen && (
        <div className="attendance-modal-backdrop">
          <div className="attendance-modal-card">
            <div className="attendance-modal-header">
              <Bell size={20} />
              <h3>Attendance Voice Check</h3>
            </div>

            {attendanceLoadingPrompt ? (
              <p className="attendance-modal-intro">Preparing your attendance challenge...</p>
            ) : (
              <>
                <p className="attendance-modal-intro">
                  Please read this phrase now to confirm attendance:
                </p>
                <div className="attendance-phrase-box">
                  {attendanceChallenge?.phrase || 'No phrase available'}
                </div>

                <div className="attendance-modal-actions">
                  {!attendanceRecording ? (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={startAttendanceRecording}
                      disabled={attendanceVerifying}
                    >
                      <Mic size={16} />
                      Start Recording
                    </button>
                  ) : (
                    <button type="button" className="attendance-stop-btn" onClick={stopAttendanceRecording}>
                      <Square size={16} />
                      Stop ({attendanceRecordingTime}s)
                    </button>
                  )}

                  <button
                    type="button"
                    className="primary-button"
                    onClick={verifyAttendanceResponse}
                    disabled={!attendanceRecordedAudio || attendanceVerifying || attendanceRecording}
                  >
                    <Send size={16} />
                    {attendanceVerifying ? 'Verifying...' : 'Submit Verification'}
                  </button>

                  {attendanceRecordedAudio && (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        const audio = new Audio(attendanceRecordedAudio.url);
                        audio.play();
                      }}
                    >
                      <Play size={16} />
                      Play
                    </button>
                  )}
                </div>

                {attendanceResult && (
                  <div className={`attendance-result ${attendanceResult.success ? 'success' : 'error'}`}>
                    <div>{attendanceResult.message}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDashboard;