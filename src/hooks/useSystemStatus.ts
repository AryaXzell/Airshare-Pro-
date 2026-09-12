import { useCallback, useEffect, useRef, useState } from 'react';
import { AnnouncementBannerInfo, ApiResponse, MaintenanceLevel, SystemStatusData } from '../types';

const DISMISS_TIMESTAMP_KEY = 'airshare_announcement_dismissed_at';
const POLL_INTERVAL_MS = 8000; // Poll every 8s for snappy real-time synchronization

export function useSystemStatus() {
  const [announcement, setAnnouncement] = useState<AnnouncementBannerInfo | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(false);
  const [maintenanceLevel, setMaintenanceLevel] = useState<MaintenanceLevel>('off');
  const [systemStatus, setSystemStatus] = useState<'operational' | 'degraded' | 'major_outage'>('operational');
  const [services, setServices] = useState<SystemStatusData['services'] | null>(null);
  const [featureFlags, setFeatureFlags] = useState<{
    pasteToUpload: boolean;
    qrCode: boolean;
    pwaInstallPrompt: boolean;
  }>({
    pasteToUpload: true,
    qrCode: true,
    pwaInstallPrompt: true,
  });
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const checkDismissStatus = useCallback((announce: AnnouncementBannerInfo | null) => {
    if (!announce || !announce.enabled || !announce.message) {
      return false;
    }
    try {
      const dismissedAtRaw = localStorage.getItem(DISMISS_TIMESTAMP_KEY);
      if (!dismissedAtRaw) return false;
      const dismissedAt = parseInt(dismissedAtRaw, 10);
      if (isNaN(dismissedAt)) return false;
      // If announcement was updated AFTER the user dismissed it, show it again
      const announceUpdatedAt = announce.updatedAt || 0;
      return dismissedAt >= announceUpdatedAt;
    } catch {
      return false;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system-status', {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      if (!res.ok) return;

      const data: ApiResponse<SystemStatusData> = await res.json();
      if (data.success && isMountedRef.current) {
        const sysData = data.data;
        setMaintenanceMode(Boolean(sysData.maintenanceMode));
        setMaintenanceLevel(sysData.maintenanceLevel || (sysData.maintenanceMode ? 'upload_only' : 'off'));
        setSystemStatus(sysData.status || 'operational');
        if (sysData.services) {
          setServices(sysData.services);
        }
        
        const activeAnnounce = sysData.announcement && sysData.announcement.enabled ? sysData.announcement : null;
        setAnnouncement(activeAnnounce);
        setIsDismissed(checkDismissStatus(activeAnnounce));

        if (sysData.featureFlags) {
          setFeatureFlags({
            pasteToUpload: sysData.featureFlags.pasteToUpload ?? true,
            qrCode: sysData.featureFlags.qrCode ?? true,
            pwaInstallPrompt: sysData.featureFlags.pwaInstallPrompt ?? true,
          });
        }
      }
    } catch (err) {
      // Fail-silent on background poll network errors
    }
  }, [checkDismissStatus]);

  const dismissAnnouncement = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_TIMESTAMP_KEY, Date.now().toString());
    } catch {}
    setIsDismissed(true);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchStatus();

    // Periodic polling for real-time synchronization
    const pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        fetchStatus();
      }
    }, POLL_INTERVAL_MS);

    // Sync immediately on focus, visibility change or when internet reconnects
    const handleFocusOrOnline = () => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
      }
    };

    window.addEventListener('focus', handleFocusOrOnline);
    window.addEventListener('visibilitychange', handleFocusOrOnline);
    window.addEventListener('online', handleFocusOrOnline);

    return () => {
      isMountedRef.current = false;
      clearInterval(pollTimer);
      window.removeEventListener('focus', handleFocusOrOnline);
      window.removeEventListener('visibilitychange', handleFocusOrOnline);
      window.removeEventListener('online', handleFocusOrOnline);
    };
  }, [fetchStatus]);

  return {
    announcement,
    maintenanceLevel,
    maintenanceMode,
    systemStatus,
    services,
    featureFlags,
    isDismissed,
    dismissAnnouncement,
    refetchStatus: fetchStatus,
  };
}
