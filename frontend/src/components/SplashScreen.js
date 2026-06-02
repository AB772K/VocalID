/**
 * SplashScreen shows the animated VocalID intro before onboarding.
 */
import React from 'react';

function SplashScreen() {
  return (
    <div className="splash-screen" role="status" aria-live="polite">
      <div className="splash-icon" aria-hidden="true">
        <span className="splash-wave wave-left" />
        <span className="splash-mic" />
        <span className="splash-wave wave-right" />
      </div>
      <h1 className="splash-title">VocalID</h1>
      <p className="splash-tagline">Intelligent Voice Authentication</p>
    </div>
  );
}

export default SplashScreen;
