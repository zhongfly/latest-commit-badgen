import { getProviderStatus } from "./providers.js";

export default async function handler(request, response) {
  const { data } = request.query;
  console.log(`data=${data}`);
  const [type, ...args] = data.split("/").filter(Boolean);
  console.log(`type=${type}`);
  console.log(`args=${args}`);

  const jsondata = {
    subject: "last commit",
    status: "",
    color: "grey",
  };

  // 简单的参数检查（保持兼容）
  if (typeof args === "undefined") {
    jsondata.status = "malformed args";
    return sendResponse(request, response, jsondata);
  }

  try {
    let daysDiff = null;
    const result = await getProviderStatus(type, args);

    if (!result) {
      jsondata.status = "unsupported type";
    } else {
      jsondata.status = result.statusText;
      daysDiff = result.days;
    }

    if (
      daysDiff !== null &&
      jsondata.status &&
      !jsondata.status.startsWith("malformed") &&
      jsondata.status !== "unsupported type"
    ) {
      jsondata.color = getColorByDays(daysDiff);
    }
  } catch (err) {
    console.error(err);
    jsondata.status = "Fuction error";
  }

  return sendResponse(request, response, jsondata);
}

function sendResponse(request, response, jsondata) {
  const ua = request.headers["user-agent"] || "";

  // 对 Shields.io 使用其 JSON 格式
  if (ua.startsWith("Shields.io")) {
    const shieldsJson = {
      schemaVersion: 1,
      label: jsondata.subject || "last commit",
      message: jsondata.status || "",
      color: jsondata.color || "grey",
    };
    return response.status(200).json(shieldsJson);
  }

  // 默认返回原始 badgen JSON
  return response.status(200).json(jsondata);
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

