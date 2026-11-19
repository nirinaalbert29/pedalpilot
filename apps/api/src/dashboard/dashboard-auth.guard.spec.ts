import { afterEach, describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { DashboardAuthGuard } from './dashboard-auth.guard.js';

const originalToken = process.env.DASHBOARD_API_TOKEN;

function context(authorization?: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}

afterEach(() => {
  if (originalToken === undefined) delete process.env.DASHBOARD_API_TOKEN;
  else process.env.DASHBOARD_API_TOKEN = originalToken;
});

describe('DashboardAuthGuard', () => {
  it('refuse l’accès lorsque le jeton serveur n’est pas configuré', () => {
    delete process.env.DASHBOARD_API_TOKEN;
    expect(() => new DashboardAuthGuard().canActivate(context('Bearer anything'))).toThrow();
  });

  it('accepte le jeton Bearer configuré', () => {
    process.env.DASHBOARD_API_TOKEN = 'dashboard-secret-token';
    expect(new DashboardAuthGuard().canActivate(context('Bearer dashboard-secret-token'))).toBe(true);
  });

  it('refuse un jeton invalide', () => {
    process.env.DASHBOARD_API_TOKEN = 'dashboard-secret-token';
    expect(() => new DashboardAuthGuard().canActivate(context('Bearer wrong-token'))).toThrow();
  });
});
