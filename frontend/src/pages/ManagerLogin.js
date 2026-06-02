import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, User, Lock, Voicemail } from 'lucide-react';
import { authAPI } from '../services/api';
import '../styles/Auth.css';

const ManagerLogin = () => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await authAPI.managerLogin(formData);
      localStorage.setItem('manager', JSON.stringify(response));
      navigate('/manager/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container manager-login-page">
      <div className="auth-card manager-login-card">
        <div className="auth-header">
          <div className="logo">
            <Voicemail className="logo-icon" />
            <h1>VocalID</h1>
          </div>
          <p className="tagline">Manager Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="input-group">
            <User className="input-icon" />
            <input
              type="text"
              placeholder="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          <div className="input-group">
            <Lock className="input-icon" />
            <input
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="auth-button">
            {loading ? 'Signing In...' : 'Sign In as Manager'}
            <LogIn size={18} />
          </button>
        </form>

        <div className="auth-footer">
          <p>User login? <a href="/voice-login" className="link">Click here</a></p>
        </div>
      </div>
    </div>
  );
};

export default ManagerLogin;