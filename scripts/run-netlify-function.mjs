import path from "path";
import process from "process";
import { createRequire } from "module";
import dotenv from "dotenv";

const functionName = process.argv[2];
const startTime = Date.now();

const respondAndExit = (payload, exitCode) => {
  console.log(JSON.stringify(payload));
  process.exit(exitCode);
};

if (!functionName) {
  respondAndExit(
    {
      ok: false,
      function: "",
      statusCode: 400,
      durationMs: Date.now() - startTime,
      note: "missing_function_name",
    },
    1
  );
}

const envPath =
  process.env.ENV_PATH ||
  (process.platform === "linux" ? "/root/NovaCiv/.env" : path.resolve(".env"));

dotenv.config({ path: envPath });

const filePath = path.resolve("netlify", "functions", `${functionName}.js`);
const requireFromHere = createRequire(import.meta.url);

let handler;
try {
  const mod = requireFromHere(filePath);
  handler = mod.handler || mod.default?.handler || mod.default;
} catch (error) {
  respondAndExit(
    {
      ok: false,
      function: functionName,
      statusCode: 404,
      durationMs: Date.now() - startTime,
      note: "function_load_failed",
    },
    1
  );
}

if (typeof handler !== "function") {
  respondAndExit(
    {
      ok: false,
      function: functionName,
      statusCode: 500,
      durationMs: Date.now() - startTime,
      note: "handler_not_found",
    },
    1
  );
}

const event = {
  httpMethod: "GET",
  headers: {},
  queryStringParameters: {},
};

if (functionName === "fetch-news" || functionName === "news-cron") {
  event.queryStringParameters.token = process.env.NEWS_CRON_SECRET;
} else if (functionName === "domovoy-auto-post" || functionName === "domovoy-every-3h") {
  event.queryStringParameters.token = process.env.DOMOVOY_CRON_SECRET;
} else if (functionName === "domovoy-auto-reply") {
  event.queryStringParameters.token =
    process.env.DOMOVOY_REPLY_CRON_SECRET || process.env.DOMOVOY_CRON_SECRET;
} else if (functionName === "ops-run-now") {
  event.queryStringParameters.token = process.env.OPS_CRON_SECRET;
}

const run = async () => {
  try {
    const result = await handler(event, {});
    const statusCode = Number(result?.statusCode ?? 200);
    const ok = statusCode >= 200 && statusCode < 300;

    respondAndExit(
      {
        ok,
        function: functionName,
        statusCode,
        durationMs: Date.now() - startTime,
      },
      ok ? 0 : 1
    );
  } catch (error) {
    respondAndExit(
      {
        ok: false,
        function: functionName,
        statusCode: 500,
        durationMs: Date.now() - startTime,
        note: "handler_error",
      },
      1
    );
  }
};

run();
