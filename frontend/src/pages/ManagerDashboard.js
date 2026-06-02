import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut, UserPlus, Users, Voicemail, CheckCircle, XCircle, Trash2,
  AlertCircle, Edit, Save, X, Mic, Play, Upload, Clock, Mail, Shield,
  Search, Filter, Download, ClipboardList, RefreshCw
} from 'lucide-react';
import { authAPI } from '../services/api';
import '../styles/ManagerDashboard.css';

const ManagerDashboard = () => {
  const [manager, setManager] = useState(null);
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ full_name: '', email: '' });
  const [editingUser, setEditingUser] = useState(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [inputError, setInputError] = useState('');
  const [activeTab, setActiveTab] = useState('users');
  const [voiceEnrollment, setVoiceEnrollment] = useState({
    isRecording: false,
    recordedAudios: [],
    currentRecording: null,
    isUploading: false
  });

  // New states for dynamic challenge-response
  const [currentPhrase, setCurrentPhrase] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sampleStatus, setSampleStatus] = useState(null); // 'success' or 'failure'

  // Verification logs state
  const [verificationLogs, setVerificationLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('all');

  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceUserFilter, setAttendanceUserFilter] = useState('all');
  const [attendanceStartDate, setAttendanceStartDate] = useState('');
  const [attendanceEndDate, setAttendanceEndDate] = useState('');
  const [attendanceDecisionFilter, setAttendanceDecisionFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    const managerData = localStorage.getItem('manager');
    if (!managerData) {
      navigate('/manager/login');
      return;
    }
    setManager(JSON.parse(managerData));
    fetchUsers();
  }, [navigate]);

  // Fetch verification logs when tab is active
  useEffect(() => {
    if (activeTab === 'verification') {
      fetchVerificationLogs();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'attendance') {
      fetchAttendanceLogs();
    }
  }, [activeTab]);

  // When create tab becomes active, fetch first random phrase
  useEffect(() => {
    if (activeTab === 'create') {
      fetchRandomPhrase();
    }
  }, [activeTab]);

  const fetchRandomPhrase = async () => {
    try {
      const response = await fetch('/api/auth/random-phrase');
      const data = await response.json();
      setCurrentPhrase(data.phrase);
    } catch (error) {
      console.error('Failed to fetch random phrase:', error);
      setMessage({ type: 'error', text: 'Failed to generate phrase. Please refresh.' });
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await authAPI.getAllUsers();
      setUsers(response.users);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setMessage({ type: 'error', text: 'Failed to load users' });
    }
  };

  const fetchVerificationLogs = async () => {
    setLogsLoading(true);
    try {
      console.log('🔄 Fetching verification logs...');
      const response = await authAPI.getVerificationAttempts();
      console.log('📊 Full API Response:', response);

      // Extract attempts from various possible response structures
      let attempts = [];
      if (response && response.attempts) {
        attempts = response.attempts;
      } else if (response && response.data && response.data.attempts) {
        attempts = response.data.attempts;
      } else if (Array.isArray(response)) {
        attempts = response;
      } else {
        console.warn('⚠️ Unexpected API response structure:', response);
      }

      setVerificationLogs(attempts);
    } catch (err) {
      console.error('❌ Failed to fetch verification logs:', err);
      setMessage({ type: 'error', text: 'Failed to load verification logs' });
      setVerificationLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchAttendanceLogs = async (overrideParams = null) => {
    setAttendanceLoading(true);
    try {
      const params = overrideParams || {
        user_id: attendanceUserFilter !== 'all' ? attendanceUserFilter : undefined,
        start_date: attendanceStartDate || undefined,
        end_date: attendanceEndDate || undefined,
        decision: attendanceDecisionFilter !== 'all' ? attendanceDecisionFilter : undefined,
      };

      const response = await authAPI.getAttendanceLogs(params);
      setAttendanceLogs(response.logs || []);
    } catch (err) {
      console.error('❌ Failed to fetch attendance logs:', err);
      setMessage({ type: 'error', text: 'Failed to load attendance logs' });
      setAttendanceLogs([]);
    } finally {
      setAttendanceLoading(false);
    }
  };

  // Filter verification logs based on search and filters
  const filteredLogs = verificationLogs.filter(log => {
    const matchesSearch = searchTerm === '' ||
      log.user_id?.toString().includes(searchTerm) ||
      log.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.phrase_used?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDate = dateFilter === '' ||
      new Date(log.attempt_timestamp).toISOString().split('T')[0] === dateFilter;

    const matchesDecision = decisionFilter === 'all' ||
      log.final_decision === decisionFilter;

    return matchesSearch && matchesDate && matchesDecision;
  });

  const filteredAttendanceLogs = attendanceLogs.filter(log => {
    const matchesUser = attendanceUserFilter === 'all' || String(log.user_id) === String(attendanceUserFilter);
    const matchesDecision = attendanceDecisionFilter === 'all' || log.final_decision === attendanceDecisionFilter;

    const logDate = log.verification_timestamp
      ? new Date(log.verification_timestamp).toISOString().split('T')[0]
      : '';
    const matchesStartDate = !attendanceStartDate || (logDate && logDate >= attendanceStartDate);
    const matchesEndDate = !attendanceEndDate || (logDate && logDate <= attendanceEndDate);

    return matchesUser && matchesDecision && matchesStartDate && matchesEndDate;
  });

  const validateFullName = (name) => {
    if (!name.trim()) return 'Full name is required';
    if (name.trim().length < 2) return 'Full name must be at least 2 characters';
    if (name.trim().length > 100) return 'Full name must be less than 100 characters';
    if (!/^[a-zA-Z\s\-'.]+$/.test(name)) return 'Only letters, spaces, hyphens, and apostrophes are allowed';
    return '';
  };

  const validateEmail = (email) => {
    if (!email.trim()) return 'Email is required';
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) return 'Invalid email format';
    return '';
  };

  // Voice Recording Functions – modified for challenge-response
  const startRecording = async () => {
    if (!currentPhrase) {
      await fetchRandomPhrase();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1
        }
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      const audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
        const audioUrl = URL.createObjectURL(audioBlob);

        // Don't add to recordedAudios yet – we need to verify first
        setVoiceEnrollment(prev => ({
          ...prev,
          isRecording: false,
          currentRecording: null
        }));

        // Stop microphone
        stream.getTracks().forEach(track => track.stop());

        // Verify the recorded phrase
        await verifyPhrase(audioBlob, audioUrl);
      };

      mediaRecorder.start();
      setVoiceEnrollment(prev => ({
        ...prev,
        isRecording: true,
        currentRecording: { mediaRecorder, stream }
      }));

      // Auto-stop after 10 seconds
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 10000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Cannot access microphone. Please check permissions and try again.');
    }
  };

  const verifyPhrase = async (audioBlob, audioUrl) => {
    setVerifying(true);
    const formData = new FormData();
    formData.append('audio_file', audioBlob, 'recording.webm');
    formData.append('phrase', currentPhrase);

    try {
      const response = await fetch('/api/auth/verify-phrase', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (result.spoof_detected) {
        // Synthetic voice detected
        setSampleStatus('failure');
        setMessage({ type: 'error', text: 'Please try again(Synthetic like voice).' });
        URL.revokeObjectURL(audioUrl);
      } else if (result.success) {
        // Accepted sample
        setSampleStatus('success');
        setMessage({ type: 'success', text: `Sample accepted! (Score: ${(result.score * 100).toFixed(1)}%)` });
        // Add to recordedAudios
        setVoiceEnrollment(prev => ({
          ...prev,
          recordedAudios: [...prev.recordedAudios, { blob: audioBlob, url: audioUrl }]
        }));
      } else {
        // Text mismatch
        setSampleStatus('failure');
        setMessage({ type: 'error', text: `Phrase not matched. Spoken: "${result.spoken_text || 'unclear'}"` });
        URL.revokeObjectURL(audioUrl);
      }
      // Fetch new phrase for next attempt (success or failure)
      await fetchRandomPhrase();
    } catch (error) {
      console.error('Verification error:', error);
      setMessage({ type: 'error', text: 'Verification failed. Please try again.' });
      URL.revokeObjectURL(audioUrl);
    } finally {
      setVerifying(false);
    }
  };

  const stopRecording = () => {
    if (voiceEnrollment.currentRecording?.mediaRecorder?.state === 'recording') {
      voiceEnrollment.currentRecording.mediaRecorder.stop();
    }
  };

  const playRecording = (index) => {
    const audio = new Audio(voiceEnrollment.recordedAudios[index].url);
    audio.play();
  };

  const removeRecording = (index) => {
    // Revoke object URL to avoid memory leaks
    URL.revokeObjectURL(voiceEnrollment.recordedAudios[index].url);
    setVoiceEnrollment(prev => ({
      ...prev,
      recordedAudios: prev.recordedAudios.filter((_, i) => i !== index)
    }));
  };

  const resetVoiceEnrollment = () => {
    // Clean up any existing URLs
    voiceEnrollment.recordedAudios.forEach(audio => URL.revokeObjectURL(audio.url));
    setVoiceEnrollment({
      isRecording: false,
      recordedAudios: [],
      currentRecording: null,
      isUploading: false
    });
    setCurrentPhrase('');
    setSampleStatus(null);
  };

  // WAV Conversion Functions (unchanged)
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

  const convertWebMToWav = async (webmBlob) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await webmBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const wavBlob = await audioBufferToWav(audioBuffer);
      return wavBlob;
    } catch (error) {
      console.error('WebM to WAV conversion failed:', error);
      throw new Error('Failed to convert audio to WAV format');
    }
  };

  const handleCreateUserWithVoice = async (e) => {
    e.preventDefault();

    const nameError = validateFullName(newUser.full_name);
    const emailError = validateEmail(newUser.email);

    if (nameError || emailError) {
      setInputError(nameError || emailError);
      return;
    }

    if (voiceEnrollment.recordedAudios.length < 5) {
      setMessage({ type: 'error', text: 'Please record all 5 voice samples before creating the user.' });
      return;
    }

    setLoading(true);
    setVoiceEnrollment(prev => ({ ...prev, isUploading: true }));

    try {
      const formData = new FormData();
      formData.append('full_name', newUser.full_name);
      formData.append('email', newUser.email);
      formData.append('created_by', manager.manager_id);

      console.log('🔄 Converting WebM recordings to WAV format...');

      // Convert all WebM recordings to WAV format
      for (let i = 0; i < voiceEnrollment.recordedAudios.length; i++) {
        const audio = voiceEnrollment.recordedAudios[i];
        console.log(`Converting sample ${i + 1} from WebM to WAV...`);

        try {
          const wavBlob = await convertWebMToWav(audio.blob);
          const audioFile = new File([wavBlob], `voice_sample_${i + 1}.wav`, {
            type: 'audio/wav'
          });

          console.log(`✅ Sample ${i + 1} converted:`, {
            originalSize: audio.blob.size,
            convertedSize: audioFile.size,
            type: audioFile.type
          });

          formData.append('audio_files', audioFile);

        } catch (conversionError) {
          console.error(`❌ Failed to convert sample ${i + 1}:`, conversionError);
          throw new Error(`Failed to convert voice sample ${i + 1} to WAV format. Please try recording again.`);
        }
      }

      console.log('📤 Sending converted WAV files to backend...');

      const response = await fetch('/api/manager/create-user-with-voice', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();

        // Refresh user list
        await fetchUsers();

        // Reset form and show success
        setNewUser({ full_name: '', email: '' });
        resetVoiceEnrollment();
        setActiveTab('users');

        setMessage({
          type: 'success',
          text: `User ${result.full_name} created successfully! User ID: ${result.user_id}. Email sent to ${result.email}.`
        });

        console.log('🎯 User creation successful:', result);

      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'User creation failed');
      }
    } catch (err) {
      console.error('❌ User creation error:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setVoiceEnrollment(prev => ({ ...prev, isUploading: false }));
    }
  };

  const handleRegisterUser = async (e) => {
    e.preventDefault();

    const error = validateFullName(newUser.full_name);
    if (error) {
      setInputError(error);
      return;
    }

    setLoading(true);

    try {
      const response = await authAPI.registerUser({
        full_name: newUser.full_name,
        email: newUser.email || `${newUser.full_name.replace(/\s+/g, '.').toLowerCase()}@example.com`,
        created_by: manager.manager_id
      });

      await fetchUsers();
      setNewUser({ full_name: '', email: '' });
      setMessage({ type: 'success', text: `User ${response.full_name} registered with ID: ${response.user_id}` });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Registration failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to delete user "${userName}"?`)) {
      return;
    }

    try {
      await authAPI.deleteUser(userId);
      await fetchUsers();
      setMessage({ type: 'success', text: `User ${userName} deleted successfully` });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Delete failed' });
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user.user_id);
    setEditName(user.full_name);
    setMessage({ type: '', text: '' });
  };

  const handleSaveEdit = async (userId) => {
    const error = validateFullName(editName);
    if (error) {
      setMessage({ type: 'error', text: error });
      return;
    }

    try {
      await authAPI.updateUser(userId, { full_name: editName });
      await fetchUsers();
      setEditingUser(null);
      setEditName('');
      setMessage({ type: 'success', text: `User updated successfully` });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Update failed' });
    }
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setEditName('');
  };

  const handleLogout = () => {
    localStorage.removeItem('manager');
    navigate('/manager/login');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const getDecisionBadge = (decision) => {
    if (decision === 'accepted') {
      return <span className="badge success">Accepted</span>;
    } else if (decision === 'rejected') {
      return <span className="badge error">Rejected</span>;
    } else if (decision === 'missed') {
      return <span className="badge warning">Missed</span>;
    }
    return <span className="badge warning">Pending</span>;
  };

  const getScoreColor = (score) => {
    if (score >= 0.8) return 'score-high';
    if (score >= 0.6) return 'score-medium';
    return 'score-low';
  };

  // Helper for spoof score coloring (higher = worse)
  const getSpoofScoreColor = (score) => {
    if (score >= 0.7) return 'score-high spoof';
    if (score >= 0.4) return 'score-medium spoof';
    return 'score-low spoof';
  };

  const exportLogsToCSV = () => {
    const headers = [
      'Attempt ID', 'User ID', 'User Name', 'Challenge ID', 'Phrase Used',
      'Spoken Text', 'Text Match Score', 'Text Verification', 'Biometric Score',
      'Spoof Score', 'Spoof Detected', 'Final Decision', 'Timestamp'
    ];

    const csvContent = [
      headers.join(','),
      ...filteredLogs.map(log => [
        log.attempt_id,
        log.user_id,
        log.full_name || 'N/A',
        log.challenge_id,
        `"${log.phrase_used?.replace(/"/g, '""') || ''}"`,
        `"${log.spoken_text?.replace(/"/g, '""') || ''}"`,
        log.text_match_score || 'N/A',
        log.text_verification_passed ? 'Passed' : 'Failed',
        log.biometric_score || 'N/A',
        log.spoof_score || 'N/A',
        log.spoof_detected ? 'Yes' : 'No',
        log.final_decision || 'N/A',
        log.attempt_timestamp
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verification-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const exportAttendanceLogsToCSV = () => {
    const headers = [
      'Log ID',
      'User ID',
      'User Name',
      'Timestamp',
      'Phrase Used',
      'Spoken Text',
      'Text Match Score',
      'Spoof Score',
      'Decision',
      'Response Delay Seconds',
    ];

    const csvContent = [
      headers.join(','),
      ...filteredAttendanceLogs.map(log => [
        log.log_id,
        log.user_id,
        log.full_name || 'N/A',
        log.verification_timestamp || '',
        `"${(log.phrase_used || '').replace(/"/g, '""')}"`,
        `"${(log.spoken_text || '').replace(/"/g, '""')}"`,
        log.text_match_score ?? 'N/A',
        log.spoof_score ?? 'N/A',
        log.final_decision || 'N/A',
        log.response_delay_seconds ?? 'N/A',
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (!manager) return <div className="loading">Loading...</div>;

  return (
    <div className="dashboard manager-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <Voicemail className="logo-icon" />
          <h1>VocalID Manager Portal</h1>
        </div>
        <div className="header-right">
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} />
          Manage Users ({users.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          <UserPlus size={16} />
          Create User with Voice
        </button>
        <button
          className={`tab-btn ${activeTab === 'verification' ? 'active' : ''}`}
          onClick={() => setActiveTab('verification')}
        >
          <Shield size={16} />
          Verification Logs ({verificationLogs.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
          onClick={() => setActiveTab('attendance')}
        >
          <ClipboardList size={16} />
          Attendance Logs ({attendanceLogs.length})
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'users' && (
          <div className="cardd">
            <div className="card-header">
              <Users className="card-icon" />
              <h2>Registered Users ({users.length})</h2>
            </div>
            <div className="users-list">
              {users.length === 0 ? (
                <p className="no-data">No users registered yet</p>
              ) : (
                users.map(user => (
                  <div key={user.user_id} className="user-item">
                    <div className="user-info">
                      {editingUser === user.user_id ? (
                        <div className="edit-form">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="edit-input"
                            autoFocus
                          />
                          <div className="edit-actions">
                            <button
                              onClick={() => handleSaveEdit(user.user_id)}
                              className="save-btn"
                              title="Save"
                            >
                              <Save size={14} />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="cancel-btn"
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="user-main-info">
                            <span className="user-name">{user.full_name}</span>
                            <span className="user-email">
                              <Mail size={14} />
                              {user.email}
                            </span>
                          </div>
                          <div className="user-details">
                            <span className="user-id">ID: {user.user_id} </span>
                            <span className="user-date">
                              Created: {formatDate(user.created_at)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    {editingUser !== user.user_id && (
                      <div className="user-actions">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="edit-btn"
                          title="Edit User"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.user_id, user.full_name)}
                          className="delete-btn"
                          title="Delete User"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'create' && (
          <div className="cardd">
            <div className="card-header">
              <UserPlus className="card-icon" />
              <h2>Create User with Voice Enrollment</h2>
            </div>

            {message.text && (
              <div className={`message ${message.type}`}>
                {message.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {message.text}
              </div>
            )}

            <form onSubmit={handleCreateUserWithVoice} className="form">
              <div className="form-grid">
                <div className="input-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    placeholder="Enter full name"
                    value={newUser.full_name}
                    onChange={(e) => {
                      setNewUser({ ...newUser, full_name: e.target.value });
                      setInputError('');
                    }}
                    required
                  />
                </div>

                <div className="input-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    placeholder="Enter email address"
                    value={newUser.email}
                    onChange={(e) => {
                      setNewUser({ ...newUser, email: e.target.value });
                      setInputError('');
                    }}
                    required
                  />
                </div>
              </div>

              {inputError && (
                <div className="input-error">
                  <AlertCircle size={14} />
                  {inputError}
                </div>
              )}

              {/* Voice Enrollment Section with Dynamic Challenge */}
              <div className="voice-enrollment-section">
                <h3>Voice Enrollment Samples ({voiceEnrollment.recordedAudios.length}/5)</h3>
                <p className="enrollment-instruction">
                  Speak the phrase shown below clearly. The system will verify you said the correct phrase.
                </p>

                {currentPhrase && (
                  <div className="current-phrase-box">
                    <strong>Phrase to speak:</strong>
                    <div className="phrase-text">{currentPhrase}</div>
                  </div>
                )}

                <div className="recording-controls">
                  {!voiceEnrollment.isRecording ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      disabled={voiceEnrollment.recordedAudios.length >= 5 || verifying}
                      className={`record-btn ${voiceEnrollment.recordedAudios.length >= 5 ? 'disabled' : 'start'}`}
                    >
                      <Mic size={18} />
                      {voiceEnrollment.recordedAudios.length >= 5 ? 'All Samples Recorded' : (verifying ? 'Verifying...' : 'Start Recording')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="record-btn stop"
                    >
                      <Clock size={18} />
                      Stop Recording
                    </button>
                  )}

                  {/* Refresh button: fetches new phrase and resets recordings */}
                  <button
                    type="button"
                    className="refresh-btn"
                    onClick={() => {
                      setSampleStatus(null);
                      setMessage({ type: '', text: '' });
                      fetchRandomPhrase();
                    }}
                    disabled={voiceEnrollment.isRecording || verifying}
                    title="Refresh phrase and reset recordings"
                  >
                    <RefreshCw size={16} />
                    Refresh
                  </button>
                </div>

                {/* Feedback for current sample attempt */}
                {sampleStatus && (
                  <div className={`sample-feedback ${sampleStatus}`}>
                    {sampleStatus === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    {sampleStatus === 'success' ? 'Sample accepted!' : 'Sample rejected. Try again.'}
                  </div>
                )}

                {/* Recorded Samples List */}
                {voiceEnrollment.recordedAudios.length > 0 && (
                  <div className="recorded-samples">
                    <h4>Accepted Samples:</h4>
                    {voiceEnrollment.recordedAudios.map((audio, index) => (
                      <div key={index} className="sample-item">
                        <span>Sample {index + 1}</span>
                        <div className="sample-actions">
                          <button
                            type="button"
                            onClick={() => playRecording(index)}
                            className="play-btn"
                          >
                            <Play size={14} />
                            Play
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRecording(index)}
                            className="remove-btn"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Progress Indicator */}
                <div className="enrollment-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${(voiceEnrollment.recordedAudios.length / 5) * 100}%` }}
                    ></div>
                  </div>
                  <span>{voiceEnrollment.recordedAudios.length} of 5 samples accepted</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || voiceEnrollment.isUploading || voiceEnrollment.recordedAudios.length < 5}
                className="primary-button large"
              >
                {voiceEnrollment.isUploading ? 'Converting & Creating User...' :
                 loading ? 'Processing...' :
                 `Create User & Enroll Voice`}
                <UserPlus size={18} />
              </button>
            </form>
          </div>
        )}

        {activeTab === 'verification' && (
          <div className="card">
            <div className="card-header">
              <Shield className="card-icon" />
              <h2>Verification Attempts Logs ({filteredLogs.length})</h2>
            </div>

            {/* Filters */}
            <div className="filters-section">
              <div className="filter-group">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search by User ID, Name, or Phrase..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>

              <div className="filter-group">
                <Filter size={16} />
                <select
                  value={decisionFilter}
                  onChange={(e) => setDecisionFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Decisions</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div className="filter-group">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="date-input"
                />
              </div>

              <button
                onClick={() => {
                  setSearchTerm('');
                  setDateFilter('');
                  setDecisionFilter('all');
                }}
                className="clear-filters-btn"
              >
                Clear Filters
              </button>

              <button onClick={exportLogsToCSV} className="export-btn">
                <Download size={16} />
                Export CSV
              </button>
            </div>

            {/* Verification Logs Table */}
            <div className="logs-table-container">
              {logsLoading ? (
                <div className="loading">Loading verification logs...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="no-data">
                  {verificationLogs.length === 0 ? 'No verification attempts found' : 'No logs match your filters'}
                </div>
              ) : (
                <div className="logs-table">
                  <div className="logs-header">
                    <div className="log-cell">User</div>
                    <div className="log-cell">Phrase</div>
                    <div className="log-cell">Text Match</div>
                    <div className="log-cell">Voice Match</div>
                    <div className="log-cell">Spoof Score</div>
                    <div className="log-cell">Spoof Detected</div>
                    <div className="log-cell">Decision</div>
                    <div className="log-cell">Timestamp</div>
                  </div>
                  <div className="logs-body">
                    {filteredLogs.map(log => (
                      <div key={log.attempt_id} className="log-row">
                        <div className="log-cell">
                          <div className="user-info-small">
                            <strong>ID: {log.user_id}</strong>
                            {log.full_name && <span>{log.full_name}</span>}
                          </div>
                        </div>
                        <div className="log-cell phrase-cell">
                          <div className="phrase-used" title={log.phrase_used}>
                            {log.phrase_used || 'N/A'}
                          </div>
                          {log.spoken_text && (
                            <div className="spoken-text" title={log.spoken_text}>
                              Spoken: "{log.spoken_text}"
                            </div>
                          )}
                        </div>
                        <div className="log-cell">
                          {log.text_match_score != null ? (
                            <div className={`score ${getScoreColor(log.text_match_score)}`}>
                              {(log.text_match_score * 100).toFixed(1)}%
                            </div>
                          ) : 'N/A'}
                          <div className="verification-status">
                            {log.text_verification_passed ? (
                              <CheckCircle size={12} className="success" />
                            ) : log.text_verification_passed === false ? (
                              <XCircle size={12} className="error" />
                            ) : null}
                          </div>
                        </div>
                        <div className="log-cell">
                          {log.biometric_score != null ? (
                            <div className={`score ${getScoreColor(log.biometric_score)}`}>
                              {(log.biometric_score * 100).toFixed(1)}%
                            </div>
                          ) : 'N/A'}
                        </div>
                        <div className="log-cell">
                          {log.spoof_score != null ? (
                            <div className={`score ${getSpoofScoreColor(log.spoof_score)}`}>
                              {(log.spoof_score * 100).toFixed(1)}%
                            </div>
                          ) : 'N/A'}
                        </div>
                        <div className="log-cell">
                          {log.spoof_detected ? (
                            <span className="badge error">Yes</span>
                          ) : (
                            <span className="badge success">No</span>
                          )}
                        </div>
                        <div className="log-cell">
                          {getDecisionBadge(log.final_decision)}
                        </div>
                        <div className="log-cell timestamp">
                          {formatDateTime(log.attempt_timestamp)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="card">
            <div className="card-header">
              <ClipboardList className="card-icon" />
              <h2>Attendance Logs ({filteredAttendanceLogs.length})</h2>
            </div>

            <div className="filters-section">
              <div className="filter-group">
                <Users size={16} />
                <select
                  value={attendanceUserFilter}
                  onChange={(e) => setAttendanceUserFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Users</option>
                  {users.map(user => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.full_name} (ID: {user.user_id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <Filter size={16} />
                <select
                  value={attendanceDecisionFilter}
                  onChange={(e) => setAttendanceDecisionFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Decisions</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                  <option value="missed">Missed</option>
                </select>
              </div>

              <div className="filter-group">
                <input
                  type="date"
                  value={attendanceStartDate}
                  onChange={(e) => setAttendanceStartDate(e.target.value)}
                  className="date-input"
                />
              </div>

              <div className="filter-group">
                <input
                  type="date"
                  value={attendanceEndDate}
                  onChange={(e) => setAttendanceEndDate(e.target.value)}
                  className="date-input"
                />
              </div>

              <button
                onClick={() => {
                  fetchAttendanceLogs({
                    user_id: attendanceUserFilter !== 'all' ? attendanceUserFilter : undefined,
                    start_date: attendanceStartDate || undefined,
                    end_date: attendanceEndDate || undefined,
                    decision: attendanceDecisionFilter !== 'all' ? attendanceDecisionFilter : undefined,
                  });
                }}
                className="clear-filters-btn"
              >
                Apply Filters
              </button>

              <button
                onClick={() => {
                  setAttendanceUserFilter('all');
                  setAttendanceStartDate('');
                  setAttendanceEndDate('');
                  setAttendanceDecisionFilter('all');
                  fetchAttendanceLogs({});
                }}
                className="clear-filters-btn"
              >
                Clear Filters
              </button>

              <button onClick={exportAttendanceLogsToCSV} className="export-btn">
                <Download size={16} />
                Export CSV
              </button>
            </div>

            <div className="logs-table-container">
              {attendanceLoading ? (
                <div className="loading">Loading attendance logs...</div>
              ) : filteredAttendanceLogs.length === 0 ? (
                <div className="no-data">No attendance logs found for current filters</div>
              ) : (
                <div className="logs-table">
                  <div className="logs-header">
                    <div className="log-cell">User</div>
                    <div className="log-cell">Timestamp</div>
                    <div className="log-cell">Phrase</div>
                    <div className="log-cell">Text Match</div>
                    <div className="log-cell">Spoof Score</div>
                    <div className="log-cell">Decision</div>
                    <div className="log-cell">Response</div>
                  </div>
                  <div className="logs-body">
                    {filteredAttendanceLogs.map(log => (
                      <div key={log.log_id} className="log-row">
                        <div className="log-cell">
                          <div className="user-info-small">
                            <strong>ID: {log.user_id}</strong>
                            {log.full_name && <span>{log.full_name}</span>}
                          </div>
                        </div>
                        <div className="log-cell timestamp">
                          {formatDateTime(log.verification_timestamp)}
                        </div>
                        <div className="log-cell phrase-cell">
                          <div className="phrase-used" title={log.phrase_used}>
                            {log.phrase_used || 'N/A'}
                          </div>
                        </div>
                        <div className="log-cell">
                          {log.text_match_score != null ? (
                            <div className={`score ${getScoreColor(log.text_match_score)}`}>
                              {(log.text_match_score * 100).toFixed(1)}%
                            </div>
                          ) : 'N/A'}
                        </div>
                        <div className="log-cell">
                          {log.spoof_score != null ? (
                            <div className={`score ${getSpoofScoreColor(log.spoof_score)}`}>
                              {(log.spoof_score * 100).toFixed(1)}%
                            </div>
                          ) : 'N/A'}
                        </div>
                        <div className="log-cell">
                          {getDecisionBadge(log.final_decision)}
                        </div>
                        <div className="log-cell">
                          {log.response_delay_seconds != null
                            ? `${Number(log.response_delay_seconds).toFixed(1)}s`
                            : 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagerDashboard;