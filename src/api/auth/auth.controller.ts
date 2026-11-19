import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Patch,
  UseGuards,
  UseFilters,
  Req,
} from '@nestjs/common';
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
import { NetWorkEnum } from 'src/common/enum/network.enums';
import { config } from 'src/config';
import { AuthGuard } from '@nestjs/passport';
import {
  OAUTH_STATE_COOKIE,
  SocialAuthStartGuard,
} from './guards/social-auth.guard';
import { SocialAuthExceptionFilter } from './guards/social-auth-exception.filter';
import { TelegramAuthService } from './telegram.service';
import { TelegramLoginDto } from './dto/telegram-login.dto';

type SocialProfile = { email: string; name: string; providerId: string };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
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
  @Post('telegram')
  async telegramLogin(
    @Body() data: TelegramLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = this.telegramAuthService.verifyWidgetData(data);
    return this.authService.loginOrRegisterSocial(
      profile.email,
      profile.name,
      profile.providerId,
      NetWorkEnum.TELEGRAM,
      res,
    );
  }

  @Public()
  @Get('google')
  @UseGuards(SocialAuthStartGuard('google'))
  googleLogin() {}

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @UseFilters(SocialAuthExceptionFilter)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.handleSocialCallback(req, res, NetWorkEnum.GOOGLE);
  }

  @Public()
  @Get('github')
  @UseGuards(SocialAuthStartGuard('github'))
  githubLogin() {}

  @Public()
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @UseFilters(SocialAuthExceptionFilter)
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    return this.handleSocialCallback(req, res, NetWorkEnum.GITHUB);
  }

  @Public()
  @Get('facebook')
  @UseGuards(SocialAuthStartGuard('facebook'))
  facebookLogin() {}

  @Public()
  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  @UseFilters(SocialAuthExceptionFilter)
  async facebookCallback(@Req() req: Request, @Res() res: Response) {
    return this.handleSocialCallback(req, res, NetWorkEnum.FACEBOOK);
  }

  private async handleSocialCallback(
    req: Request,
    res: Response,
    network: NetWorkEnum,
  ) {
    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE] as
      | string
      | undefined;
    res.clearCookie(OAUTH_STATE_COOKIE);
    if (!expectedState || expectedState !== req.query.state) {
      return res.redirect(`${config.FRONTEND_URL}/callback?error=invalid_state`);
    }

    const user = req.user as SocialProfile;
    const result = await this.authService.loginOrRegisterSocial(
      user.email,
      user.name,
      user.providerId,
      network,
      res,
    );
    return res.redirect(
      `${config.FRONTEND_URL}/callback?accessToken=${result.accessToken}`,
    );
  }

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
