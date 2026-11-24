import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { AuthService } from "./auth.service";

const refreshCookieName = "opspulse_refresh";
const csrfCookieName = "XSRF-TOKEN";
const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly service: AuthService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Get("status")
  status() {
    return this.service.status();
  }

  @Post("register")
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this._writeSession(response, await this.service.register(body));
  }

  @Post("login")
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this._writeSession(response, await this.service.login(body));
  }

  @Post("refresh")
  async refresh(
    @Req() request: Request,
    @Headers("x-xsrf-token") csrfHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    this._assertCsrf(request, csrfHeader);
    try {
      return this._writeSession(
        response,
        await this.service.refresh(this._readCookie(request, refreshCookieName)),
      );
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) this._clearAuthCookies(response);
      throw error;
    }
  }

  @Post("logout")
  async logout(
    @Req() request: Request,
    @Headers("x-xsrf-token") csrfHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    this._assertCsrf(request, csrfHeader);
    const result = await this.service.logout(
      this._readCookie(request, refreshCookieName),
    );
    this._clearAuthCookies(response);
    return result;
  }

  private _writeSession(
    response: Response,
    session: { accessToken: string; refreshToken: string; expiresIn: number },
  ) {
    const secure = this.config.get<string>("NODE_ENV") === "production";
    response.cookie(refreshCookieName, session.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/auth",
      maxAge: refreshLifetimeMs,
    });
    response.cookie(csrfCookieName, randomBytes(32).toString("hex"), {
      httpOnly: false,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: refreshLifetimeMs,
    });
    return { accessToken: session.accessToken, expiresIn: session.expiresIn };
  }

  private _clearAuthCookies(response: Response): void {
    const secure = this.config.get<string>("NODE_ENV") === "production";
    response.clearCookie(refreshCookieName, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/auth",
    });
    response.clearCookie(csrfCookieName, {
      httpOnly: false,
      secure,
      sameSite: "lax",
      path: "/",
    });
  }

  private _assertCsrf(request: Request, header: string | undefined): void {
    const cookie = this._readCookie(request, csrfCookieName);
    if (
      !cookie ||
      !header ||
      !/^[a-f0-9]{64}$/i.test(cookie) ||
      !/^[a-f0-9]{64}$/i.test(header)
    ) {
      throw new ForbiddenException("CSRF token is missing or invalid");
    }

    const cookieBytes = Buffer.from(cookie, "hex");
    const headerBytes = Buffer.from(header, "hex");
    if (
      cookieBytes.length !== headerBytes.length ||
      !timingSafeEqual(cookieBytes, headerBytes)
    ) {
      throw new ForbiddenException("CSRF token is missing or invalid");
    }
  }

  private _readCookie(request: Request, name: string): string | undefined {
    const prefix = `${name}=`;
    return request.headers.cookie
      ?.split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(prefix))
      ?.slice(prefix.length);
  }
}
