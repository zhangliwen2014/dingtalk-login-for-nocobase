/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

(function(e,t){typeof exports=="object"&&typeof module!="undefined"?t(exports,require("@nocobase/client"),require("@nocobase/plugin-auth/client"),require("react/jsx-runtime"),require("react"),require("antd"),require("@ant-design/icons")):typeof define=="function"&&define.amd?define(["exports","@nocobase/client","@nocobase/plugin-auth/client","react/jsx-runtime","react","antd","@ant-design/icons"],t):(e=typeof globalThis!="undefined"?globalThis:e||self,t(e["nocobase-plugin-ding-talk"]={},e["@nocobase/client"],e["@nocobase/plugin-auth"],e.jsxRuntime,e.react,e.antd,e["@ant-design/icons"]))})(this,function(e,t,o,r,u,l,d){"use strict";
// ==== 本文件为 dist 手工维护版本（见仓库 PATCHES.md）：新增钉钉客户端内免登，保留原扫码登录 ====
var JSAPI_SRC = "https://g.alicdn.com/dingding/dingtalk-jsapi/3.1.0/dingtalk.open.js";
var PENDING_KEY = "nocobase-dingtalk-pending";
var jsapiLoading;
function loadJsApi(){
  if(typeof window==="undefined"||typeof document==="undefined")return Promise.reject(new Error("no browser"));
  if(window.dd&&window.dd.env)return Promise.resolve(window.dd);
  if(!jsapiLoading){
    jsapiLoading=new Promise(function(resolve,reject){
      var s=document.createElement("script");
      s.src=JSAPI_SRC;
      s.async=true;
      s.onload=function(){resolve(window.dd);};
      s.onerror=function(){jsapiLoading=null;reject(new Error("钉钉 JSAPI 加载失败"));};
      document.head.appendChild(s);
    });
  }
  return jsapiLoading;
}
function inDingTalk(dd){
  return !!(dd&&dd.env&&dd.env.platform&&dd.env.platform!=="notInDingTalk");
}
function requestAuthCode(dd,corpId){
  return new Promise(function(resolve,reject){
    var onOk=function(res){resolve(res&&(res.code||res.authCode));};
    var onFail=function(err){reject(typeof err==="object"?new Error(JSON.stringify(err)):err);};
    var run=function(){
      if(dd.runtime&&dd.runtime.permission&&dd.runtime.permission.requestAuthCode){
        dd.runtime.permission.requestAuthCode({corpId:corpId,onSuccess:onOk,onFail:onFail});
      }else if(dd.getAuthCode){
        dd.getAuthCode({corpId:corpId,onSuccess:onOk,onFail:onFail});
      }else{
        onFail(new Error("当前钉钉容器不提供免登 JSAPI"));
      }
    };
    if(dd.ready)dd.ready(run);else run();
  });
}
function pickTokenFromUrl(app){
  // 扫码登录回跳：redirectAuth 把 token 放在 URL 上。NocoBase 2.x 客户端不会读 URL 里的 token，
  // 所以这里取回来写进 auth，再把参数抹掉并重新加载。只接受本标签页自己发起的那次回跳。
  if(typeof window==="undefined")return false;
  var usp=new URLSearchParams(window.location.search);
  var token=usp.get("token");
  var authenticator=usp.get("authenticator");
  if(!token||!authenticator)return false;
  if(sessionStorage.getItem(PENDING_KEY)!==authenticator)return false;
  sessionStorage.removeItem(PENDING_KEY);
  usp.delete("token");
  usp.delete("authenticator");
  var query=usp.toString();
  var clean=window.location.pathname+(query?"?"+query:"")+window.location.hash;
  app.auth.setAuthenticator(authenticator);
  app.auth.setToken(token);
  window.history.replaceState({}, "", clean);
  window.location.reload();
  return true;
}
var makeSignInButton=function(app){
  return function(props){
    var authenticator=props.authenticator;
    var st=u.useState(false), loading=st[0], setLoading=st[1];
    var resource=t.useResource("community-ding-talk");
    var scanLogin=function(){
      return resource.getAuthUrl({values:{authenticator:authenticator.name,redirect:new URLSearchParams(location.search?location.search.substring(1):"").get("redirect")||""}}).then(function(m){
        var url=m&&m.data&&m.data.data;
        if(typeof url!=="string"||url.indexOf("https://login.dingtalk.com/")!==0)throw new Error("getAuthUrl 返回异常");
        sessionStorage.setItem(PENDING_KEY,authenticator.name);
        location.href=url;
      });
    };
    var freeLogin=function(){
      // 先用 UA 判断，避免在非钉钉环境里白拉一次 JSAPI
      if(!/DingTalk/i.test(navigator.userAgent||""))return Promise.reject(new Error("不在钉钉客户端内"));
      return resource.getFreeLoginConfig({values:{authenticator:authenticator.name}}).then(function(m){
        var corpId=m&&m.data&&m.data.data&&m.data.data.corpId;
        if(!corpId)throw new Error("未配置企业 CorpId");
        return loadJsApi().then(function(dd){
          if(!inDingTalk(dd))throw new Error("不在钉钉客户端内");
          return requestAuthCode(dd,corpId);
        });
      }).then(function(authCode){
        if(!authCode)throw new Error("免登授权码为空");
        return resource.freeLogin({values:{authenticator:authenticator.name,authCode:authCode}});
      }).then(function(res){
        var data=res&&res.data&&res.data.data;
        if(!data||!data.token)throw new Error("免登未返回 token");
        app.auth.setAuthenticator(data.authenticator||authenticator.name);
        app.auth.setToken(data.token);
        window.location.reload();
      });
    };
    var onClick=function(){
      setLoading(true);
      return freeLogin().catch(function(err){
        console.error("[ding-talk] 免登失败，回退扫码登录：",err);
        return scanLogin().catch(function(err2){
          setLoading(false);
          var msg=(err2&&err2.message)||(err&&err.message)||"钉钉登录失败";
          if(l.message&&l.message.error)l.message.error(msg);else console.error("[ding-talk] "+msg);
        });
      });
    };
    return r.jsx(l.Button,{loading:loading,disabled:loading,icon:r.jsx(d.DingtalkOutlined,{}),style:{width:"100%"},onClick:onClick,children:authenticator.title||authenticator.name});
  };
};
var AdminSettingsForm=function(props){
  console.log("aaa",props);
  return r.jsx(t.SchemaComponent,{schema:{type:"object",properties:{communityDingTalkAuth:{type:"void",properties:{public:{type:"object",properties:{autoSignup:{"x-decorator":"FormItem",type:"boolean",title:"用户不存在时自动注册",required:!1,"x-component":"Checkbox"}}},internal:{type:"object",properties:{userCheckType:{"x-decorator":"FormItem",type:"string",title:"用户验证方式",required:!0,"x-component":"Select","x-component-props":{options:[{value:"orgEmail",label:"企业邮箱"},{value:"personalEmail",label:"个人邮箱"},{value:"mobile",label:"手机号"}]}},emailDomain:{"x-decorator":"FormItem",type:"string",title:"邮箱域名，多个使用英文逗号分隔",required:!0,"x-component":"Input"},corpId:{"x-decorator":"FormItem",type:"string",title:"企业 CorpId（钉钉客户端内免登必填）",required:!1,"x-component":"Input","x-component-props":{placeholder:"ding 开头，钉钉开放平台应用基本信息里查看"}},appKey:{"x-decorator":"FormItem",type:"string",title:"应用ID",required:!0,"x-component":"Input"},appSecret:{"x-decorator":"FormItem",type:"string",title:"应用秘钥",required:!0,"x-component":"Password"}}}}}}}});
};
class i extends t.Plugin{afterAdd(){return Promise.resolve()}beforeLoad(){return Promise.resolve()}load(){return Promise.resolve().then(()=>{pickTokenFromUrl(this.app);this.app.pm.get(o).registerType("community-ding-talk-auth",{components:{SignInButton:makeSignInButton(this.app),AdminSettingsForm}})})}}
e.NocobasePluginDingTalkClient=i;e.default=i;Object.defineProperties(e,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}})});
