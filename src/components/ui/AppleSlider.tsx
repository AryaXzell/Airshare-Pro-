import React, { useCallback, useEffect, useRef, useState } from 'react';

interface AppleSliderProps {
  value: number; // 0 to 100
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  className?: string;
  disabled?: boolean;
}

export const AppleSlider: React.FC<AppleSliderProps> = ({
  value,
  onChange,
  onChangeEnd,
  className = '',
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const calculatePercentage = useCallback((clientX: number): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    return Math.max(0, Math.min(100, percentage));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    const newPct = calculatePercentage(e.clientX);
    setDragValue(newPct);
    onChange?.(newPct);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      const newPct = calculatePercentage(e.clientX);
      setDragValue(newPct);
      onChange?.(newPct);
    };

    const handlePointerUp = (e: PointerEvent) => {
      setIsDragging(false);
      const newPct = calculatePercentage(e.clientX);
      setDragValue(null);
      onChangeEnd?.(newPct);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, calculatePercentage, onChange, onChangeEnd]);

  const displayValue = isDragging && dragValue !== null ? dragValue : value;
  const clampedValue = Math.max(0, Math.min(100, displayValue));

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      className={`apple-thick-slider-container ${isDragging ? 'is-dragging' : ''} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
      role="slider"
      aria-valuenow={Math.round(clampedValue)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        let delta = 0;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -5;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = 5;
        if (delta !== 0) {
          e.preventDefault();
          const next = Math.max(0, Math.min(100, clampedValue + delta));
          onChange?.(next);
          onChangeEnd?.(next);
        }
      }}
    >
      <div className="apple-thick-slider-track">
        <div
          className="apple-thick-slider-fill"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      <div
        className="apple-thick-slider-thumb"
        style={{ left: `${clampedValue}%` }}
      />
    </div>
  );
};
