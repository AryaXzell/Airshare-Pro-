import React from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  onToast?: (msg: string) => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ onToast }) => {
  const { isInstallable, promptInstall } = usePWAInstall();

  if (!isInstallable) {
    return null;
  }

  const handleInstallClick = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      onToast?.('AirShare Pro berhasil dipasang di perangkat Anda!');
    }
  };

  return (
    <button
      onClick={handleInstallClick}
      className="p-2.5 rounded-full clean-interactive flex items-center justify-center clean-tap group"
      style={{
        borderColor: 'var(--border-subtle)',
        backgroundColor: 'var(--surface-secondary)',
      }}
      aria-label="Pasang Aplikasi AirShare Pro ke Perangkat"
      title="Pasang Aplikasi ke Perangkat (PWA)"
    >
      <Download className="w-4 h-4 sm:w-4.5 sm:h-4.5 group-hover:scale-110 transition-transform" style={{ color: 'var(--accent)' }} />
    </button>
  );
};
