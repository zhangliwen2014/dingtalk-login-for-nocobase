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
var CORPID_KEY = "nocobase-dingtalk-corpid";
// load() 在应用启动路径上执行，sessionStorage 一旦抛异常会把整个 SPA 带崩，所以全部包住
function ssGet(k){try{return sessionStorage.getItem(k);}catch(e){return null;}}
function ssSet(k,v){try{sessionStorage.setItem(k,v);}catch(e){}}
function ssDel(k){try{sessionStorage.removeItem(k);}catch(e){}}
var jsapiLoading;
function grabDd(){
  if(window.dd&&typeof window.dd==="object")return window.dd;
  var ex=window.exports; // UMD 万一走了 exports 分支也别白丢
  if(ex&&ex.dd)return ex.dd;
  return null;
}
function viaRequireJs(){
  // 必须让 requirejs 自己注入脚本：匿名 define 只有和「当前正在加载的 script」配对才能被解析出来
  return new Promise(function(resolve,reject){
    var done=false;
    var timer=setTimeout(function(){if(done)return;done=true;reject(new Error("requirejs 加载 JSAPI 超时"));},10000);
    var fail=function(e){if(done)return;done=true;clearTimeout(timer);reject(new Error("requirejs:"+String((e&&(e.message||e.requireType))||e).slice(0,120)));};
    try{
      window.requirejs([JSAPI_SRC],function(m){
        if(done)return;done=true;clearTimeout(timer);
        var dd=m||grabDd();
        if(dd)resolve(dd);else reject(new Error("requirejs 返回的模块为空"));
      },fail);
    }catch(e){fail(e);}
  });
}
function loadJsApi(){
  if(typeof window==="undefined"||typeof document==="undefined")return Promise.reject(new Error("no browser"));
  var have=grabDd();
  if(have&&have.env)return Promise.resolve(have);
  // NocoBase 的 PluginManager.initRequireJs() 会设 window.define = requirejs.define（见 SPA 的
  // p__index.*.async.js），而 CDN 上的 dingtalk.open.js 是 UMD：它优先走 define([],factory)，
  // 于是自己 <script src> 注入时 onload 成功却没有 window.dd（2026-10-04 21:46 实测 dbg=jsapi|…）。
  if(typeof window.requirejs==="function"){jsapiLoading=viaRequireJs();return jsapiLoading;}
  if(!jsapiLoading){
    jsapiLoading=new Promise(function(resolve,reject){
      var s=document.createElement("script");
      s.src=JSAPI_SRC;
      s.async=true;
      s.onload=function(){
        var dd=grabDd();
        if(dd)return resolve(dd);
        // 走到这里说明 define 被页面的 AMD 加载器接管了；它可能稍后才挂上 requirejs
        if(typeof window.requirejs==="function")return resolve(viaRequireJs());
        reject(new Error("JSAPI 已加载但没有 window.dd"));
      };
      s.onerror=function(){jsapiLoading=null;reject(new Error("钉钉 JSAPI 加载失败"));};
      document.head.appendChild(s);
    });
  }
  // 弱网下 script 可能既不 onload 也不 onerror，没有超时的话按钮会一直转圈，连回退都不会发生
  return new Promise(function(resolve,reject){
    var done=false;
    var timer=setTimeout(function(){if(done)return;done=true;reject(new Error("钉钉 JSAPI 加载超时"));},8000);
    var p=jsapiLoading;
    p.then(function(v){if(done)return;done=true;clearTimeout(timer);resolve(v);},function(e){if(done)return;done=true;clearTimeout(timer);reject(e);});
  });
}
function mkErr(stage,msg){var e=new Error(String(msg==null?stage:msg).slice(0,300));e.stage=stage;return e;}
function requestAuthCode(dd,corpId){
  dd=dd||{};
  // 新版钉钉微应用容器（入口 URL 带 dd_debug_unifiedAppId）只提供 3.x 的 dd.getAuthCode，
  // 老容器只有 dd.runtime.permission.requestAuthCode，所以两个都试；容器不回调时靠超时往下走。
  var list=[];
  if(typeof dd.getAuthCode==="function")list.push({name:"getAuthCode",run:function(o){return dd.getAuthCode(o);}});
  if(dd.runtime&&dd.runtime.permission&&typeof dd.runtime.permission.requestAuthCode==="function"){
    list.push({name:"requestAuthCode",run:function(o){var call=function(){dd.runtime.permission.requestAuthCode(o);};if(dd.ready)dd.ready(call);else call();}});
  }
  var envOf=function(){return (dd&&dd.env&&dd.env.platform)||"?";};
  if(!list.length)return Promise.reject(mkErr("authcode","容器未提供免登接口 env="+envOf()));
  function once(item){
    return new Promise(function(resolve,reject){
      var done=false;
      var timer=setTimeout(function(){if(done)return;done=true;reject(new Error("无响应"));},6000);
      var finish=function(f,v){if(done)return;done=true;clearTimeout(timer);f(v);};
      var o={corpId:corpId,onSuccess:function(res){finish(resolve,res&&(res.code||res.authCode));},onFail:function(err){finish(reject,mkErr(item.name,typeof err==="string"?err:safe(err)));}};
      try{
        var p=item.run(o);
        if(p&&typeof p.then==="function")p.then(function(res){finish(resolve,res&&(res.code||res.authCode));},function(err){finish(reject,mkErr(item.name,typeof err==="string"?err:safe(err)));});
      }catch(e){finish(reject,mkErr(item.name,(e&&e.message)||e));}
    });
  }
  function attempt(i,reasons){
    if(i>=list.length)return Promise.reject(mkErr("authcode",reasons.join(" ; ")+" env="+envOf()));
    var item=list[i];
    return once(item).then(function(code){
      if(code)return code;
      return attempt(i+1,reasons.concat(item.name+":空返回"));
    }).catch(function(e){
      return attempt(i+1,reasons.concat(item.name+":"+((e&&e.message)||e)));
    });
  }
  return attempt(0,[]);
}
function safe(v){try{return JSON.stringify(v);}catch(e){return String(v);}}
function serverMsg(e){
  var d=e&&e.response&&e.response.data;
  var first=d&&d.errors&&d.errors[0];
  return String((first&&(first.message||first.code))||(d&&d.error)||(e&&e.message)||safe(e)).slice(0,300);
}
function dbgOf(err){
  // 失败原因要出现在 nginx 的 request 行里（客户端 console 拿不到），所以只留 ASCII 并压平
  var msg=String((err&&err.message)||safe(err)||"?").replace(/[^ -~]/g,"?")
    // 服务端个别报错会带上邮箱/手机号，而这些分支本身才是线索，不能把个人标识一起写进访问日志
    .replace(/[\w.+-]+@[\w.-]+/g,"[mail]").replace(/\d{7,}/g,"[num]")
    .replace(/[(){}<>&;'",]/g," ").slice(0,140);
  return ((err&&err.stage)||"?")+"|"+msg;
}
function pickTokenFromUrl(app){
  // 扫码登录回跳：redirectAuth 把 token 放在 URL 上。NocoBase 2.x 客户端不会读 URL 里的 token，
  // 所以这里取回来写进 auth，再把参数抹掉并重新加载。只接受本标签页自己发起的那次回跳。
  if(typeof window==="undefined")return false;
  var usp=new URLSearchParams(window.location.search);
  var token=usp.get("token");
  var authenticator=usp.get("authenticator");
  if(!token||!authenticator)return false;
  if(ssGet(PENDING_KEY)!==authenticator)return false;
  ssDel(PENDING_KEY);
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
    var scanLogin=function(dbg){
      var params={values:{authenticator:authenticator.name,redirect:new URLSearchParams(location.search?location.search.substring(1):"").get("redirect")||""}};
      // 免登为什么失败只能靠这一行日志回传（nginx 记录 request 行，不含 POST body）
      if(dbg)params.dbg=dbg;
      return resource.getAuthUrl(params).then(function(m){
        var url=m&&m.data&&m.data.data;
        if(typeof url!=="string"||url.indexOf("https://login.dingtalk.com/")!==0)throw new Error("getAuthUrl 返回异常");
        ssSet(PENDING_KEY,authenticator.name);
        location.href=url;
      });
    };
    var freeLogin=function(){
      // 先用 UA 判断，避免在非钉钉环境里白拉一次 JSAPI
      if(!/DingTalk/i.test(navigator.userAgent||""))return Promise.reject(mkErr("ua","不在钉钉客户端内"));
      // corpId 两个来源，优先容器注入的那个：钉钉应用首页地址写成 …?corpId=$CORPID$ 时，
      // 从工作台打开会被容器替换成真实 CorpId，无需在后台手抄
      var fromUrl=ssGet(CORPID_KEY);
      var corpIdOf=function(){
        if(fromUrl)return Promise.resolve(fromUrl);
        return resource.getFreeLoginConfig({values:{authenticator:authenticator.name}}).then(function(m){
          var d=m&&m.data&&m.data.data;
          return d&&d.corpId;
        },function(e){throw mkErr("corpIdReq",serverMsg(e));});
      };
      return corpIdOf().then(function(corpId){
        if(!corpId)throw mkErr("corpId","拿不到企业 CorpId：请在钉钉应用首页地址加 ?corpId=$CORPID$，或在认证器配置里填「企业 CorpId」");
        return loadJsApi().then(function(dd){
          return requestAuthCode(dd,corpId);
        },function(e){throw mkErr("jsapi",(e&&e.message)||e);});
      }).then(function(authCode){
        if(!authCode)throw mkErr("authcode","免登授权码为空");
        return resource.freeLogin({values:{authenticator:authenticator.name,authCode:authCode}}).then(function(res){
          var data=res&&res.data&&res.data.data;
          if(!data||!data.token)throw mkErr("server","免登未返回 token");
          app.auth.setAuthenticator(data.authenticator||authenticator.name);
          app.auth.setToken(data.token);
          window.location.reload();
        },function(e){throw mkErr("server",serverMsg(e));});
      });
    };
    var onClick=function(){
      setLoading(true);
      return freeLogin().catch(function(err){
        console.error("[ding-talk] 免登失败，回退扫码登录：",err);
        return scanLogin(dbgOf(err)).catch(function(err2){
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
  return r.jsx(t.SchemaComponent,{schema:{type:"object",properties:{communityDingTalkAuth:{type:"void",properties:{public:{type:"object",properties:{autoSignup:{"x-decorator":"FormItem",type:"boolean",title:"用户不存在时自动注册",required:!1,"x-component":"Checkbox"}}},internal:{type:"object",properties:{userCheckType:{"x-decorator":"FormItem",type:"string",title:"用户验证方式",required:!0,"x-component":"Select","x-component-props":{options:[{value:"orgEmail",label:"企业邮箱"},{value:"personalEmail",label:"个人邮箱"},{value:"mobile",label:"手机号"}]}},emailDomain:{"x-decorator":"FormItem",type:"string",title:"邮箱域名，多个使用英文逗号分隔",required:!0,"x-component":"Input"},corpId:{"x-decorator":"FormItem",type:"string",title:"企业 CorpId（钉钉客户端内免登必填）",required:!1,"x-component":"Input","x-component-props":{placeholder:"ding 开头，形如 dingxxxxxxxx。在钉钉开发者后台「首页」查看；也可把应用首页地址写成 …?corpId=$CORPID$ 由容器注入，留空即可"}},appKey:{"x-decorator":"FormItem",type:"string",title:"应用ID",required:!0,"x-component":"Input"},appSecret:{"x-decorator":"FormItem",type:"string",title:"应用秘钥",required:!0,"x-component":"Password"}}}}}}}});
};
function captureCorpIdFromUrl(){
  // 必须在 load() 里最早执行：路由跳转会丢参数，$CORPID$ 替换出来的值只有入口这一趟拿得到
  if(typeof window==="undefined")return;
  // 直接匹配整条 URL：登录守卫会把入口地址塞进 redirect，此时 corpId 不再是顶层参数
  // （实测 referer 为 /signin?redirect=/m?corpId=ding…），只查 location.search 会漏掉
  var m=/[?&]corpid=(ding[a-z0-9]+)/i.exec(window.location.href);
  if(m)ssSet(CORPID_KEY,m[1]);
}
class i extends t.Plugin{afterAdd(){return Promise.resolve()}beforeLoad(){return Promise.resolve()}load(){return Promise.resolve().then(()=>{captureCorpIdFromUrl();pickTokenFromUrl(this.app);this.app.pm.get(o).registerType("community-ding-talk-auth",{components:{SignInButton:makeSignInButton(this.app),AdminSettingsForm}})})}}
e.NocobasePluginDingTalkClient=i;e.default=i;Object.defineProperties(e,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}})});
