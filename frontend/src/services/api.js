import axios from 'axios';

const API_BASE_URL = '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const authAPI = {
  managerLogin: async (credentials) => {
    const response = await api.post('/api/manager/login', credentials);
    return response.data;
  },

  registerUser: async (userData) => {
    const response = await api.post('/api/manager/register-user', userData);
    return response.data;
  },

  createUserWithVoice: async (formData) => {
    const response = await api.post('/api/manager/create-user-with-voice', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  userLogin: async (credentials) => {
    const response = await api.post('/api/user/login', credentials);
    return response.data;
  },

  getAllUsers: async () => {
    const response = await api.get('/api/manager/users');
    return response.data;
  },

  deleteUser: async (userId) => {
    const response = await api.delete(`/api/manager/users/${userId}`);
    return response.data;
  },

  updateUser: async (userId, userData) => {
    const response = await api.put(`/api/manager/users/${userId}`, userData);
    return response.data;
  },
  
  getUserEnrollments: async (userId) => {
    const response = await api.get(`/api/user/${userId}/enrollments`);
    return response.data;
  },

  generateChallenge: async (userId) => {
    const response = await api.post('/api/auth/generate-challenge', { user_id: userId });
    return response.data;
  },

  verifyChallengeEnhanced: async (challengeId, audioFile, userId) => {
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    formData.append('challenge_id', challengeId);
    formData.append('user_id', userId.toString());
    
    const response = await api.post('/api/auth/verify-challenge-enhanced', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  verifyChallenge: async (challengeId, audioFile, spokenPhrase) => {
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    formData.append('spoken_phrase', spokenPhrase);
    
    const response = await api.post(`/api/auth/verify-challenge?challenge_id=${challengeId}`, formData);
    return response.data;
  },

  getVerificationAttempts: async (userId, limit = 10) => {
    const response = await api.get(`/api/auth/verification-attempts/${userId}?limit=${limit}`);
    return response.data;
  },

  getUserInfo: async (userId) => {
    const response = await api.get(`/api/user/${userId}/info`);
    return response.data;
  },

  getUserEnrollmentInfo: async (userId) => {
    const response = await api.get(`/api/user/${userId}/enrollment-info`);
    return response.data;
  },

  getAttendanceStatus: async (userId) => {
    const response = await api.get(`/api/attendance/status?user_id=${userId}`);
    return response.data;
  },

  verifyAttendance: async (challengeId, audioFile, userId, scheduledTime) => {
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    formData.append('challenge_id', challengeId);
    formData.append('user_id', userId.toString());
    formData.append('scheduled_time', scheduledTime);

    const response = await api.post('/api/attendance/verify', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getAttendanceLogs: async (params = {}) => {
    const queryParams = new URLSearchParams();

    if (params.user_id) queryParams.append('user_id', params.user_id);
    if (params.start_date) queryParams.append('start_date', params.start_date);
    if (params.end_date) queryParams.append('end_date', params.end_date);
    if (params.decision && params.decision !== 'all') queryParams.append('decision', params.decision);

    const queryString = queryParams.toString();
    const url = `/api/manager/attendance-logs${queryString ? `?${queryString}` : ''}`;
    const response = await api.get(url);
    return response.data;
  },

getVerificationAttempts: (params = {}) => {
  const queryParams = new URLSearchParams();
  
  if (params.limit) queryParams.append('limit', params.limit);
  if (params.offset) queryParams.append('offset', params.offset);
  if (params.user_id) queryParams.append('user_id', params.user_id);
  if (params.decision) queryParams.append('decision', params.decision);
  
  const queryString = queryParams.toString();
  const url = `/api/manager/verification-attempts${queryString ? `?${queryString}` : ''}`;
  
  return api.get(url);
},
};

export default api;