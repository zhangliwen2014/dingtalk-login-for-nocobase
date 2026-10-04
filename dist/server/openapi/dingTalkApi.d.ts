export type Res<T> = {
    /** 请求ID。 */
    request_id: string;
    /** 返回码。 */
    errcode: number;
    /** 返回码描述。 */
    errmsg: string;
    /** 返回结果。 */
    result: T;
};
export type UserAccessTokenRes = {
    /** 生成的accessToken */
    accessToken?: string;
    /** 生成的refresh_token。可以使用此刷新token，定期的获取用户的accessToken */
    refreshToken?: string;
    /** 超时时间，单位秒。 */
    expireIn?: number;
    /** 所选企业corpId。 */
    corpId?: string;
};
export type UserRes = {
    /** 用户的钉钉昵称。 */
    nick?: string;
    /** 头像URL。 */
    avatarUrl?: string;
    /** 用户的手机号。如果要获取用户手机号，需要在钉钉开发者后台申请个人手机号信息权限 */
    mobile?: string;
    /** 用户的openId。 */
    openId?: string;
    /** 用户的unionId。 */
    unionId?: string;
    /** 用户的个人邮箱。 */
    email?: string;
    /** 手机号对应的国家号。 */
    stateCode?: string;
};
export type UserDetail = {
    /** 员工的userId。 */
    userid: string;
    /** 员工姓名。 */
    name: string;
    /** 员工邮箱。 */
    email?: string;
    /** 员工的企业邮箱。如果员工的企业邮箱没有开通，返回信息中不包含该数据。第三方企业应用不返回该参数。 */
    org_email?: string;
};
export type UserId = {
    /** 联系类型： 0：企业内部员工 1：企业外部联系人 */
    contact_type?: number;
    /** 用户的userid。 */
    userid: string;
};
export declare function checkResult<T>(res: Res<T>): T;
/**
 * 钉钉 API
 */
export declare class DingTalkApi {
    #private;
    constructor(appKey: string, appSecret: string);
    get oauth2(): {
        /**
         * 获取用户token
         * @param grantType 如果使用授权码换token，传authorization_code。如果使用刷新token换用户token，传refresh_token。
         * @param code OAuth 2.0 临时授权码，第三方企业应用需要接入统一授权套件/获取登录用户的访问凭证，获取临时授权码authCode。
         * @param refreshToken OAuth2.0刷新令牌，从返回结果里面获取。过期时间是30天。
         * @returns
         */
        userAccessToken(grantType: "authorization_code" | "refresh_token", code?: string, refreshToken?: string): Promise<UserAccessTokenRes>;
    };
    get contact(): {
        /**
         * 获取用户token
         * @param unionId 用户的unionId。如需获取当前授权人的信息，unionId参数可以传me。
         * @returns
         */
        getUser(unionId: string, accessToken: string): Promise<UserRes>;
        /**
         * 免登码换身份（钉钉客户端内 H5 微应用免登）
         * @param code dd.runtime.permission.requestAuthCode 取得的免登授权码，5 分钟内有效且只能使用一次。
         * @returns { userid, name, sys_level, usr_ident, device_id, is_sys_admin }
         */
        getUserByAuthCode(code: string): Promise<{
            userid: string;
            name: string;
            sys_level?: number;
            is_sys_admin?: boolean;
            usr_ident?: string;
            device_id?: string;
        }>;
        /**
         * 根据手机号查询用户ID
         * @param mobile 用户的手机号。
         * @returns 员工的userId。
         */
        getUserIdByMobile(mobile: string): Promise<UserId>;
        /**
         * 根据手机号查询用户ID
         * @param unionid 员工在当前开发者企业账号范围内的唯一标识
         * @returns 员工的userId。
         */
        getUserIdByUnionId(unionid: string): Promise<UserId>;
        /**
         * 查询用户详情
         * @param userid 用户的userId。
         * @returns 员工的userId。
         */
        getUserDetail(userid: string): Promise<UserDetail>;
    };
    getLoginUrl(redirectUri: string): string;
    getAccessToken(): Promise<string>;
    doRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, params?: any, body?: any, headers?: any): Promise<T>;
}
