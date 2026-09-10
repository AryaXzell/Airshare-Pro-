import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

interface AudioVisualizerProps {
  isPlaying: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isPlaying }) => {
  const shouldReduceMotion = useReducedMotion();
  const [barScales, setBarScales] = useState<number[]>([0.25, 0.25, 0.25, 0.25, 0.25]);

  useEffect(() => {
    if (!isPlaying) {
      setBarScales([0.25, 0.25, 0.25, 0.25, 0.25]);
      return;
    }

    if (shouldReduceMotion) {
      setBarScales([0.5, 0.5, 0.5, 0.5, 0.5]);
      return;
    }

    const interval = setInterval(() => {
      setBarScales([
        Math.random() * 0.55 + 0.25,
        Math.random() * 0.70 + 0.30,
        Math.random() * 0.60 + 0.25,
        Math.random() * 0.75 + 0.25,
        Math.random() * 0.45 + 0.25,
      ]);
    }, 160);

    return () => clearInterval(interval);
  }, [isPlaying, shouldReduceMotion]);

  return (
    <div className="flex items-end gap-[3.5px] h-5 py-0.5" aria-hidden="true">
      {barScales.map((scale, i) => (
        <div
          key={i}
          className="w-[3px] h-full rounded-full viz-bar transition-transform duration-100 ease-out"
          style={{
            transform: `scaleY(${scale})`,
            transformOrigin: 'bottom',
            backgroundColor: 'var(--accent, #3b82f6)',
            opacity: 0.75 + (i % 3) * 0.1,
          }}
        />
      ))}
    </div>
  );
};
