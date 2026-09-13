import { Request, Response } from 'express';
import {
  ADMIN_COOKIE_NAME,
  revokeAdminSession,
  revokeAllAdminSessions,
} from '../security/admin-auth';
import { auditLogRepository } from '../repository/audit-log-repository';
import { getClientIp } from '../security/client-ip';

export async function revokeSession(req: Request, res: Response): Promise<void> {
  try {
    const clientIp = getClientIp(req);
    const { tokenToRevoke } = req.body || {};
    if (!tokenToRevoke || typeof tokenToRevoke !== 'string') {
      res.status(400).json({ success: false, error: { message: 'Token sesi wajib diberikan.' } });
      return;
    }

    await revokeAdminSession(tokenToRevoke);

    await auditLogRepository.recordAction({
      type: 'SESSION_REVOKE',
      detail: `Mencabut sesi admin dengan token ${tokenToRevoke.substring(0, 8)}...`,
      ip: clientIp,
      adminTokenPreview: `${tokenToRevoke.substring(0, 8)}...`,
    });

    res.json({
      success: true,
      message: 'Sesi admin berhasil dicabut.',
    });
  } catch (err: unknown) {
    console.error('[REVOKE_SESSION_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'REVOKE_FAILED', message: 'Gagal mencabut sesi admin. Silakan coba lagi.' },
    });
  }
}

export async function revokeAllSessions(req: Request, res: Response): Promise<void> {
  try {
    const clientIp = getClientIp(req);
    const currentToken = req.cookies?.[ADMIN_COOKIE_NAME];
    const count = await revokeAllAdminSessions(currentToken);

    await auditLogRepository.recordAction({
      type: 'SESSION_REVOKE_ALL',
      detail: `Mencabut SEMUA sesi admin lain (${count} sesi ditutup)`,
      ip: clientIp,
    });

    res.json({
      success: true,
      revokedCount: count,
      message: `Berhasil mencabut ${count} sesi admin lain.`,
    });
  } catch (err: unknown) {
    console.error('[REVOKE_ALL_SESSIONS_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'REVOKE_ALL_FAILED', message: 'Gagal mencabut sesi admin lainnya. Silakan coba lagi.' },
    });
  }
}
