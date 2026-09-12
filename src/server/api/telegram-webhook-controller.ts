import { Request, Response } from 'express';
import { getTelegramConfig } from '../telegram/telegram-auth';
import { handleTelegramCommand } from '../telegram/telegram-commands';

export const telegramWebhookController = {
  /**
   * Handles incoming webhook updates from Telegram Bot API.
   * Endpoint: POST /api/telegram/webhook
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    const config = getTelegramConfig();

    if (!config.enabled) {
      res.status(200).json({ ok: false, message: 'Telegram bot integration is not enabled.' });
      return;
    }

    const receivedSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (!receivedSecret || receivedSecret !== config.webhookSecret) {
      console.warn('[TELEGRAM_WEBHOOK_AUTH] Webhook request ditolak: Secret token tidak cocok.');
      res.status(401).json({ error: 'Unauthorized webhook secret token' });
      return;
    }

    // PENTING: proses command SEPENUHNYA SELESAI (await) SEBELUM mengirim
    // response ke Telegram. Ini WAJIB di lingkungan Vercel Serverless
    // Functions karena eksekusi kode SETELAH res.json() tidak dijamin
    // akan selesai (function dapat dihentikan platform kapan saja
    // setelah response terkirim).
    try {
      const update = req.body;
      if (!update || typeof update !== 'object') {
        res.status(200).json({ ok: true });
        return;
      }
      const message = update.message || update.edited_message;
      if (!message || !message.from || !message.chat) {
        res.status(200).json({ ok: true });
        return;
      }

      await handleTelegramCommand({
        messageId: message.message_id,
        from: {
          id: message.from.id,
          isBot: Boolean(message.from.is_bot),
          firstName: message.from.first_name,
          username: message.from.username,
        },
        chat: {
          id: message.chat.id,
          type: message.chat.type,
        },
        text: message.text,
        date: message.date,
      });

      // Response dikirim SETELAH seluruh proses command (termasuk
      // pengiriman balasan via sendTelegramMessage) benar-benar selesai.
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[TELEGRAM_WEBHOOK_PROCESSING_ERROR]', err);
      // Tetap kembalikan 200 ke Telegram agar Telegram tidak melakukan
      // retry pengiriman update yang sama berulang kali — kegagalan
      // internal sudah tercatat di log untuk diagnosis lebih lanjut.
      res.status(200).json({ ok: true });
    }
  },
};
