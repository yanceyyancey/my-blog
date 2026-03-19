'use client';
import React, { useCallback } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

export default function InteractiveBoy() {
  const dotLottieCallback = useCallback((dotLottie) => {
    if (dotLottie) {
      dotLottie.addEventListener('load', () => {
        if (dotLottie.isLoaded) {
          dotLottie.stateMachineLoad('StateMachine1');
          dotLottie.stateMachineStart();
        }
      });
    }
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1, 
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: 0.95,
      }}
    >
      <DotLottieReact
        src="/steamboat.lottie"
        dotLottieRefCallback={dotLottieCallback}
        style={{ width: '100%', height: '85%' }} // Slightly margin on top/bottom
      />
    </div>
  );
}
