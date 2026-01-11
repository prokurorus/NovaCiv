#!/usr/bin/env bash
set -euo pipefail
cd /root/NovaCiv

node - <<"NODE"
require("dotenv").config({ path: "/root/NovaCiv/.env", override: true });
const axios = require("axios");

const t = process.env.GITHUB_TOKEN || "";
console.log("token_len=", t.length, "head=", t.slice(0,4), "tail=", t.slice(-4));

axios.get("https://api.github.com/user", {
  headers: {
    Authorization: "token " + t,
    Accept: "application/vnd.github+json"
  }
}).then(r => {
  console.log("GITHUB_OK", r.status, r.data.login);
}).catch(e => {
  console.log("GITHUB_ERR", e.response?.status, JSON.stringify(e.response?.data || e.message));
  process.exit(2);
});
NODE
