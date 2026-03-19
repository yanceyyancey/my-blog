'use client';
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTheme } from 'next-themes';

export default function VantaBackground() {
  const [vantaEffect, setVantaEffect] = useState(null);
  const vantaRef = useRef(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let WAVES;
    // Dynamically import vanta to avoid SSR issues
    window.THREE = THREE;
    import('vanta/dist/vanta.waves.min').then((module) => {
      WAVES = module.default || module;
      if (!vantaEffect) {
        setVantaEffect(
          WAVES({
            el: vantaRef.current,
            THREE,
            mouseControls: true,
            touchControls: true,
            gyroControls: false,
            minHeight: 200.0,
            minWidth: 200.0,
            scale: 1.0,
            scaleMobile: 1.0,
            // Premium vibe colors
            color: resolvedTheme === 'dark' ? 0x050510 : 0xe0e0e8,
            shininess: 30.0,
            waveHeight: 12.0,
            waveSpeed: 0.6,
            zoom: 0.85,
          })
        );
      }
    });

    return () => {
      if (vantaEffect) vantaEffect.destroy();
    };
  }, []);

  // Sync color changes on theme switch
  useEffect(() => {
    if (vantaEffect) {
      vantaEffect.setOptions({
        color: resolvedTheme === 'dark' ? 0x050510 : 0xe0e0e8,
      });
    }
  }, [resolvedTheme, vantaEffect]);

  return (
    <div
      ref={vantaRef}
      style={{
        position: 'fixed',
        zIndex: -1,
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        transition: 'background-color 0.5s ease',
      }}
    />
  );
}
