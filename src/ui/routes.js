const fs = require("fs/promises");
const path = require("path");

const UI_DIR = __dirname;
const pkg = require("../../package.json");

let remoteVersionCache = { ts: 0, payload: null };

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

function resolveUiFile(relativePath) {
  const safeRel = relativePath.replace(/^\/+/, "");
  const fullPath = path.resolve(UI_DIR, safeRel);
  if (!fullPath.startsWith(path.resolve(UI_DIR) + path.sep)) {
    return null;
  }
  return fullPath;
}

async function serveFile(filePath) {
  const data = await fs.readFile(filePath);
  return {
    status: 200,
    headers: { "Content-Type": contentTypeFor(filePath), "Cache-Control": "no-store" },
    body: data,
  };
}

function encodeGithubPathRef(ref) {
  // Keep "/" for branch names like "feature/foo".
  return encodeURIComponent(ref).replace(/%2F/g, "/");
}

async function fetchRemotePackageJson({ repo, branch }) {
  const rawUrl = `https://raw.githubusercontent.com/${repo}/${encodeGithubPathRef(branch)}/package.json`;
  try {
    const res = await fetch(rawUrl, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch (e) {}

  // Fallback: GitHub API (base64 content)
  const apiUrl = `https://api.github.com/repos/${repo}/contents/package.json?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(apiUrl, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const payload = await res.json().catch(() => null);
  const content = payload && typeof payload.content === "string" ? payload.content : null;
  if (!content) return null;
  const decoded = Buffer.from(content.replace(/\s+/g, ""), "base64").toString("utf8");
  return JSON.parse(decoded);
}

async function handleUiRoute(req, parsedUrl) {
  const pathname = parsedUrl.pathname;

  if (pathname === "/favicon.ico") {
    return { status: 204, headers: {}, body: "" };
  }

  if (pathname === "/ui/meta.json" && req.method === "GET") {
    const repo =
      process.env.AG2API_UPDATE_REPO ||
      process.env.AG2API_GITHUB_REPO ||
      "znlsl/antigravity2api";
    const branch = process.env.AG2API_UPDATE_BRANCH || "main";
    return {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      body: JSON.stringify({
        name: pkg.name || "antigravity2api",
        version: pkg.version || "0.0.0",
        repo,
        branch,
        homepage: `https://github.com/${repo}`,
      }),
    };
  }

  if (pathname === "/ui/update.json" && req.method === "GET") {
    const repo =
      process.env.AG2API_UPDATE_REPO ||
      process.env.AG2API_GITHUB_REPO ||
      "znlsl/antigravity2api";
    const branch = process.env.AG2API_UPDATE_BRANCH || "main";

    // Cache for 10 minutes (best-effort).
    const now = Date.now();
    if (remoteVersionCache.payload && now - remoteVersionCache.ts < 10 * 60 * 1000) {
      return {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        body: JSON.stringify(remoteVersionCache.payload),
      };
    }

    let remoteVersion = null;
    try {
      const remotePkg = await fetchRemotePackageJson({ repo, branch });
      remoteVersion = remotePkg && typeof remotePkg.version === "string" ? remotePkg.version : null;
    } catch (e) {
      remoteVersion = null;
    }

    const payload = {
      repo,
      branch,
      version: remoteVersion,
      homepage: `https://github.com/${repo}`,
    };

    remoteVersionCache = { ts: now, payload };

    return {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      body: JSON.stringify(payload),
    };
  }

  if ((pathname === "/" || pathname === "/ui" || pathname === "/ui/") && req.method === "GET") {
    return serveFile(resolveUiFile("index.html"));
  }

  if (pathname.startsWith("/ui/") && req.method === "GET") {
    const rel = pathname.slice("/ui/".length);
    const fullPath = resolveUiFile(rel);
    if (!fullPath) {
      return { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Not Found" };
    }
    try {
      return await serveFile(fullPath);
    } catch (e) {
      return { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Not Found" };
    }
  }

  return null;
}

module.exports = {
  handleUiRoute,
};
