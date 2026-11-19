import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UserRepository } from 'src/core/repository/user.repository';
import { User } from 'src/core/entity/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { BcryptManage } from 'src/infrastructure/lib/bcrypt';
import { JwtService } from '@nestjs/jwt';
import { OtpRepository } from 'src/core/repository/otp.repository';
import { Otp } from 'src/core/entity/otp.entity';
import { EmailService } from '../email/email.service';
import { IPayload } from 'src/common/interfaces';
import { config } from 'src/config';
import { Response } from 'express';
import { LoginUserDto } from './dto/login-auth.dto';
import { VerifyDto } from './dto/verify.dto';
import { OtpGenerator } from 'src/infrastructure/lib/otp';
import { setdOtpDdto } from './dto/sendotp.dto';
import { UpdatePasswordDto } from './dto/update-password';
import { VerifyType } from 'src/common/type/otp.type';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { NetWorkEnum } from 'src/common/enum/network.enums';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly repository: UserRepository,
    @InjectRepository(Otp) private readonly otpRepository: OtpRepository,
    private readonly manageBcrypt: BcryptManage,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}
  async register(dto: CreateAuthDto) {
    const currentUser = await this.repository.findOneBy({ email: dto.email });
    if (currentUser) {
      throw new HttpException('Email already exists.', 400);
    }
    const newPassword = await this.manageBcrypt.createBcryptPassword(
      dto.password,
    );

    dto.password = newPassword;

    const userData = this.repository.create(dto);
    // if (userData?.network != 'email') {
    //   userData.is_active = true;
    // }
    const { password, ...saveData } = await this.repository.save(userData);
    const otp_code_g = OtpGenerator();
    const otp_code = this.otpRepository.create({
      otp_code: otp_code_g,
      email: saveData.email,
      type: VerifyType.REGISTER,
      otp_time: new Date(Date.now() + 30 * 1000),
    });

    await this.otpRepository.save(otp_code);
    this.emailService.otpSend(saveData.email, otp_code_g);

    return { status_code: 201, message: 'Success', data: saveData };
  }

  async login(dto: LoginUserDto, res: Response) {
    const currentData = await this.repository.findOne({
      where: { email: dto.email },
    });

    if (!currentData) {
      throw new BadRequestException('Email or Password is wrong');
    }
    const isMatch = await this.manageBcrypt.comparePassword(
      dto.password,
      currentData?.password,
    );
    if (!isMatch) {
      throw new BadRequestException('Email or Password is wrong');
    }
    if (!currentData.is_active) {
      throw new ForbiddenException(`You are not active.`);
    }
    const network = dto.network ?? 'email';
    if (currentData.network != network) {
      throw new ForbiddenException(`You are logged in from another network.`);
    }
    const { accessToken, refreshToken } = this.signTokens(currentData);
    const { password, ...data } = currentData;
    this.writeToCookie(refreshToken, res);
    return {
      accessToken,
      refreshToken,
      data,
    };
  }

  private async writeToCookie(refresh_token: string, res: Response) {
    try {
      res.cookie('refreshToken', refresh_token, {
        maxAge: 15 * 24 * 60 * 60 * 1000,
        httpOnly: true,
      });
    } catch (error) {
      throw new BadRequestException(`Error on write to cookie: ${error}`);
    }
  }

  private signTokens(
    user: Pick<User, 'id' | 'email' | 'is_active'>,
  ): { accessToken: string; refreshToken: string } {
    const payload: IPayload = {
      sub: user.id,
      email: user.email,
      is_active: user.is_active,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: config.ACCESS_TOKEN_KEY,
      // `expiresIn` is typed as `ms.StringValue | number` since
      // @types/jsonwebtoken v9; our config value is a plain string at
      // runtime (e.g. "1d"), so it needs this cast.
      expiresIn: config.ACCESS_TOKEN_TIME as any,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: config.REFRESH_TOKEN_KEY,
      expiresIn: config.REFRESH_TOKEN_TIME as any,
    });
    return { accessToken, refreshToken };
  }

  async loginOrRegisterSocial(
    email: string,
    name: string,
    network: NetWorkEnum,
    res: Response,
  ) {
    let user = await this.repository.findOne({ where: { email } });

    if (!user) {
      const randomPassword = await this.manageBcrypt.createBcryptPassword(
        randomBytes(32).toString('hex'),
      );
      user = await this.repository.save(
        this.repository.create({
          name,
          email,
          password: randomPassword,
          is_active: true,
          network,
        }),
      );
    } else if (user.network !== network) {
      throw new ForbiddenException('You are logged in from another network.');
    } else {
      // The provider has just re-verified ownership of this email, so
      // treat that as authoritative: activate the row and rotate its
      // password. This closes the account-pre-seeding window where
      // someone registers this email/network via /auth/register with a
      // password of their own choosing before the real owner ever logs
      // in with that provider.
      const randomPassword = await this.manageBcrypt.createBcryptPassword(
        randomBytes(32).toString('hex'),
      );
      await this.repository.update(user.id, {
        is_active: true,
        password: randomPassword,
      });
      user = { ...user, is_active: true, password: randomPassword };
    }

    const { accessToken, refreshToken } = this.signTokens(user);
    const { password, ...data } = user;
    this.writeToCookie(refreshToken, res);
    return { accessToken, refreshToken, data };
  }

  async verify(data: VerifyDto) {
    if (data.type == 'register') {
      const otp_data = await this.otpRepository.findOne({
        where: { email: data.email },
      });
      const user = await this.repository.findOne({
        where: { email: data.email },
      });
      if (!otp_data || !user) {
        throw new NotFoundException('You are not registered yet!');
      } else if (
        otp_data.otp_code != data.otp_code ||
        otp_data.type != data.type
      ) {
        throw new BadRequestException('OTP code error!!!');
      }
      if (user?.is_active) {
        throw new BadRequestException('You are already active');
      }
      await this.repository.update(user.id, { is_active: true });
      return {
        status_code: 202,
        message: 'Success activated',
        data: {},
      };
    } else if (data.type == VerifyType.UPDATE_PASSWORD) {
      const otp_data = await this.otpRepository.findOne({
        where: { email: data.email },
      });
      if (!otp_data) {
        throw new NotFoundException('OTP not found for this email!');
      } else if (
        otp_data.otp_code != data.otp_code ||
        otp_data.type != data.type
      ) {
        throw new BadRequestException('OTP code error!!!');
      }
      const token = this.jwtService.sign(
        {
          email: data.email,
          type: VerifyType.UPDATE_PASSWORD,
          sub: otp_data.id,
        },
        {
          secret: config.JWT_SECRET,
          expiresIn: '1h',
        },
      );

      return {
        status_code: 202,
        message: 'OTP verified for password reset',
        data: { token },
      };
    }
  }

  async sendOtp(data: setdOtpDdto) {
    const { email, type } = data;
    const user = await this.repository.findOne({
      where: { email },
    });
    if (!user) {
      throw new NotFoundException('You are not registered yet!');
    }
    if (type == 'register') {
      if (user.is_active) {
        throw new BadRequestException('You are already active');
      }
    }
    const currentOtp = await this.otpRepository.findOne({ where: { email } });
    if (!currentOtp) {
      throw new NotFoundException('You are not registered yet!');
    }
    const now = new Date();
    if (now < currentOtp.otp_time) {
      throw new BadRequestException('Otp haliham ishlamoqda');
    }
    const otp_codeG = OtpGenerator();
    const otp = {
      ...currentOtp,
      otp_code: otp_codeG,
      type: type,
      otp_time: new Date(Date.now() + 30 * 1000),
    };
    await this.otpRepository.update(currentOtp.id, otp);
    this.emailService.otpSend(otp.email, otp.otp_code);
    return {
      status_code: 200,
      message: 'Success',
      data: {},
    };
  }

  profile(id: string) {
    return this.repository.findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        created_at: true,
        updated_at: true,
        network: true,
        is_active: true,
      },
    });
  }

  async updatePassword(dto: UpdatePasswordDto, tokenEmail: string) {
    const { email, password } = dto;
    if (email !== tokenEmail) {
      // The reset token only proves the caller verified an OTP for
      // `tokenEmail`; without this check it could be replayed to reset
      // ANY account's password just by naming a different `email` here.
      throw new ForbiddenException(
        'This reset token does not belong to that email.',
      );
    }
    const user = await this.repository.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const newPassword = await this.manageBcrypt.createBcryptPassword(password);
    await this.repository.update(user.id, {
      password: newPassword,
      updated_at: new Date(Date.now()),
    });
    return {
      status_code: 200,
      message: 'Success',
      data: {},
    };
  }

  async updateUser(id: string, data: UpdateAuthDto) {
    const userData = await this.repository.findOne({ where: { id } });
    if (!userData) {
      throw new HttpException('not found', 404);
    }
    if (userData?.password) {
      const newPassword = await this.manageBcrypt.createBcryptPassword(
        userData.password,
      );
      userData.password = newPassword;
    }
    await this.repository.update(id, {
      ...userData,
      updated_at: new Date(Date.now()),
    });
    return {
      status_code: 200,
      message: 'success',
      data: {},
    };
  }
}
