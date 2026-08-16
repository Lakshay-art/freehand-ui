import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname, normalize, sep } from "path";

const PORT = 5173;
const ROOT = process.cwd();

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

createServer((req, res) => {
  let requestPath;
  try {
    requestPath = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  const path = requestPath === "/" ? "/examples/basic/index.html" : requestPath;
  // `join` normalises `..` segments but does not stop them from walking past
  // ROOT, so a request like `/../../etc/passwd` must be rejected explicitly.
  let filePath = normalize(join(ROOT, path));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
  res.end(readFileSync(filePath));
}).listen(PORT, () => {
  console.log(`Dev server: http://localhost:${PORT}`);
});
