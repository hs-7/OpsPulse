import { ForbiddenException } from "@nestjs/common";
import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "../src/modules/auth/auth.controller";
import { AuthService } from "../src/modules/auth/auth.service";

describe("AuthController cookie sessions", () => {
  const refreshToken = "a".repeat(96);
  const csrfToken = "b".repeat(64);
  const session = {
    accessToken: "short-lived-access-token",
    refreshToken,
    expiresIn: 900,
  };
  let nodeEnv = "development";
  const service = {
    login: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  };
  const config = { get: vi.fn(() => nodeEnv) };
  const response = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
  const makeRequest = (csrfCookie = csrfToken): Request =>
    ({
      headers: {
        cookie: `opspulse_refresh=${refreshToken}; XSRF-TOKEN=${csrfCookie}`,
      },
    }) as Request;
  let controller: AuthController;

  beforeEach(() => {
    vi.clearAllMocks();
    nodeEnv = "development";
    service.login.mockResolvedValue(session);
    service.register.mockResolvedValue(session);
    service.refresh.mockResolvedValue(session);
    service.logout.mockResolvedValue({ loggedOut: true });
    controller = new AuthController(
      service as unknown as AuthService,
      config as never,
    );
  });

  it("sets an HttpOnly refresh cookie and returns only the access token", async () => {
    const result = await controller.login({}, response);

    expect(result).toEqual({
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
    });
    expect(response.cookie).toHaveBeenCalledWith(
      "opspulse_refresh",
      refreshToken,
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/auth",
      }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      "XSRF-TOKEN",
      expect.any(String),
      expect.objectContaining({ httpOnly: false, path: "/" }),
    );
  });

  it("marks auth cookies Secure in production", async () => {
    nodeEnv = "production";

    await controller.login({}, response);

    expect(response.cookie).toHaveBeenCalledWith(
      "opspulse_refresh",
      refreshToken,
      expect.objectContaining({ secure: true }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      "XSRF-TOKEN",
      expect.any(String),
      expect.objectContaining({ secure: true }),
    );
  });

  it("requires a matching XSRF cookie/header pair before rotating", async () => {
    await expect(
      controller.refresh(makeRequest(), "c".repeat(64), response),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.refresh).not.toHaveBeenCalled();

    const result = await controller.refresh(makeRequest(), csrfToken, response);
    expect(service.refresh).toHaveBeenCalledWith(refreshToken);
    expect(result).toEqual({
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
    });
  });

  it("revokes the cookie-backed session family and clears both cookies on logout", async () => {
    const result = await controller.logout(makeRequest(), csrfToken, response);

    expect(service.logout).toHaveBeenCalledWith(refreshToken);
    expect(result).toEqual({ loggedOut: true });
    expect(response.clearCookie).toHaveBeenCalledWith(
      "opspulse_refresh",
      expect.objectContaining({ httpOnly: true, path: "/auth" }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      "XSRF-TOKEN",
      expect.objectContaining({ httpOnly: false, path: "/" }),
    );
  });
});
