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

  const barColors = [
    'bg-blue-500',
    'bg-blue-400',
    'bg-indigo-500',
    'bg-sky-400',
    'bg-violet-400',
  ];

  return (
    <div className="flex items-end gap-[3.5px] h-5 py-0.5">
      {barHeights.map((h, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full viz-bar ${barColors[i]}`}
          style={{ height: `${h}px` }}
        />
      ))}
    </div>
  );
};
