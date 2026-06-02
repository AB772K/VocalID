/**
 * OnboardingFlow presents a three-step intro that can be skipped or completed once.
 */
import React, { useMemo, useState } from 'react';

function OnboardingFlow({ onComplete, onSkip }) {
  const slides = useMemo(
    () => [
      {
        title: 'Secure Voice Login',
        body: 'Verify identity with a quick voice phrase for secure, hands-free access.',
        icon: 'mic'
      },
      {
        title: 'Attendance Tracking',
        body: 'Log periodic voice check-ins to confirm presence in seconds.',
        icon: 'calendar'
      },
      {
        title: 'Manager Dashboard',
        body: 'Managers register users, review logs, and monitor attendance in one place.',
        icon: 'dashboard'
      }
    ],
    []
  );

  const [step, setStep] = useState(0);
  const isLastStep = step === slides.length - 1;
  const activeSlide = slides[step];

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setStep((prev) => Math.min(prev + 1, slides.length - 1));
  };

  return (
    <div className="onboarding" role="dialog" aria-label="VocalID onboarding">
      <div className="onboarding-card">
        <div className="onboarding-skip-row">
          <button type="button" className="onboarding-skip" onClick={onSkip}>
            Skip
          </button>
        </div>
        <div className="onboarding-icon" aria-hidden="true">
          <SlideIcon type={activeSlide.icon} />
        </div>
        <h2 className="onboarding-title">{activeSlide.title}</h2>
        <p className="onboarding-body">{activeSlide.body}</p>
        <div className="onboarding-dots" aria-hidden="true">
          {slides.map((_, index) => (
            <span
              key={_.title}
              className={`onboarding-dot${index === step ? ' active' : ''}`}
            />
          ))}
        </div>
        <div className="onboarding-actions">
          <button type="button" className="onboarding-primary" onClick={handleNext}>
            {isLastStep ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SlideIcon({ type }) {
  if (type === 'calendar') {
    return (
      <svg viewBox="0 0 64 64" role="img" aria-label="Attendance tracking icon">
        <rect x="10" y="14" width="44" height="40" rx="8" fill="none" stroke="currentColor" strokeWidth="3" />
        <line x1="10" y1="26" x2="54" y2="26" stroke="currentColor" strokeWidth="3" />
        <line x1="22" y1="8" x2="22" y2="20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <line x1="42" y1="8" x2="42" y2="20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M22 40l6 6 14-14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === 'dashboard') {
    return (
      <svg viewBox="0 0 64 64" role="img" aria-label="Manager dashboard icon">
        <rect x="10" y="12" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="36" y="12" width="18" height="28" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="10" y="36" width="18" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="36" y="46" width="18" height="6" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Secure voice login icon">
      <rect x="26" y="14" width="12" height="26" rx="6" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M18 30a14 14 0 0 0 28 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="32" y1="44" x2="32" y2="52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="24" y1="52" x2="40" y2="52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default OnboardingFlow;
