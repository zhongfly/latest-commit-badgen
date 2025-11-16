import dayjs from "dayjs";
import RelativeTime from "dayjs/plugin/relativeTime.js";
import ky from "ky";

dayjs.extend(RelativeTime);

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
  const data = await ky(api).json();
  return buildStatusAndDays(data[0].committed_date);
}

async function getBitbucket(workspace, repo, branch = "master") {
  const data = await ky(
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/commits/${branch}?pagelen=1`,
  ).json();
  return buildStatusAndDays(data.values[0].date);
}

async function getGithub(owner, repo, branch = "") {
  let url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;
  if (branch) {
    url += `&sha=${encodeURIComponent(branch)}`;
  }
  const data = await ky(url).json();
  return buildStatusAndDays(data[0].commit.committer.date);
}

async function getCodeberg(owner, repo, sha = "") {
  let url = `https://codeberg.org/api/v1/repos/${owner}/${repo}/commits?stat=false&verification=false&files=false&limit=1`;
  if (sha) {
    url += `&sha=${sha}`;
  }
  const data = await ky(url).json();
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

function isNumeric(str) {
  if (typeof str != "string") return false;
  return !isNaN(str) && !isNaN(parseFloat(str));
}

const providers = {
  gitlab: getGitlab,
  bitbucket: getBitbucket,
  github: getGithub,
  codeberg: getCodeberg,
};

export async function getProviderStatus(type, args) {
  const provider = providers[type];
  if (!provider) {
    return null;
  }
  return provider(...args);
}
