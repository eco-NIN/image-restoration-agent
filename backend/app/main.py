from __future__ import annotations

import os
import shutil
import sqlite3
import subprocess
import threading
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()

origins = [
    "http://localhost:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


ROOT_DIR = Path(__file__).resolve().parents[2]
RUNTIME_DIR = ROOT_DIR / "backend" / "runtime"
UPLOAD_DIR = RUNTIME_DIR / "uploads"
JOBS_DIR = RUNTIME_DIR / "jobs"
DB_PATH = RUNTIME_DIR / "tasks.db"

# 只读取 4KAgent，不对该目录做任何写入改动。
FOURKAGENT_DIR = Path(os.getenv("FOURKAGENT_DIR", "/gz-data/projects2/4KAgent"))
FOURKAGENT_PROFILE_NAME = os.getenv("FOURKAGENT_PROFILE_NAME", "MyAgent_API")
FOURKAGENT_GPU_ID = os.getenv("FOURKAGENT_GPU_ID", "0")

RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
JOBS_DIR.mkdir(parents=True, exist_ok=True)


def utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def get_db_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                input_image_path TEXT NOT NULL,
                result_image_path TEXT,
                result_image_url TEXT,
                logs TEXT DEFAULT '',
                error_message TEXT
            )
            """
        )
        conn.commit()


def update_task(task_id: str, **fields: str) -> None:
    if not fields:
        return
    fields["updated_at"] = utc_now()
    assignments = ", ".join(f"{k} = ?" for k in fields.keys())
    values = list(fields.values()) + [task_id]
    with get_db_conn() as conn:
        conn.execute(f"UPDATE tasks SET {assignments} WHERE id = ?", values)
        conn.commit()


def append_task_log(task_id: str, line: str) -> None:
    clean_line = line.rstrip("\n")
    with get_db_conn() as conn:
        row = conn.execute("SELECT logs FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            return
        old_logs = row["logs"] or ""
        new_logs = (old_logs + clean_line + "\n")[-120_000:]
        conn.execute(
            "UPDATE tasks SET logs = ?, updated_at = ? WHERE id = ?",
            (new_logs, utc_now(), task_id),
        )
        conn.commit()


def to_media_url(path: Path) -> str:
    rel = path.relative_to(RUNTIME_DIR).as_posix()
    return f"/media/{rel}"


def find_latest_image(directory: Path) -> Path | None:
    candidates = [
        p
        for p in directory.rglob("*")
        if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def read_workflow_log_tail(task_id: str, max_lines: int = 120) -> str:
    workflow_path = JOBS_DIR / task_id / "output" / "logs" / "workflow.log"
    if not workflow_path.exists():
        return ""
    try:
        content = workflow_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""
    lines = content.splitlines()
    return "\n".join(lines[-max_lines:])


def run_4kagent_task(task_id: str) -> None:
    with get_db_conn() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        return

    update_task(task_id, status="running")

    task_dir = JOBS_DIR / task_id
    input_dir = task_dir / "input"
    output_dir = task_dir / "output"
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    source_input = Path(row["input_image_path"])
    task_input_path = input_dir / source_input.name
    shutil.copy2(source_input, task_input_path)

    command = [
        "python",
        "infer_4kagent.py",
        "--input_dir",
        str(input_dir),
        "--output_dir",
        str(output_dir),
        "--profile_name",
        FOURKAGENT_PROFILE_NAME,
        "--tool_run_gpu_id",
        str(FOURKAGENT_GPU_ID),
    ]

    env = os.environ.copy()
    env["CUDA_VISIBLE_DEVICES"] = str(FOURKAGENT_GPU_ID)

    append_task_log(task_id, f"$ {' '.join(command)}")
    append_task_log(task_id, f"[cwd] {FOURKAGENT_DIR}")

    if not FOURKAGENT_DIR.exists():
        update_task(task_id, status="failed", error_message=f"4KAgent 目录不存在: {FOURKAGENT_DIR}")
        return

    try:
        proc = subprocess.Popen(
            command,
            cwd=str(FOURKAGENT_DIR),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        assert proc.stdout is not None
        for line in proc.stdout:
            append_task_log(task_id, line)

        return_code = proc.wait()
        if return_code != 0:
            update_task(
                task_id,
                status="failed",
                error_message=f"4KAgent 执行失败，退出码: {return_code}",
            )
            return

        result_path = find_latest_image(output_dir)
        if result_path is None:
            update_task(
                task_id,
                status="failed",
                error_message="推理完成但未找到输出图片，请检查 workflow.log。",
            )
            return

        update_task(
            task_id,
            status="done",
            result_image_path=str(result_path),
            result_image_url=to_media_url(result_path),
            error_message="",
        )
    except Exception as exc:  # noqa: BLE001
        update_task(task_id, status="failed", error_message=f"后端异常: {exc}")


init_db()
app.mount("/media", StaticFiles(directory=str(RUNTIME_DIR)), name="media")

@app.get("/")
def read_root():
    return {"message": "Image Restoration Agent API"}


@app.post("/api/restore")
async def restore_image(
    image: UploadFile = File(...),
    mode: str = Form("FastGen4K_P"),
):
    if not image.filename:
        raise HTTPException(status_code=400, detail="上传文件缺少文件名")

    suffix = Path(image.filename).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
        raise HTTPException(status_code=400, detail="仅支持 png/jpg/jpeg/webp/bmp 图片")

    task_id = uuid.uuid4().hex[:16]
    filename = f"{task_id}{suffix}"
    saved_path = UPLOAD_DIR / filename

    content = await image.read()
    saved_path.write_bytes(content)

    now = utc_now()
    with get_db_conn() as conn:
        conn.execute(
            """
            INSERT INTO tasks (
                id, mode, status, created_at, updated_at,
                input_image_path, logs, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, '', '')
            """,
            (task_id, mode, "queued", now, now, str(saved_path)),
        )
        conn.commit()

    thread = threading.Thread(target=run_4kagent_task, args=(task_id,), daemon=True)
    thread.start()

    return {
        "taskId": task_id,
        "status": "queued",
        "message": "任务已提交，后端正在排队执行。",
    }


@app.get("/api/tasks/{task_id}")
def get_task_status(task_id: str):
    with get_db_conn() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="任务不存在")

    db_logs = row["logs"] or ""
    workflow_tail = read_workflow_log_tail(task_id, max_lines=120)
    merged_logs = db_logs
    if workflow_tail:
        merged_logs = (db_logs + "\n[workflow.log]\n" + workflow_tail).strip()

    log_lines = merged_logs.splitlines()

    return {
        "taskId": row["id"],
        "mode": row["mode"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "resultImageUrl": row["result_image_url"],
        "errorMessage": row["error_message"] or "",
        "logText": "\n".join(log_lines[-200:]),
    }


@app.get("/api/history")
def get_history():
    with get_db_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, mode, status, created_at, result_image_url
            FROM tasks
            ORDER BY created_at DESC
            LIMIT 200
            """
        ).fetchall()

    return [
        {
            "id": row["id"],
            "mode": row["mode"],
            "status": row["status"],
            "createdAt": row["created_at"],
            "thumbnailUrl": row["result_image_url"] or "",
        }
        for row in rows
    ]