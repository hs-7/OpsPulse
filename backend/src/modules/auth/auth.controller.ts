import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly service: AuthService) {}
  @Get('status') status() { return this.service.status(); }
  @Post('register') register(@Body() body: unknown) { return this.service.register(body); }
  @Post('login') login(@Body() body: unknown) { return this.service.login(body); }
  @Post('refresh') refresh(@Body() body: { refreshToken?: string }) { return this.service.refresh(body.refreshToken); }
  @Post('logout') logout(@Body() body: { refreshToken?: string }) { return this.service.logout(body.refreshToken); }
}
