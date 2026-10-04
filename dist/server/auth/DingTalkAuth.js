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
        corpId: this.#authConfigOptions.internal.corpId,
        emailDomains: ((_a = config.options.internal.emailDomain) == null ? void 0 : _a.split(/\s*,\s*/)) || []
      }
    };
  }
  #credentialParams() {
    const params = this.ctx.action.params;
    const values = params.values || {};
    return {
      authenticatorName: params.authenticator ?? values.authenticator,
      code: params.code ?? values.code,
      authCode: params.authCode ?? values.authCode
    };
  }
  /**
   * 取得钉钉侧身份，两条路径共用同一个钉钉 userid 作为 usersAuthenticators.uuid：
   * 免登（钉钉客户端内）authCode -> getuserinfo -> userid；扫码（浏览器）code -> 用户 token -> unionId -> userid。
   */
  async #resolveDingUser() {
    const ctx = this.ctx;
    const { code, authCode } = this.#credentialParams();
    if (authCode) {
      const info = await this.dingTalkApi.contact.getUserByAuthCode(authCode);
      const detail = await this.dingTalkApi.contact.getUserDetail(info.userid);
      return {
        userId: info.userid,
        unionId: detail.unionid,
        mobile: detail.mobile,
        email: detail.email,
        name: detail.name || info.name,
        orgEmail: detail.org_email
      };
    }
    if (!code) {
      ctx.throw(400, "OAuth 2.0 \u4E34\u65F6\u6388\u6743\u7801\u4E0D\u5B58\u5728");
    }
    const tokenRes = await this.dingTalkApi.oauth2.userAccessToken("authorization_code", code);
    const userRes = await this.dingTalkApi.contact.getUser("me", tokenRes.accessToken);
    const { userid: userId } = await this.dingTalkApi.contact.getUserIdByUnionId(userRes.unionId);
    const userDetail = await this.dingTalkApi.contact.getUserDetail(userId);
    return {
      userId,
      unionId: userRes.unionId,
      mobile: userRes.mobile,
      email: userRes.email,
      name: userDetail.name || userRes.nick,
      orgEmail: userDetail.org_email
    };
  }
  async validate() {
    var _a;
    const ctx = this.ctx;
    const { authenticatorName } = this.#credentialParams();
    if (!authenticatorName) {
      ctx.throw(400, "\u8BA4\u8BC1\u5668\u4E0D\u80FD\u4E3A\u7A7A");
    }
    const user = await this.#resolveDingUser();
    const authenticator = this.authenticator;
    let au = await authenticator.findUser(user.userId);
    if (au) {
      return au;
    }
    const options = this.#authConfigOptions.internal;
    const emailDomains = options.emailDomains;
    let filter;
    if (options.userCheckType === "personalEmail") {
      if (!user.email) {
        ctx.throw(400, "\u7528\u6237\u90AE\u7BB1\u672A\u914D\u7F6E");
      }
      if (!emailDomains.some((a) => user.email.endsWith(a))) {
        ctx.throw(400, `\u90AE\u7BB1\u57DF\u540D\u672A\u542F\u7528 ${user.email}`);
      }
      filter = {
        email: user.email
      };
    } else if (options.userCheckType === "orgEmail") {
      if (!user.orgEmail) {
        ctx.throw(400, "\u7528\u6237\u4F01\u4E1A\u90AE\u7BB1\u672A\u914D\u7F6E");
      }
      if (!emailDomains.some((a) => user.orgEmail.endsWith(a))) {
        ctx.throw(400, `\u90AE\u7BB1\u57DF\u540D\u672A\u542F\u7528 ${user.orgEmail}`);
      }
      filter = {
        email: user.orgEmail
      };
    } else {
      if (!user.mobile) {
        ctx.throw(400, "\u9489\u9489\u672A\u8FD4\u56DE\u624B\u673A\u53F7\uFF0C\u8BF7\u4E3A\u5E94\u7528\u5F00\u901A\u300C\u4E2A\u4EBA\u624B\u673A\u53F7\u4FE1\u606F\u300D\u6743\u9650\uFF0C\u6216\u6539\u7528\u90AE\u7BB1\u5339\u914D");
      }
      filter = {
        phone: user.mobile
      };
    }
    let ncUser = await this.userRepository.findOne({ filter });
    if (ncUser) {
      await this.authenticator.addUser(ncUser, {
        through: {
          uuid: user.userId
        }
      });
      return await authenticator.findUser(user.userId);
    }
    if (this.#authConfigOptions.public.autoSignup) {
      return await authenticator.findOrCreateUser(user.userId, {
        nickname: user.name,
        username: ((_a = filter.email) == null ? void 0 : _a.split("@"))?.[0] || user.mobile || user.userId,
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
  get corpId() {
    return this.#authConfigOptions.internal.corpId;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DingTalkAuth
});
