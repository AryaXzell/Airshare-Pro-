import React, { useEffect, useState } from 'react';

interface AudioVisualizerProps {
  isPlaying: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isPlaying }) => {
  const [barHeights, setBarHeights] = useState<number[]>([4, 4, 4, 4, 4]);

  useEffect(() => {
    if (!isPlaying) {
      setBarHeights([4, 4, 4, 4, 4]);
      return;
    }

    const interval = setInterval(() => {
      setBarHeights([
        Math.floor(Math.random() * 12) + 4,
        Math.floor(Math.random() * 16) + 4,
        Math.floor(Math.random() * 14) + 4,
        Math.floor(Math.random() * 18) + 4,
        Math.floor(Math.random() * 10) + 4,
      ]);
    }, 110);

    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className="flex items-end gap-[3.5px] h-5 py-0.5" aria-hidden="true">
      {barHeights.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full viz-bar transition-[height] duration-100 ease-out"
          style={{
            height: `${h}px`,
            backgroundColor: 'var(--accent, #3b82f6)',
            opacity: 0.75 + (i % 3) * 0.1,
          }}
        />
      ))}
    </div>
  );
};
