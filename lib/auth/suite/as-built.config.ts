/**
 * as_built-specific auth configuration for the baryapps suite.
 *
 * This file is the ONLY place where as_built-specific auth settings
 * are defined. All other auth modules are generic and reusable.
 *
 * To create a new baryapps app, copy this file and adjust the values.
 */

import { configureSuiteAuth } from "./config";

export function initAsBuiltAuth() {
  return configureSuiteAuth({
    appName: "as_built",
    loginRoute: "/login",
    homeRoute: "/",
    publicRoutes: ["/login", "/api/auth", "/docs", "/cli-auth"],
    sessionCookieName: "__session",
    sessionMaxAge: 60 * 60 * 24 * 7, // 7 days
    emailPasswordEnabled: true,
    createUserDocument: true,
    usersCollection: "users",
    oauthProviders: [
      {
        name: "github",
        initiateRoute: "/api/auth/github",
        callbackRoute: "/api/auth/github/callback",
        disconnectRoute: "/api/auth/github/disconnect",
        scopes: ["repo", "read:user"],
      },
    ],
  });
}
