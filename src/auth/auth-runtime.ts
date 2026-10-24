// Web. Microsoft login is not implemented in the browser, so no
// token is ever requested or stored here. On Android and iOS, Metro uses
// auth-runtime.native.ts instead, which must export the same function.
import { AuthController } from './auth-controller';

let controller: AuthController | null = null;

export function getAuthController(): AuthController {
  controller ??= AuthController.unavailable('web');
  return controller;
}
