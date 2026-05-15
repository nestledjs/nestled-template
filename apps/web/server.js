import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";

const BUILD_PATH = "./build/server/index.js";
const DEVELOPMENT = process.env.NODE_ENV === "development";
const PORT = Number.parseInt(process.env.PORT || "3000");

const app = express();

app.use(compression());
app.disable("x-powered-by");

// Serve static assets with proper caching (always, regardless of NODE_ENV)
app.use(
  "/assets",
  express.static("apps/web/build/client/assets", { 
    immutable: true, 
    maxAge: "1y",
    setHeaders: (res, path) => {
      if (path.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      }
      if (path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
    }
  }),
);

app.use(express.static("apps/web/build/client", { maxAge: "1h" }));

if (DEVELOPMENT) {
  console.log("Starting development server");
  app.use(morgan("dev"));
} else {
  console.log("Starting production server");
  app.use(morgan("tiny"));
}

// Use React Router's createRequestHandler
app.use(createRequestHandler({
  build: () => import(BUILD_PATH),
  getLoadContext() {
    return {
      // Add any context you need
    };
  },
}));

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Serving static files from: apps/web/build/client`);
  console.log(`🌍 Environment: ${DEVELOPMENT ? 'development' : 'production'}`);
}); 