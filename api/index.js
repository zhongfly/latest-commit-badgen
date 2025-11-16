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
    let daysDiff = null;
    switch (type) {
      case "gitlab": {
        const { statusText, days } = await getGitlab(...args);
        jsondata["status"] = statusText;
        daysDiff = days;
        break;
      }
      case "bitbucket": {
        let [workspace, bitbucketRepo, branch = "master"] = args;
        const { statusText, days } = await getBitbucket(workspace, bitbucketRepo, branch);
        jsondata["status"] = statusText;
        daysDiff = days;
        break;
      }
      case "github": {
        let [owner, githubRepo, branch = ""] = args;
        const { statusText, days } = await getGithub(owner, githubRepo, branch);
        jsondata["status"] = statusText;
        daysDiff = days;
        break;
      }
      case "codeberg": {
        let [owner, codebergRepo, sha = ""] = args;
        const { statusText, days } = await getCodeberg(owner, codebergRepo, sha);
        jsondata["status"] = statusText;
        daysDiff = days;
        break;
      }
      default:
        jsondata["status"] = "unsupported type";
    }

    if (
      daysDiff !== null &&
      jsondata.status &&
      !jsondata.status.startsWith("malformed") &&
      jsondata.status !== "unsupported type"
    ) {
      jsondata["color"] = getColorByDays(daysDiff);
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
  return buildStatusAndDays(data[0].committed_date);
}

async function getBitbucket(workspace, repo, branch) {
  let data = await ky(
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/commits/${branch}?pagelen=1`
  ).json();
  return buildStatusAndDays(data.values[0].date);
}

async function getGithub(owner, repo, branch = "") {
  let url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;
  if (branch) {
    url += `&sha=${encodeURIComponent(branch)}`;
  }
  let data = await ky(url).json();
  return buildStatusAndDays(data[0].commit.committer.date);
}

async function getCodeberg(owner, repo, sha = "") {
  let url = `https://codeberg.org/api/v1/repos/${owner}/${repo}/commits?stat=false&verification=false&files=false&limit=1`;
  if (sha.length > 0) {
    url += `&sha=${sha}`;
  }
  let data = await ky(url).json();
  return buildStatusAndDays(data[0].created);
}

function buildStatusAndDays(dateString) {
  const commitDate = dayjs(dateString);
  const days = dayjs().diff(commitDate, "day");
  return {
    statusText: commitDate.fromNow(),
    days,
  };
}

function getColorByDays(days) {
  // 根据天数区间映射颜色：
  // < 7: brightgreen, 7–30: green, 30–180: yellowgreen,
  // 180–365: yellow, 365–730: orange, > 730: red
  const thresholds = [7, 30, 180, 365, 730];
  const colors = ["brightgreen", "green", "yellowgreen", "yellow", "orange", "red"];
  for (let i = 0; i < thresholds.length; i++) {
    if (days < thresholds[i]) {
      return colors[i];
    }
  }
  return colors[colors.length - 1];
}

function isNumeric(str) {
  if (typeof str != "string") return false; // we only process strings!
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}
