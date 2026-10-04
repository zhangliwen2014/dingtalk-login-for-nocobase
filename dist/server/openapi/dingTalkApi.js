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
var dingTalkApi_exports = {};
__export(dingTalkApi_exports, {
  DingTalkApi: () => DingTalkApi,
  checkResult: () => checkResult
});
module.exports = __toCommonJS(dingTalkApi_exports);
function checkResult(res) {
  if (res.errcode !== 0) {
    throw new Error(JSON.stringify(res));
  }
  return res.result;
}
class DingTalkApi {
  /**
   * 获取凭证
   */
  #oauth2 = /* @__PURE__ */ ((api) => {
    const baseUrl = "https://api.dingtalk.com";
    return {
      /**
       * 获取用户token
       * @param grantType 如果使用授权码换token，传authorization_code。如果使用刷新token换用户token，传refresh_token。
       * @param code OAuth 2.0 临时授权码，第三方企业应用需要接入统一授权套件/获取登录用户的访问凭证，获取临时授权码authCode。
       * @param refreshToken OAuth2.0刷新令牌，从返回结果里面获取。过期时间是30天。
       * @returns
       */
      async userAccessToken(grantType, code, refreshToken) {
        return api.doRequest("POST", `${baseUrl}/v1.0/oauth2/userAccessToken`, null, {
          clientId: api.#appKey,
          clientSecret: api.#appSecret,
          code,
          refreshToken,
          grantType
        });
      }
    };
  })(this);
  /**
   * 通讯录
   */
  #contact = /* @__PURE__ */ ((api) => {
    const baseUrl = "https://api.dingtalk.com";
    return {
      /**
       * 获取用户token
       * @param unionId 用户的unionId。如需获取当前授权人的信息，unionId参数可以传me。
       * @returns
       */
      async getUser(unionId, accessToken) {
        return api.doRequest("GET", `${baseUrl}/v1.0/contact/users/${unionId}`, void 0, void 0, {
          "x-acs-dingtalk-access-token": accessToken
        });
      },
      /**
       * 根据手机号查询用户ID
       * @param mobile 用户的手机号。
       * @returns 员工的userId。
       */
      async getUserIdByMobile(mobile) {
        return checkResult(await api.doRequest("POST", `https://oapi.dingtalk.com/topapi/v2/user/getbymobile`, {
          access_token: await api.getAccessToken()
        }, {
          mobile
        }));
      },
      /**
       * 根据手机号查询用户ID
       * @param unionid 员工在当前开发者企业账号范围内的唯一标识
       * @returns 员工的userId。
       */
      async getUserIdByUnionId(unionid) {
        return checkResult(await api.doRequest("POST", `https://oapi.dingtalk.com/topapi/user/getbyunionid`, {
          access_token: await api.getAccessToken()
        }, {
          unionid
        }));
      },
      /**
       * 查询用户详情
       * @param userid 用户的userId。
       * @returns 员工的userId。
       */
      async getUserDetail(userid) {
        return checkResult(await api.doRequest("POST", `https://oapi.dingtalk.com/topapi/v2/user/get`, {
          access_token: await api.getAccessToken()
        }, {
          userid
        }));
      }
    };
  })(this);
  #appKey;
  #appSecret;
  #accessToken;
  #nextGetAccessTokenTime;
  constructor(appKey, appSecret) {
    this.#appKey = appKey;
    this.#appSecret = appSecret;
  }
  get oauth2() {
    return this.#oauth2;
  }
  get contact() {
    return this.#contact;
  }
  getLoginUrl(redirectUri) {
    return `https://login.dingtalk.com/oauth2/auth?redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&client_id=${this.#appKey}&scope=openid&state=${(/* @__PURE__ */ new Date()).getTime()}&prompt=consent`;
  }
  async getAccessToken() {
    if (!this.#accessToken || this.#nextGetAccessTokenTime < (/* @__PURE__ */ new Date()).getTime()) {
      const data = await this.doRequest("POST", "https://api.dingtalk.com/v1.0/oauth2/accessToken", null, {
        appKey: this.#appKey,
        appSecret: this.#appSecret
      });
      this.#nextGetAccessTokenTime = (/* @__PURE__ */ new Date()).getTime() + data.expireIn * 1e3 - 1e5;
      this.#accessToken = data.accessToken;
    }
    return this.#accessToken;
  }
  async doRequest(method, path, params, body, headers) {
    const url = `${path}${params ? "?" + toQueryString(params) : ""}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers || {}
      },
      body: body ? JSON.stringify(body) : void 0
    });
    const r = {
      method,
      url,
      headers,
      params,
      body
    };
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text();
      console.error("fetch dingTalk api error: ", r, text);
      throw new Error(text);
    }
    return await res.json();
  }
}
function toQueryString(params) {
  return Object.keys(params).map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(params[key])).join("&");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DingTalkApi,
  checkResult
});
