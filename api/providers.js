import dayjs from "dayjs";
import RelativeTime from "dayjs/plugin/relativeTime.js";
import ky from "ky";

dayjs.extend(RelativeTime);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITLAB_TOKEN = process.env.GITLAB_TOKEN;

function buildStatusAndDays(dateString) {
  const commitDate = dayjs(dateString);
  const days = dayjs().diff(commitDate, "day");
  return {
    statusText: commitDate.fromNow(),
    days,
  };
}

function isNumeric(str) {
  if (typeof str !== "string") return false;
  return !isNaN(str) && !isNaN(parseFloat(str));
}

function handleProviderError(error, providerName) {
  console.error(error);

  const response = error && error.response;
  if (response && typeof response.status === "number") {
    const status = response.status;
    if (status === 404) {
      return { statusText: `${providerName}: repo not found`, days: null };
    }
    if (status === 401 || status === 403) {
      return { statusText: `${providerName}: unauthorized`, days: null };
    }
    if (status === 429) {
      return { statusText: `${providerName}: rate limited`, days: null };
    }
  }

  return { statusText: `${providerName}: error`, days: null };
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
    api = api.replace(/&$/, "");
  }

  const headers =
    GITLAB_TOKEN != null
      ? {
          Authorization: `Bearer ${GITLAB_TOKEN}`,
        }
      : undefined;

  try {
    const data = await ky(api, { headers }).json();
    if (!Array.isArray(data) || !data[0]) {
      return { statusText: "gitlab: no commits", days: null };
    }
    return buildStatusAndDays(data[0].committed_date);
  } catch (error) {
    return handleProviderError(error, "gitlab");
  }
}

async function getBitbucket(workspace, repo, branch = "master") {
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/commits/${branch}?pagelen=1`;

  try {
    const data = await ky(url).json();
    if (!data || !Array.isArray(data.values) || !data.values[0]) {
      return { statusText: "bitbucket: no commits", days: null };
    }
    return buildStatusAndDays(data.values[0].date);
  } catch (error) {
    return handleProviderError(error, "bitbucket");
  }
}

async function getGithub(owner, repo, branch = "") {
  let url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;
  if (branch) {
    url += `&sha=${encodeURIComponent(branch)}`;
  }

  const headers =
    GITHUB_TOKEN != null
      ? {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
        }
      : undefined;

  try {
    const data = await ky(url, { headers }).json();
    if (!Array.isArray(data) || !data[0]) {
      return { statusText: "github: no commits", days: null };
    }

    const commit = data[0].commit || {};
    const date = (commit.committer && commit.committer.date) || (commit.author && commit.author.date);
    if (!date) {
      return { statusText: "github: invalid commit data", days: null };
    }

    return buildStatusAndDays(date);
  } catch (error) {
    return handleProviderError(error, "github");
  }
}

async function getCodeberg(owner, repo, sha = "") {
  let url = `https://codeberg.org/api/v1/repos/${owner}/${repo}/commits?stat=false&verification=false&files=false&limit=1`;
  if (sha.length > 0) {
    url += `&sha=${sha}`;
  }

  try {
    const data = await ky(url).json();
    if (!Array.isArray(data) || !data[0]) {
      return { statusText: "codeberg: no commits", days: null };
    }
    return buildStatusAndDays(data[0].created);
  } catch (error) {
    return handleProviderError(error, "codeberg");
  }
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

