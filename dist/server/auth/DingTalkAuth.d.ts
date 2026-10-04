import { BaseAuth, AuthConfig } from '@nocobase/auth';
import { DingTalkApi } from '../openapi/dingTalkApi';
export type AuthConfigOptions = {
    public: {
        autoSignup: boolean;
    };
    internal: {
        userCheckType: 'orgEmail' | 'personalEmail' | 'mobile';
        emailDomains: string[];
        appKey?: string;
        appSecret?: string;
    };
};
export declare class DingTalkAuth extends BaseAuth {
    #private;
    constructor(config: AuthConfig);
    validate(): Promise<import("@nocobase/database").Model<any, any>>;
    get dingTalkApi(): DingTalkApi;
    get authConfigOptions(): AuthConfigOptions;
}
