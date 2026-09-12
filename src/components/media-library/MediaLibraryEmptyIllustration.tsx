import React from 'react';
import { motion } from 'motion/react';

interface MediaLibraryEmptyIllustrationProps {
  className?: string;
}

export const MediaLibraryEmptyIllustration: React.FC<MediaLibraryEmptyIllustrationProps> = ({
  className = 'w-48 h-36 sm:w-56 sm:h-42',
}) => {
  return (
    <div className={`relative flex items-center justify-center select-none pointer-events-none ${className}`}>
      <svg
        viewBox="0 0 240 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-xs"
        aria-hidden="true"
      >
        <defs>
          {/* Ambient Center Glow */}
          <radialGradient id="clean-glass-ambient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          {/* Back Glass Card Gradient */}
          <linearGradient id="glass-card-back" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--surface-elevated)" stopOpacity="0.82" />
            <stop offset="100%" stopColor="var(--surface-secondary)" stopOpacity="0.45" />
          </linearGradient>

          {/* Front Glass Card Gradient */}
          <linearGradient id="glass-card-front" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--surface-elevated)" stopOpacity="0.94" />
            <stop offset="60%" stopColor="var(--surface-elevated)" stopOpacity="0.80" />
            <stop offset="100%" stopColor="var(--surface-primary)" stopOpacity="0.65" />
          </linearGradient>

          {/* Glass Refraction Sheen */}
          <linearGradient id="glass-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.45" />
            <stop offset="50%" stopColor="var(--text-main)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </linearGradient>

          {/* Floating Pill Tag Gradient */}
          <linearGradient id="glass-tag-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--surface-elevated)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--surface-secondary)" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {/* Ambient Center Glow */}
        <motion.ellipse
          cx="120"
          cy="92"
          rx="75"
          ry="48"
          fill="url(#clean-glass-ambient)"
          animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Ground Perspective Shadow (Subtle Glass Projection) */}
        <ellipse
          cx="120"
          cy="154"
          rx="68"
          ry="7"
          fill="var(--text-main)"
          opacity="0.06"
        />

        {/* Group: Primary Layered Glass Plates with Gentle Floating Physics */}
        <motion.g
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* =================================================================
           * BACK GLASS PLATE (Tilted Angle -7deg, Media Waveform Etchings)
           * ================================================================= */}
          <g transform="translate(56, 38) rotate(-7 52 42)">
            {/* Glass Surface */}
            <rect
              x="0"
              y="0"
              width="104"
              height="78"
              rx="16"
              fill="url(#glass-card-back)"
              stroke="var(--border-subtle)"
              strokeWidth="1.2"
              className="backdrop-blur-xs"
            />

            {/* Top Light Highlight Border */}
            <path
              d="M 16 0.6 L 88 0.6"
              stroke="var(--border-subtle-hover)"
              strokeWidth="1"
              strokeLinecap="round"
              opacity="0.7"
            />

            {/* Audio Waveform / Track Etchings */}
            <g opacity="0.35">
              <line x1="22" y1="39" x2="22" y2="47" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" />
              <line x1="29" y1="33" x2="29" y2="53" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" />
              <line x1="36" y1="27" x2="36" y2="59" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" />
              <line x1="43" y1="35" x2="43" y2="51" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" />
              <line x1="50" y1="30" x2="50" y2="56" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" />
              <line x1="57" y1="23" x2="57" y2="63" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
              <line x1="64" y1="31" x2="64" y2="55" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" />
              <line x1="71" y1="37" x2="71" y2="49" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" />
              <line x1="78" y1="40" x2="78" y2="46" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" />
            </g>
          </g>

          {/* =================================================================
           * FRONT GLASS PLATE (Tilted Angle +4deg, Media Viewfinder & Accent Node)
           * ================================================================= */}
          <g transform="translate(80, 50) rotate(4 56 44)">
            {/* Soft Ambient Card Drop Shadow */}
            <rect
              x="2"
              y="6"
              width="112"
              height="84"
              rx="18"
              fill="var(--text-main)"
              opacity="0.04"
            />

            {/* Primary Clean Glass Plate */}
            <rect
              x="0"
              y="0"
              width="112"
              height="84"
              rx="18"
              fill="url(#glass-card-front)"
              stroke="var(--border-subtle)"
              strokeWidth="1.4"
            />

            {/* Diagonal Optical Glass Highlight Line */}
            <line
              x1="12"
              y1="4"
              x2="102"
              y2="76"
              stroke="url(#glass-sheen)"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.6"
            />

            {/* Minimalist Media Aperture / Frame Etching */}
            <rect
              x="16"
              y="16"
              width="80"
              height="52"
              rx="10"
              fill="var(--surface-secondary)"
              stroke="var(--border-subtle)"
              strokeWidth="1"
            />

            {/* Mountain / Media Horizon Line */}
            <path
              d="M 23 54 L 43 38 C 45 36.5 47.5 36.5 49.5 38 L 60 46 L 71 34 C 73 32.5 75.5 32.5 77.5 34 L 89 44"
              stroke="var(--text-main)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.32"
            />

            {/* Media Sun / Accent Node with Pulsing Beacon */}
            <g transform="translate(74, 28)">
              <circle
                cx="0"
                cy="0"
                r="4"
                fill="var(--accent)"
              />
              <circle
                cx="0"
                cy="0"
                r="7"
                stroke="var(--accent)"
                strokeWidth="1"
                strokeOpacity="0.4"
              />
            </g>
          </g>
        </motion.g>

        {/* =================================================================
         * FLOATING MICRO-ELEMENTS & AMBIENT PRISMS (Counter-motion physics)
         * ================================================================= */}
        <motion.g
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Floating Glass Media Tag (Upper Right) */}
          <g transform="translate(170, 32)">
            <rect
              x="0"
              y="0"
              width="36"
              height="24"
              rx="8"
              fill="url(#glass-tag-grad)"
              stroke="var(--border-subtle)"
              strokeWidth="1"
            />
            {/* Minimal Play Arrow inside tag */}
            <path
              d="M 15 8.5 L 23 12 L 15 15.5 Z"
              fill="var(--accent)"
              opacity="0.85"
            />
          </g>

          {/* Minimalist 4-Point Geometric Sparkle (Upper Left) */}
          <g transform="translate(46, 26)">
            <path
              d="M 10 0 C 10 5.5 5.5 10 0 10 C 5.5 10 10 14.5 10 20 C 10 14.5 14.5 10 20 10 C 14.5 10 10 5.5 10 0 Z"
              fill="var(--accent)"
              opacity="0.45"
            />
          </g>

          {/* Delicate Bottom-Left Micro Crosshair (+) */}
          <g transform="translate(34, 110)" opacity="0.3">
            <line x1="0" y1="4" x2="8" y2="4" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="4" y1="0" x2="4" y2="8" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" />
          </g>

          {/* Delicate Floating Accent Dot (Lower Right) */}
          <circle
            cx="206"
            cy="114"
            r="2.5"
            fill="var(--accent)"
            opacity="0.5"
          />

          {/* Subtle Ambient Particle */}
          <circle
            cx="72"
            cy="136"
            r="1.5"
            fill="var(--text-muted)"
            opacity="0.3"
          />
        </motion.g>
      </svg>
    </div>
  );
};
