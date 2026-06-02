import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ManagerLogin from './pages/ManagerLogin';
import ManagerDashboard from './pages/ManagerDashboard';
import UserDashboard from './pages/UserDashboard';
import VoiceAuthLogin from './pages/VoiceAuthLogin'; // NEW
import VoiceChallenge from './components/VoiceChallenge'; // NEW
import './styles/App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Navigate to="/voice-login" replace />} />
          <Route path="/voice-login" element={<VoiceAuthLogin />} /> {/* NEW */}
          <Route path="/voice-challenge" element={<VoiceChallenge />} /> {/* NEW */}
          <Route path="/manager/login" element={<ManagerLogin />} />
          <Route path="/manager/dashboard" element={<ManagerDashboard />} />
          <Route path="/user/dashboard" element={<UserDashboard />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;