import dayjs from "dayjs";
import RelativeTime from "dayjs/plugin/relativeTime.js"
import ky from 'ky';

dayjs.extend(RelativeTime);

export default async function handler(request, response) {
  const { data } = request.query;
  console.log(`data=${data}`);
  const [type, ...args] = data.split("/").filter(Boolean);
  console.log(`type=${type}`);
  console.log(`args=${args}`);
  let jsondata = {
    subject: "last commit",
    status: "",
    color: "grey",
  };

  // 简单的参数检查
  if (typeof args === "undefined") {
    jsondata["status"] = "malformed args";

    return sendResponse(request, response, jsondata);
  }

  try {
    switch (type) {
      case "gitlab":
        jsondata["status"] = await getGitlab(...args);
        break;
      case "bitbucket": {
        let [workspace, bitbucketRepo, branch = "master"] = args;
        jsondata["status"] = await getBitbucket(workspace, bitbucketRepo, branch);
        break;
      }
      case "codeberg": {
        let [owner, codebergRepo, sha = ""] = args;
        jsondata["status"] = await getCodeberg(owner, codebergRepo, sha);
        break;
      }
      default:
        jsondata["status"] = "unsupported type";
    }

    if (jsondata.status && !jsondata.status.startsWith("malformed") && jsondata.status !== "unsupported type") {
      jsondata["color"] = "green";
    }
  } catch (err) {
    console.error(err);
    jsondata["status"] = "Fuction error";
  }

  return sendResponse(request, response, jsondata);
}

/**
 * 根据 User-Agent 选择返回 badgen JSON 还是 Shields.io JSON
 */
function sendResponse(request, response, jsondata) {
  const ua = request.headers["user-agent"] || "";

  // 当 user-agent 以 "Shields.io" 开头时，使用 Shields.io 的 JSON 格式
  if (ua.startsWith("Shields.io")) {
    const shieldsJson = {
      schemaVersion: 1,
      label: jsondata.subject || "last commit",
      message: jsondata.status || "",
      color: jsondata.color || "grey",
    };
    return response.status(200).json(shieldsJson);
  }

  // 其他情况保持原有 badgen JSON 格式
  return response.status(200).json(jsondata);
}

async function getGitlab(baseurl, id, ...args) {
  if (!isNumeric(id) && args.length >= 1) {
    id = `${id}%2F${args.shift()}`;
  }
  let api = `https://${baseurl}/api/v4/projects/${id}/repository/commits`;
  if (args.length > 0) {
    api += "?";
    args.forEach((arg) => {
      api += `${decodeURIComponent(arg)}&`;
    });
    api.replace(/&$/, "");
  }
  let data = await ky(api).json();
  return dayjs(data[0].committed_date).fromNow();
}

async function getBitbucket(workspace, repo, branch) {
  let data = await ky(
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/commits/${branch}?pagelen=1`
  ).json();
  return dayjs(data.values[0].date).fromNow();
}

async function getCodeberg(owner, repo, sha = "") {
  let url = `https://codeberg.org/api/v1/repos/${owner}/${repo}/commits?stat=false&verification=false&files=false&limit=1`;
  if (sha.length > 0) {
    url += `&sha=${sha}`;
  }
  let data = await ky(url).json();
  return dayjs(data[0].created).fromNow();
}

function isNumeric(str) {
  if (typeof str != "string") return false; // we only process strings!
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}
