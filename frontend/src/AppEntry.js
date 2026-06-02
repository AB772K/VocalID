/**
 * AppEntry gates the splash/onboarding flow before rendering the main app router.
 */
import React, { useEffect, useState } from 'react';
import App from './App';
import SplashScreen from './components/SplashScreen';
import OnboardingFlow from './components/OnboardingFlow';
import './styles/EntryFlow.css';

const SPLASH_DURATION_MS = 2500;

const getInitialPhase = () => 'splash';

function AppEntry() {
  const [phase, setPhase] = useState(getInitialPhase);

  useEffect(() => {
    if (phase !== 'splash' || typeof window === 'undefined') {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setPhase('onboarding');
    }, SPLASH_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [phase]);

  const handleFinish = () => {
    setPhase('app');
  };

  if (phase === 'splash') {
    return (
      <div className="app-entry">
        <SplashScreen />
      </div>
    );
  }

  if (phase === 'onboarding') {
    return (
      <div className="app-entry">
        <OnboardingFlow onComplete={handleFinish} onSkip={handleFinish} />
      </div>
    );
  }

  return <App />;
}

export default AppEntry;
