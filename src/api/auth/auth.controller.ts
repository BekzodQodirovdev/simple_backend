import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Patch,
  UseGuards,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-auth.dto';
import { Request, Response } from 'express';
import { VerifyDto } from './dto/verify.dto';
import { setdOtpDdto } from './dto/sendotp.dto';
import { UserID } from 'src/common/decorator/user-id.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorator/public.decorator';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdatePasswordDto } from './dto/update-password';
import { AuthUpdatePassword } from 'src/common/guard/jwt-update-password.guard';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { GoogleAuthService } from './google.service';
import { GithubAuthService } from './github.service';
import { FacebookAuthService } from './facebook.service';
import { TelegramAuthService } from './telegram.service';
import { TelegramLoginDto } from './dto/telegram-login.dto';
import { NetWorkEnum } from 'src/common/enum/network.enums';
import { config } from 'src/config';
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly githubAuthService: GithubAuthService,
    private readonly facebookAuthService: FacebookAuthService,
    private readonly telegramAuthService: TelegramAuthService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() registerUserDto: CreateAuthDto) {
    return this.authService.register(registerUserDto);
  }

  @Public()
  @Post('login')
  login(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(loginUserDto, res);
  }

  @Public()
  @Post('verify')
  verify(@Body() data: VerifyDto) {
    return this.authService.verify(data);
  }

  @Public()
  @Post('send-otp')
  sendOtp(@Body() data: setdOtpDdto) {
    return this.authService.sendOtp(data);
  }

  @Public()
  @Get('google')
  redirectToGoogle(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    res.cookie('oauth_state', state, {
      httpOnly: true,
      maxAge: 5 * 60 * 1000,
    });
    res.redirect(this.googleAuthService.getAuthUrl(state));
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!state || state !== req.cookies?.oauth_state) {
      res.redirect(`${config.FRONTEND_URL}/callback?error=invalid_state`);
      return;
    }
    res.clearCookie('oauth_state');
    try {
      const profile = await this.googleAuthService.handleCallback(code);
      const result = await this.authService.loginOrRegisterSocial(
        profile.email,
        profile.name,
        NetWorkEnum.GOOGLE,
        res,
      );
      res.redirect(
        `${config.FRONTEND_URL}/callback?accessToken=${result.accessToken}`,
      );
    } catch (error) {
      this.redirectOnSocialError(res, error);
    }
  }

  @Public()
  @Get('github')
  redirectToGithub(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    res.cookie('oauth_state', state, {
      httpOnly: true,
      maxAge: 5 * 60 * 1000,
    });
    res.redirect(this.githubAuthService.getAuthUrl(state));
  }

  @Public()
  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!state || state !== req.cookies?.oauth_state) {
      res.redirect(`${config.FRONTEND_URL}/callback?error=invalid_state`);
      return;
    }
    res.clearCookie('oauth_state');
    try {
      const profile = await this.githubAuthService.handleCallback(code);
      const result = await this.authService.loginOrRegisterSocial(
        profile.email,
        profile.name,
        NetWorkEnum.GITHUB,
        res,
      );
      res.redirect(
        `${config.FRONTEND_URL}/callback?accessToken=${result.accessToken}`,
      );
    } catch (error) {
      this.redirectOnSocialError(res, error);
    }
  }

  @Public()
  @Get('facebook')
  redirectToFacebook(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    res.cookie('oauth_state', state, {
      httpOnly: true,
      maxAge: 5 * 60 * 1000,
    });
    res.redirect(this.facebookAuthService.getAuthUrl(state));
  }

  @Public()
  @Get('facebook/callback')
  async facebookCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!state || state !== req.cookies?.oauth_state) {
      res.redirect(`${config.FRONTEND_URL}/callback?error=invalid_state`);
      return;
    }
    res.clearCookie('oauth_state');
    try {
      const profile = await this.facebookAuthService.handleCallback(code);
      const result = await this.authService.loginOrRegisterSocial(
        profile.email,
        profile.name,
        NetWorkEnum.FACEBOOK,
        res,
      );
      res.redirect(
        `${config.FRONTEND_URL}/callback?accessToken=${result.accessToken}`,
      );
    } catch (error) {
      this.redirectOnSocialError(res, error);
    }
  }

  private redirectOnSocialError(res: Response, error: unknown) {
    if (error instanceof ForbiddenException) {
      res.redirect(`${config.FRONTEND_URL}/callback?error=network_conflict`);
      return;
    }
    console.error('Social login callback error:', error);
    res.redirect(`${config.FRONTEND_URL}/callback?error=server_error`);
  }

  @Public()
  @Post('telegram')
  telegramLogin(
    @Body() data: TelegramLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = this.telegramAuthService.verifyWidgetData(data);
    return this.authService.loginOrRegisterSocial(
      profile.email,
      profile.name,
      NetWorkEnum.TELEGRAM,
      res,
    );
  }

  // token must
  @ApiBearerAuth()
  @Get('profile')
  profile(@UserID() id: string) {
    return this.authService.profile(id);
  }

  @ApiBearerAuth()
  @Public()
  @UseGuards(AuthUpdatePassword)
  @Patch('forgot-password')
  updatePassword(@Body() data: UpdatePasswordDto, @Req() req: Request) {
    const tokenEmail = (req as unknown as { user: { email: string } }).user
      .email;
    return this.authService.updatePassword(data, tokenEmail);
  }

  @ApiBearerAuth()
  @Patch('user')
  updateUser(@UserID() id: string, @Body() data: UpdateAuthDto) {
    return this.authService.updateUser(id, data);
  }
}
