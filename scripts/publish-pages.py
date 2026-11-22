#!/usr/bin/env python3
"""把这个目录同步到 GitHub Pages。

为什么不用 git push：
  本机的 HTTP 代理对 github.com 的 CONNECT 会返回 502（git 一律 exit 128），
  但 api.github.com 是通的，所以改走 Git Data API（blob → tree → commit → ref）。

用法：
    python scripts/publish-pages.py                 # 默认推到 Axl-Kane/gymlog
    python scripts/publish-pages.py owner/repo      # 换仓库

前提：gh CLI 已登录（gh auth status），仓库已开启 Pages（main 分支 / 根目录）。
"""
import base64
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_REPO = "Axl-Kane/gymlog"
ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", "__pycache__", "node_modules", "_dev"}
SKIP_FILES = {".DS_Store", "Thumbs.db"}

# 这台机器装了 gh 但 PATH 没刷新，所以显式找一下
GH = shutil.which("gh") or r"C:\Program Files\GitHub CLI\gh.exe"


def gh(method, path, payload=None):
    cmd = [GH, "api", "--method", method, f"repos/{REPO}/{path}"]
    if payload is None:
        p = subprocess.run(cmd, capture_output=True)
    else:
        cmd += ["--input", "-"]
        p = subprocess.run(cmd, input=json.dumps(payload).encode("utf-8"), capture_output=True)
    if p.returncode != 0:
        sys.exit(f"API 失败 {path}: {p.stderr.decode('utf-8', 'ignore')[:400]}")
    out = p.stdout.decode("utf-8", "ignore").strip()
    return json.loads(out) if out else {}


def collect():
    files = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for n in names:
            if n in SKIP_FILES:
                continue
            full = Path(base) / n
            files.append((full.relative_to(ROOT).as_posix(), full))
    return sorted(files)


def main():
    global REPO
    REPO = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_REPO

    head = gh("GET", "commits/main")
    base_tree = head["commit"]["tree"]["sha"]
    print(f"仓库 {REPO}，基线 {head['sha'][:8]}")

    files = collect()
    tree = []
    for rel, full in files:
        blob = gh("POST", "git/blobs", {
            "content": base64.b64encode(full.read_bytes()).decode("ascii"),
            "encoding": "base64",
        })
        tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print("  +", rel)

    new_tree = gh("POST", "git/trees", {"base_tree": base_tree, "tree": tree})
    commit = gh("POST", "git/commits", {
        "message": f"更新：{len(files)} 个文件",
        "tree": new_tree["sha"],
        "parents": [head["sha"]],
    })
    gh("PATCH", "git/refs/heads/main", {"sha": commit["sha"], "force": True})
    print(f"完成 {commit['sha'][:8]}，约 1 分钟后 Pages 自动重建")


if __name__ == "__main__":
    main()
