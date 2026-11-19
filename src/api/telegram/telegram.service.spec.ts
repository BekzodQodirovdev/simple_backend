import { BadRequestException } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { VerifyType } from 'src/common/type/otp.type';
import { config } from 'src/config';

jest.mock('src/config', () => ({
  config: { TELEGRAM_BOT_USERNAME: '@test_bot', TELEGRAM_BOT_TOKEN: 'x' },
}));

describe('TelegramService', () => {
  let service: TelegramService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let contacts: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let sendMessage: jest.Mock;

  beforeEach(() => {
    repo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: '1' })),
      findOne: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };
    contacts = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 'c1' })),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn(),
    };
    service = new TelegramService(repo as any, contacts as any);
    sendMessage = jest.fn().mockResolvedValue(undefined);
    (service as any).bot = { api: { sendMessage } };
  });

  describe('requestOtp', () => {
    it('sends the OTP directly when the phone is already linked to a chat', async () => {
      contacts.findOne.mockResolvedValue({
        phone: '998901234567',
        chat_id: '555',
      });

      const result = await service.requestOtp('+998 90 123 45 67');

      expect(result).toEqual({ sent: true });
      expect(sendMessage).toHaveBeenCalledWith(
        '555',
        expect.stringContaining(repo.create.mock.calls[0][0].otp_code),
      );
      const saved = repo.create.mock.calls[0][0];
      expect(saved.phone).toBe('998901234567');
      expect(saved.otp_code).toMatch(/^\d{6}$/);
      expect(saved.chat_id).toBe('555');
      expect(saved.token).toBeNull();
      expect(saved.type).toBe(VerifyType.TELEGRAM_LOGIN);
    });

    it('falls back to a deep link and forgets the contact when sending fails', async () => {
      contacts.findOne.mockResolvedValue({
        phone: '998901234567',
        chat_id: '555',
      });
      sendMessage.mockRejectedValue(new Error('bot was blocked'));

      const result = await service.requestOtp('998901234567');

      expect(result.sent).toBe(false);
      expect((result as { deepLink: string }).deepLink).toContain(
        'https://t.me/test_bot?start=',
      );
      expect(contacts.delete).toHaveBeenCalledWith({ phone: '998901234567' });
    });

    it('returns a deep link with a random token when the phone is not linked yet', async () => {
      const result = await service.requestOtp('+998 90 123 45 67');

      expect(result.sent).toBe(false);
      const saved = repo.create.mock.calls[0][0];
      expect(saved.phone).toBe('998901234567');
      expect(saved.token).toMatch(/^[A-Za-z0-9]{32}$/);
      expect(saved.chat_id).toBeNull();
      expect((result as { deepLink: string }).deepLink).toBe(
        `https://t.me/test_bot?start=${saved.token}`,
      );
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('throws without writing a row when TELEGRAM_BOT_USERNAME is not configured', async () => {
      const original = config.TELEGRAM_BOT_USERNAME;
      (config as { TELEGRAM_BOT_USERNAME: string }).TELEGRAM_BOT_USERNAME = '';

      await expect(service.requestOtp('998901234567')).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();

      (config as { TELEGRAM_BOT_USERNAME: string }).TELEGRAM_BOT_USERNAME =
        original;
    });
  });

  describe('verifyOtp', () => {
    it('deletes the row and resolves with the normalized phone when the code matches and has not expired', async () => {
      repo.findOne.mockResolvedValue({
        id: '1',
        otp_code: '938210',
        otp_expires_at: new Date(Date.now() + 60_000),
      });

      const result = await service.verifyOtp('+998 90 123 45 67', '938210');

      expect(result).toBe('998901234567');
      expect(repo.delete).toHaveBeenCalledWith('1');
    });

    it('throws when no row exists for the phone', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.verifyOtp('998901234567', '938210')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when the code does not match', async () => {
      repo.findOne.mockResolvedValue({
        id: '1',
        otp_code: '000000',
        otp_expires_at: new Date(Date.now() + 60_000),
      });

      await expect(service.verifyOtp('998901234567', '938210')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when the code has expired', async () => {
      repo.findOne.mockResolvedValue({
        id: '1',
        otp_code: '938210',
        otp_expires_at: new Date(Date.now() - 1000),
      });

      await expect(service.verifyOtp('998901234567', '938210')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('handleStartCommand', () => {
    it('asks for a phone share without a lookup when the payload is empty', async () => {
      const reply = await service.handleStartCommand('', '555');

      expect(repo.findOne).not.toHaveBeenCalled();
      expect(reply.requestContact).toBe(false);
    });

    it('replies with an error and no contact request when the token is unknown', async () => {
      repo.findOne.mockResolvedValue(null);

      const reply = await service.handleStartCommand('bad-token', '555');

      expect(reply.requestContact).toBe(false);
    });

    it('replies with an error when the token has expired', async () => {
      repo.findOne.mockResolvedValue({
        id: '1',
        otp_expires_at: new Date(Date.now() - 1000),
      });

      const reply = await service.handleStartCommand('old-token', '555');

      expect(reply.requestContact).toBe(false);
    });

    it('stores the chat id on the row and asks to share contact for a valid token', async () => {
      repo.findOne.mockResolvedValue({
        id: '1',
        otp_expires_at: new Date(Date.now() + 60_000),
      });

      const reply = await service.handleStartCommand('good-token', '555');

      expect(repo.update).toHaveBeenCalledWith('1', { chat_id: '555' });
      expect(reply.requestContact).toBe(true);
    });
  });

  describe('handleContactShare', () => {
    it('replies with an error when no row is pending for this chat', async () => {
      repo.findOne.mockResolvedValue(null);

      const message = await service.handleContactShare('555', '+998901234567');

      expect(contacts.save).not.toHaveBeenCalled();
      expect(message).not.toMatch(/\d{6}/);
    });

    it('replies with an error when the pending row has expired', async () => {
      repo.findOne.mockResolvedValue({
        phone: '998901234567',
        otp_code: '938210',
        otp_expires_at: new Date(Date.now() - 1000),
      });

      const message = await service.handleContactShare('555', '+998901234567');

      expect(contacts.save).not.toHaveBeenCalled();
      expect(message).not.toContain('938210');
    });

    it('rejects a contact whose phone does not match the one entered on the site', async () => {
      repo.findOne.mockResolvedValue({
        phone: '998901234567',
        otp_code: '938210',
        otp_expires_at: new Date(Date.now() + 60_000),
      });

      const message = await service.handleContactShare('555', '+998900000000');

      expect(contacts.save).not.toHaveBeenCalled();
      expect(message).not.toContain('938210');
    });

    it('saves a new contact and sends the code when the phone matches', async () => {
      repo.findOne.mockResolvedValue({
        phone: '998901234567',
        otp_code: '938210',
        otp_expires_at: new Date(Date.now() + 60_000),
      });

      const message = await service.handleContactShare(
        '555',
        '+998 90 123 45 67',
      );

      expect(contacts.save).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '998901234567', chat_id: '555' }),
      );
      expect(message).toContain('938210');
    });

    it('updates an existing contact instead of creating a duplicate', async () => {
      repo.findOne.mockResolvedValue({
        phone: '998901234567',
        otp_code: '938210',
        otp_expires_at: new Date(Date.now() + 60_000),
      });
      contacts.findOne.mockResolvedValue({
        id: 'c1',
        phone: '998901234567',
        chat_id: '111',
      });

      await service.handleContactShare('555', '+998901234567');

      expect(contacts.update).toHaveBeenCalledWith('c1', { chat_id: '555' });
      expect(contacts.save).not.toHaveBeenCalled();
    });
  });
});
