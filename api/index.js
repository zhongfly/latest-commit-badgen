import dayjs from "dayjs";
import RelativeTime from "dayjs/plugin/relativeTime"
import got from "got";

dayjs.extend(RelativeTime);

export default async function handler(request, response) {
  const {data} = request.query;
  console.log(`data=${data}`);
  const [type, ...args] = data.split("/").filter(Boolean);console.log(`type=${type}`);
  console.log(`args=${args}`);
  let jsondata = {
    subject: "last commit",
    status: "",
    color: "grey",
  };
  if (typeof args == undefined) {
    jsondata["status"] = "malformed args"
    return response.status(400).json(jsondata);
  }
  try {
      switch (type) {
        case "gitlab":
          jsondata["status"] = await getGitlab(...args);
          break;
        case "bitbucket":
          let [workspace, repo, branch = "master"] = args;
          jsondata["status"] = await getBitbucket(workspace, repo, branch);
          break;
      }
  } catch (err) {
    jsondata["status"] = "Fuction error";
  }
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
  let data = await got(api).json();
  return dayjs(data[0].committed_date).fromNow();
}

async function getBitbucket(workspace, repo, branch) {
  let data = await got(
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/commits/${branch}?pagelen=1`
  ).json();
  return dayjs(data.values[0].date).fromNow();
}

function isNumeric(str) {
  if (typeof str != "string") return false; // we only process strings!
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}
