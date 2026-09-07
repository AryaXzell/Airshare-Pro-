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

    // 1. If bot is disabled due to missing token or user IDs, return 200 without processing
    if (!config.enabled) {
      res.status(200).json({ ok: false, message: 'Telegram bot integration is not enabled.' });
      return;
    }

    // 2. Secret Token Verification (X-Telegram-Bot-Api-Secret-Token)
    if (config.webhookSecret) {
      const receivedSecret = req.headers['x-telegram-bot-api-secret-token'];
      if (!receivedSecret || receivedSecret !== config.webhookSecret) {
        console.warn('[TELEGRAM_WEBHOOK_AUTH] Webhook request ditolak: Secret token tidak cocok.');
        res.status(401).json({ error: 'Unauthorized webhook secret token' });
        return;
      }
    }

    // Respond immediately to Telegram to prevent timeouts
    res.status(200).json({ ok: true });

    // 3. Process update payload asynchronously
    try {
      const update = req.body;
      if (!update || typeof update !== 'object') return;

      const message = update.message || update.edited_message;
      if (!message || !message.from || !message.chat) return;

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
    } catch (err) {
      console.error('[TELEGRAM_WEBHOOK_ERROR] Kesalahan saat memproses webhook:', err);
    }
  },
};
