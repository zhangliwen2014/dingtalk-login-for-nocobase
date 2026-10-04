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
var DingTalkAuth_exports = {};
__export(DingTalkAuth_exports, {
  DingTalkAuth: () => DingTalkAuth
});
module.exports = __toCommonJS(DingTalkAuth_exports);
var import_auth = require("@nocobase/auth");
var import_dingTalkApi = require("../openapi/dingTalkApi");
class DingTalkAuth extends import_auth.BaseAuth {
  #authConfigOptions;
  #dingTalkApi;
  constructor(config) {
    var _a;
    const userCollection = config.ctx.db.getCollection("users");
    super({ ...config, userCollection });
    this.#authConfigOptions = config.options;
    this.#dingTalkApi = new import_dingTalkApi.DingTalkApi(this.#authConfigOptions.internal.appKey, this.#authConfigOptions.internal.appSecret);
    this.#authConfigOptions = {
      ...this.#authConfigOptions,
      internal: {
        userCheckType: this.#authConfigOptions.internal.userCheckType,
        emailDomains: ((_a = config.options.internal.emailDomain) == null ? void 0 : _a.split("s*,s*")) || []
      }
    };
  }
  async validate() {
    var _a, _b;
    const ctx = this.ctx;
    const { authenticator: authenticatorName, code, authCode, state } = ctx.action.params;
    if (!authenticatorName) {
      ctx.throw(400, "\u8BA4\u8BC1\u5668\u4E0D\u80FD\u4E3A\u7A7A");
    }
    if (!code) {
      ctx.throw(400, "OAuth 2.0 \u4E34\u65F6\u6388\u6743\u7801\u4E0D\u5B58\u5728");
    }
    const auth = this;
    const tokenRes = await auth.dingTalkApi.oauth2.userAccessToken("authorization_code", code);
    const userRes = await auth.dingTalkApi.contact.getUser("me", tokenRes.accessToken);
    const { userid: userId } = await auth.dingTalkApi.contact.getUserIdByUnionId(userRes.unionId);
    const authenticator = this.authenticator;
    let au = await authenticator.findUser(userId);
    if (au) {
      return au;
    }
    const userDetail = await auth.dingTalkApi.contact.getUserDetail(userId);
    const user = {
      userId,
      unionId: userRes.unionId,
      mobile: userRes.mobile,
      email: userRes.email,
      name: userDetail.name || userRes.nick,
      orgEmail: userDetail.org_email
    };
    let filter;
    if (this.#authConfigOptions.internal.userCheckType === "personalEmail") {
      if (!user.email) {
        ctx.throw(400, "\u7528\u6237\u90AE\u7BB1\u672A\u914D\u7F6E");
      }
      if (!this.#authConfigOptions.internal.emailDomains.some((a) => userDetail.email.endsWith(a))) {
        ctx.throw(400, `\u90AE\u7BB1\u57DF\u540D\u672A\u542F\u7528 ${user.email}`);
      }
      filter = {
        email: user.email
      };
    } else if (this.#authConfigOptions.internal.userCheckType === "orgEmail") {
      if (!user.orgEmail) {
        ctx.throw(400, "\u7528\u6237\u4F01\u4E1A\u90AE\u7BB1\u672A\u914D\u7F6E");
      }
      if (!this.#authConfigOptions.internal.emailDomains.some((a) => userDetail.org_email.endsWith(a))) {
        ctx.throw(400, `\u90AE\u7BB1\u57DF\u540D\u672A\u542F\u7528 ${user.orgEmail}`);
      }
      filter = {
        email: user.orgEmail
      };
    } else {
      filter = {
        phone: user.mobile
      };
    }
    let ncUser = await this.userRepository.findOne({ filter });
    if (ncUser) {
      await this.authenticator.addUser(ncUser, {
        through: {
          uuid: userId
        }
      });
      return await authenticator.findUser(userId);
    }
    if (this.#authConfigOptions.public.autoSignup) {
      return await authenticator.findOrCreateUser(userId, {
        nickname: user.name,
        username: ((_b = (_a = filter.email) == null ? void 0 : _a.split("@")) == null ? void 0 : _b[0]) || user.mobile || userId,
        email: filter.email,
        phone: user.mobile,
        meta: JSON.stringify(user)
      });
    }
    return null;
  }
  get dingTalkApi() {
    return this.#dingTalkApi;
  }
  get authConfigOptions() {
    return this.#authConfigOptions;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DingTalkAuth
});
