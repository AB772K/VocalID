import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, User, Voicemail, Mic } from 'lucide-react';
import '../styles/Auth.css';

const VoiceAuthLogin = () => {
  const [formData, setFormData] = useState({ user_id: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Verify user exists first
      const verifyResponse = await fetch(`/api/user/${formData.user_id}/info`);
      
      if (!verifyResponse.ok) {
        throw new Error('User not found');
      }

      const userData = await verifyResponse.json();
      
      // Store user data for the challenge page
      localStorage.setItem('auth_user', JSON.stringify(userData));
      
      // Redirect to voice challenge
      navigate('/voice-challenge');
      
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid User ID');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container voice-login-page">
      <div className="auth-card voice-login-card">
        <div className="auth-header">
          <div className="logo">
            <Voicemail className="logo-icon" />
            <h1>VocalID</h1>
          </div>
          <p className="tagline">Voice Authentication Login</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="input-group">
            <User className="input-icon" />
            <input
              type="number"
              placeholder="Enter Your User ID"
              value={formData.user_id}
              onChange={(e) => setFormData({ user_id: e.target.value })}
              min = "1"
              required
            />
          </div>

          <button type="submit" disabled={loading} className="auth-button">
            {loading ? 'Verifying...' : 'Continue to Voice Authentication'}
            <Mic size={18} />
          </button>
        </form>

        <div className="auth-footer">
          <p>Manager login? <a href="/manager/login" className="link">Click here</a></p>
        </div>
      </div>
    </div>
  );
};

export default VoiceAuthLogin;