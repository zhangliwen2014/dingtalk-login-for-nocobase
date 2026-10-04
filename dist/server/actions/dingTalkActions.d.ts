import { Context, Next } from '@nocobase/actions';
export declare const dingTalkActions: {
    getAuthUrl: (ctx: Context, next: Next) => Promise<void>;
    redirectAuth: (ctx: Context, next: Next) => Promise<void>;
};
