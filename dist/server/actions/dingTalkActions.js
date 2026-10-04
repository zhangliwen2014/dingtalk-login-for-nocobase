/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var dingTalkActions_exports = {};
__export(dingTalkActions_exports, {
  dingTalkActions: () => dingTalkActions
});
module.exports = __toCommonJS(dingTalkActions_exports);
function getReqUrl(req) {
  var _a, _b, _c, _d;
  const proto = ((_b = (_a = req.get("X-Forwarded-Proto")) == null ? void 0 : _a.split(",")) == null ? void 0 : _b[0]) || req.protocol;
  const host = ((_d = (_c = req.get("X-Forwarded-Host")) == null ? void 0 : _c.split(",")) == null ? void 0 : _d[0]) || req.host;
  return process.env.APP_URL || `${proto}://${host}${process.env.APP_PUBLIC_PATH || "/"}`;
}
const dingTalkActions = {
  getAuthUrl: async (ctx, next) => {
    const { authenticator: authenticatorName, redirect } = ctx.action.params.values;
    if (!authenticatorName) {
      ctx.throw(400, "\u8BA4\u8BC1\u5668\u4E0D\u80FD\u4E3A\u7A7A");
    }
    const app = ctx.app;
    const auth = await app.authManager.get(authenticatorName, ctx);
    const redirectUri = `${getReqUrl(ctx.request)}api/community-ding-talk:redirectAuth?authenticator=${encodeURIComponent(authenticatorName)}&redirect=${encodeURIComponent(redirect || "")}`;
    ctx.body = auth.dingTalkApi.getLoginUrl(redirectUri);
    await next();
  },
  redirectAuth: async (ctx, next) => {
    const { authenticator: authenticatorName, redirect, code, authCode, state } = ctx.action.params;
    if (!authenticatorName) {
      ctx.throw(400, "\u8BA4\u8BC1\u5668\u4E0D\u80FD\u4E3A\u7A7A");
    }
    if (!code) {
      ctx.throw(400, "OAuth 2.0 \u4E34\u65F6\u6388\u6743\u7801\u4E0D\u5B58\u5728");
    }
    const app = ctx.app;
    const auth = await app.authManager.get(authenticatorName, ctx);
    const { user, token } = await auth.signIn();
    let rediretPath = redirect;
    if (rediretPath) {
      if (rediretPath.startsWith("/")) {
        rediretPath = rediretPath.substring(1);
      }
    } else {
      rediretPath = "";
    }
    ctx.redirect(`${(process.env.APP_PUBLIC_PATH || "/") + rediretPath}?authenticator=${encodeURIComponent(authenticatorName)}&token=${encodeURIComponent(token)}`);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dingTalkActions
});
