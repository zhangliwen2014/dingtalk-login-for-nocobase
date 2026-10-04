import { Plugin } from '@nocobase/client';
export declare class NocobasePluginDingTalkClient extends Plugin {
    afterAdd(): Promise<void>;
    beforeLoad(): Promise<void>;
    load(): Promise<void>;
}
export default NocobasePluginDingTalkClient;
