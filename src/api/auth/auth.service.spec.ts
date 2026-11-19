import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { User } from 'src/core/entity/user.entity';
import { Otp } from 'src/core/entity/otp.entity';
import { BcryptManage } from 'src/infrastructure/lib/bcrypt';
import { EmailService } from '../email/email.service';
import { NetWorkEnum } from 'src/common/enum/network.enums';
import type { Response } from 'express';
import type { LoginUserDto } from './dto/login-auth.dto';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: {
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  const mockResponse = () => ({ cookie: jest.fn() }) as unknown as Response;

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((data) => ({ id: 'new-id', ...data })),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Otp), useValue: {} },
        {
          provide: 'REDIS_CLIENT',
          useValue: { get: jest.fn(), set: jest.fn() },
        },
        {
          provide: BcryptManage,
          useValue: {
            createBcryptPassword: jest.fn().mockResolvedValue('hashed'),
            comparePassword: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed-token') },
        },
        { provide: EmailService, useValue: { otpSend: jest.fn() } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('returns tokens and user data for a correct, active, matching-network login', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'u1',
        email: 'a@test.com',
        password: 'hashed',
        is_active: true,
        network: NetWorkEnum.EMAIL,
      });

      const result = await service.login(
        { email: 'a@test.com', password: 'plain' } as LoginUserDto,
        mockResponse(),
      );

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(result.data).not.toHaveProperty('password');
    });

    it('rejects when the account is not active', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'u1',
        email: 'a@test.com',
        password: 'hashed',
        is_active: false,
        network: NetWorkEnum.EMAIL,
      });

      await expect(
        service.login(
          { email: 'a@test.com', password: 'plain' } as LoginUserDto,
          mockResponse(),
        ),
      ).rejects.toThrow('You are not active.');
    });
  });

  describe('loginOrRegisterSocial', () => {
    it('creates a new active user when no account exists for the email', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.loginOrRegisterSocial(
        'new@test.com',
        'New User',
        NetWorkEnum.GOOGLE,
        mockResponse(),
      );

      expect(userRepository.save).toHaveBeenCalled();
      const savedArg = userRepository.save.mock.calls[0][0];
      expect(savedArg.is_active).toBe(true);
      expect(savedArg.network).toBe(NetWorkEnum.GOOGLE);
      expect(result.accessToken).toBe('signed-token');
      expect(result.data).not.toHaveProperty('password');
    });

    it('logs an existing matching-network user straight in without creating a new row', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'u1',
        email: 'existing@test.com',
        password: 'hashed',
        is_active: true,
        network: NetWorkEnum.GOOGLE,
      });

      const result = await service.loginOrRegisterSocial(
        'existing@test.com',
        'Existing User',
        NetWorkEnum.GOOGLE,
        mockResponse(),
      );

      expect(userRepository.save).not.toHaveBeenCalled();
      expect(result.accessToken).toBe('signed-token');
    });

    it('rejects when the email is already registered under a different network', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'u1',
        email: 'existing@test.com',
        password: 'hashed',
        is_active: true,
        network: NetWorkEnum.EMAIL,
      });

      await expect(
        service.loginOrRegisterSocial(
          'existing@test.com',
          'Existing User',
          NetWorkEnum.GOOGLE,
          mockResponse(),
        ),
      ).rejects.toThrow('You are logged in from another network.');
    });
  });
});
