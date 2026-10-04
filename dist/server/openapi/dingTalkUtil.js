/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

const typeMap = {
  "LONG": "number",
  "STRING": "string"
};
function apiToType(res) {
  const reqBody = res.data.params.filter((a) => a.position === "BODY").map((a) => {
    var _a;
    return {
      name: a.name,
      desc: ((_a = a.desc) == null ? void 0 : _a.replaceAll("\n", " ")) || "",
      required: a.required,
      type: typeMap[a.type] || "any"
    };
  });
  const resBody = res.data.rspParams.map((a) => {
    var _a;
    return {
      name: a.name,
      desc: ((_a = a.desc) == null ? void 0 : _a.replaceAll("\n", " ")) || "",
      required: a.required,
      type: typeMap[a.type] || "any"
    };
  });
  const type = `
  export type Req = {
${reqBody.map((a) => `    /** ${a.desc} */
    ${a.name}${a.required ? "" : "?"}: ${a.type};`).join("\n")}
  }
  export type Res = {
${resBody.map((a) => `    /** ${a.desc} */
    ${a.name}${a.required ? "" : "?"}: ${a.type};`).join("\n")}
  }
  async userAccessToken(taskId: number, projectId?: number) {
    return api.doRequest<null>('POST', \`{baseUrl}/v1.0/oauth2/userAccessToken\`, null, {
      clientId: this.#appKey,
      clientSecret: this.#appSecret,
    });
  },
`;
  return type;
}
async function genApiDetail(uuid, devType = "org") {
  const fd = new FormData();
  fd.append("uuid", uuid);
  fd.append("devType", devType);
  const res = await fetch("https://open-dev.dingtalk.com/openapi/explorer/getApiDetail", {
    "headers": {},
    "body": fd,
    "method": "POST"
  });
  const data = await res.json();
  return data;
}
(async () => {
  const res = await genApiDetail("dingtalk.oapi.v2.user.get");
  console.log(apiToType(res));
})();
