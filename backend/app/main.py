from __future__ import annotations

import json
import logging
import os
import re
import shutil
import sqlite3
import subprocess
import threading
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()
logger = logging.getLogger("image-restoration-agent")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

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

ALLOWED_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
ACTIVE_PROCESSES: dict[str, subprocess.Popen] = {}
ACTIVE_PROCESSES_LOCK = threading.Lock()


def now_token() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]


def make_task_id() -> str:
    return f"task_{now_token()}_{uuid.uuid4().hex[:4]}"


def make_batch_id() -> str:
    return f"batch_{now_token()}_{uuid.uuid4().hex[:4]}"


def sanitize_filename_base(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", name).strip("_")
    return cleaned[:80] or "image"


def sanitize_relative_path(path_text: str) -> Path:
    raw_parts = str(path_text or "").replace("\\", "/").split("/")
    safe_parts = [p for p in raw_parts if p and p not in {".", ".."}]
    return Path(*safe_parts) if safe_parts else Path("")


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
                original_file_name TEXT DEFAULT '',
                display_name TEXT DEFAULT '',
                upload_group TEXT DEFAULT '',
                source_type TEXT DEFAULT 'single',
                relative_path TEXT DEFAULT '',
                result_image_path TEXT,
                result_image_url TEXT,
                logs TEXT DEFAULT '',
                error_message TEXT,
                cancel_requested INTEGER DEFAULT 0
            )
            """
        )
        columns = {row[1] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
        required_columns = {
            "original_file_name": "TEXT DEFAULT ''",
            "display_name": "TEXT DEFAULT ''",
            "upload_group": "TEXT DEFAULT ''",
            "source_type": "TEXT DEFAULT 'single'",
            "relative_path": "TEXT DEFAULT ''",
            "cancel_requested": "INTEGER DEFAULT 0",
        }
        for column, ddl in required_columns.items():
            if column not in columns:
                conn.execute(f"ALTER TABLE tasks ADD COLUMN {column} {ddl}")
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


def is_cancel_requested(task_id: str) -> bool:
    with get_db_conn() as conn:
        row = conn.execute("SELECT cancel_requested FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        return False
    return bool(row["cancel_requested"])


def to_media_url(path: Path) -> str:
    rel = path.relative_to(RUNTIME_DIR).as_posix()
    return f"/media/{rel}"


def maybe_to_media_url(path: Path | None) -> str:
    if path is None:
        return ""
    try:
        return to_media_url(path)
    except Exception:  # noqa: BLE001
        return ""


def find_latest_image(directory: Path) -> Path | None:
    candidates = [
        p
        for p in directory.rglob("*")
        if p.is_file() and p.suffix.lower() in ALLOWED_SUFFIXES
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def find_latest_file_by_name(directory: Path, file_name: str) -> Path | None:
    if not directory.exists():
        return None
    candidates = [p for p in directory.rglob(file_name) if p.is_file()]
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def read_workflow_log_tail(task_id: str, max_lines: int = 120) -> str:
    workflow_path = find_latest_file_by_name(JOBS_DIR / task_id / "output", "workflow.log")
    if workflow_path is None:
        return ""
    if not workflow_path.exists():
        return ""
    try:
        content = workflow_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""
    lines = content.splitlines()
    return "\n".join(lines[-max_lines:])


def parse_flow_from_task(task_id: str, merged_logs: str) -> dict:
    output_dir = JOBS_DIR / task_id / "output"
    summary_path = find_latest_file_by_name(output_dir, "summary.json")
    summary_data: dict = {}
    if summary_path:
        try:
            summary_data = json.loads(summary_path.read_text(encoding="utf-8", errors="ignore"))
        except Exception:  # noqa: BLE001
            summary_data = {}

    iqa_text = ""
    image_description_text = ""
    plan_text = ""
    best_tool = ""
    final_result = ""
    running_subtask = ""
    tool_progress: list[dict] = []
    score_lines: list[str] = []

    result_scores_path = find_latest_file_by_name(output_dir, "result_scores_with_metrics.txt")
    if result_scores_path:
        try:
            score_lines = [ln.strip() for ln in result_scores_path.read_text(encoding="utf-8", errors="ignore").splitlines() if ln.strip()]
        except OSError:
            score_lines = []

    for line in merged_logs.splitlines():
        clean = line.strip()
        if not clean:
            continue
        if "IQA scores:" in clean and not iqa_text:
            iqa_text = clean.split("IQA scores:", 1)[-1].strip() or clean
        elif "Image description:" in clean and not image_description_text:
            image_description_text = clean.split("Image description:", 1)[-1].strip() or clean
        elif "Plan:" in clean and not plan_text:
            plan_text = clean.split("Plan:", 1)[-1].strip() or clean
        elif "Executing" in clean and "on input" in clean:
            running_subtask = clean
        elif "Best tool:" in clean:
            best_tool = clean.split("Best tool:", 1)[-1].strip()
        elif clean.startswith("Restoration result:"):
            final_result = clean.split("Restoration result:", 1)[-1].strip()

        m = re.search(r"([^\s]+) is used in restoration .* sequence:\s*([^@\s]+)@([^\s.]+)", clean)
        if m:
            tool_progress.append(
                {
                    "degradation": m.group(1),
                    "subtask": m.group(2),
                    "tool": m.group(3),
                    "status": "done",
                    "message": clean,
                }
            )

    tool_nodes: list[dict] = []
    tree = (summary_data or {}).get("tree") or {}
    children = tree.get("children") if isinstance(tree, dict) else {}
    if isinstance(children, dict):
        for subtask_name, subtask_data in children.items():
            if not isinstance(subtask_data, dict):
                continue
            tools = subtask_data.get("tools") or {}
            best_tool_name = subtask_data.get("best_tool") or ""
            if isinstance(tools, dict):
                for tool_name, tool_data in tools.items():
                    if not isinstance(tool_data, dict):
                        continue
                    img_path = Path(str(tool_data.get("img_path", ""))) if tool_data.get("img_path") else None
                    tool_nodes.append(
                        {
                            "subtask": subtask_name,
                            "tool": tool_name,
                            "isBest": tool_name == best_tool_name,
                            "degradation": tool_data.get("degradation", ""),
                            "thumbnailUrl": maybe_to_media_url(img_path),
                        }
                    )

    input_img_path = Path(str(tree.get("img_path"))) if isinstance(tree, dict) and tree.get("img_path") else None
    input_img_url = maybe_to_media_url(input_img_path)

    return {
        "stages": [
            {
                "id": "evaluation",
                "label": "评估",
                "detail": iqa_text,
                "done": bool(iqa_text),
            },
            {
                "id": "perception",
                "label": "感知",
                "detail": image_description_text,
                "done": bool(image_description_text),
            },
            {
                "id": "decision",
                "label": "决策",
                "detail": plan_text,
                "done": bool(plan_text),
            },
            {
                "id": "execution",
                "label": "执行",
                "detail": running_subtask,
                "done": bool(tool_nodes or tool_progress),
            },
            {
                "id": "feedback",
                "label": "反馈",
                "detail": best_tool or final_result,
                "done": bool(best_tool or final_result),
            },
        ],
        "inputImageUrl": input_img_url,
        "toolNodes": tool_nodes,
        "toolProgress": tool_progress,
        "scoreLines": score_lines,
        "bestTool": best_tool,
        "finalResult": final_result,
    }


def validate_image_upload(image: UploadFile) -> str:
    if not image.filename:
        raise HTTPException(status_code=400, detail="上传文件缺少文件名")
    suffix = Path(image.filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="仅支持 png/jpg/jpeg/webp/bmp 图片")
    return suffix


async def save_upload_file(
    image: UploadFile,
    task_id: str,
    upload_group: str,
    relative_path: str = "",
) -> tuple[Path, str, str]:
    suffix = validate_image_upload(image)
    original_name = Path(image.filename or "").name
    stem = sanitize_filename_base(Path(original_name).stem)
    timestamp = now_token()
    renamed_file = f"{stem}_{timestamp}{suffix}"

    rel_path_obj = sanitize_relative_path(relative_path)
    rel_parent = rel_path_obj.parent if str(rel_path_obj) else Path("")
    group_dir = UPLOAD_DIR / sanitize_filename_base(upload_group)
    target_dir = group_dir / rel_parent
    target_dir.mkdir(parents=True, exist_ok=True)
    saved_path = target_dir / renamed_file
    content = await image.read()
    saved_path.write_bytes(content)
    display_name = (str(rel_parent / renamed_file) if str(rel_parent) else renamed_file)
    return saved_path, original_name, display_name


def create_task(
    task_id: str,
    mode: str,
    saved_path: Path,
    original_file_name: str,
    display_name: str,
    upload_group: str,
    source_type: str,
    relative_path: str,
) -> None:
    now = utc_now()
    with get_db_conn() as conn:
        conn.execute(
            """
            INSERT INTO tasks (
                id, mode, status, created_at, updated_at,
                input_image_path, original_file_name, display_name,
                upload_group, source_type, relative_path,
                logs, error_message, cancel_requested
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', 0)
            """,
            (
                task_id,
                mode,
                "queued",
                now,
                now,
                str(saved_path),
                original_file_name,
                display_name,
                upload_group,
                source_type,
                relative_path,
            ),
        )
        conn.commit()


def start_task_thread(task_id: str) -> None:
    thread = threading.Thread(target=run_4kagent_task, args=(task_id,), daemon=True)
    thread.start()


def run_4kagent_task(task_id: str) -> None:
    with get_db_conn() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        return

    if is_cancel_requested(task_id):
        update_task(task_id, status="cancelled", error_message="任务已取消")
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
    logger.info("Task %s command: %s", task_id, " ".join(command))
    logger.info("Task %s cwd: %s", task_id, FOURKAGENT_DIR)

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
        with ACTIVE_PROCESSES_LOCK:
            ACTIVE_PROCESSES[task_id] = proc

        assert proc.stdout is not None
        for line in proc.stdout:
            append_task_log(task_id, line)
            if is_cancel_requested(task_id):
                append_task_log(task_id, "[system] 检测到取消请求，正在终止任务...")
                proc.terminate()
                break


        return_code = proc.wait()
        cancelled = is_cancel_requested(task_id)
        if cancelled:
            update_task(task_id, status="cancelled", error_message="任务已取消")
            return
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
    finally:
        with ACTIVE_PROCESSES_LOCK:
            ACTIVE_PROCESSES.pop(task_id, None)


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
    task_id = make_task_id()
    upload_group = task_id
    saved_path, original_name, display_name = await save_upload_file(
        image=image,
        task_id=task_id,
        upload_group=upload_group,
        relative_path="",
    )
    create_task(
        task_id=task_id,
        mode=mode,
        saved_path=saved_path,
        original_file_name=original_name,
        display_name=display_name,
        upload_group=upload_group,
        source_type="single",
        relative_path="",
    )
    start_task_thread(task_id)

    return {
        "taskId": task_id,
        "fileName": display_name,
        "status": "queued",
        "message": "任务已提交，后端正在排队执行。",
    }


@app.post("/api/restore/batch")
async def restore_batch_images(
    images: list[UploadFile] = File(...),
    image_paths: list[str] = Form([]),
    mode: str = Form("FastGen4K_P"),
):
    if not images:
        raise HTTPException(status_code=400, detail="请至少上传一张图片")
    if len(images) > 200:
        raise HTTPException(status_code=400, detail="单次最多提交 200 张图片")

    batch_id = make_batch_id()
    tasks: list[dict] = []
    has_folder_structure = any("/" in str(p).replace("\\", "/") for p in image_paths)

    for idx, image in enumerate(images):
        task_id = make_task_id()
        relative_path = image_paths[idx] if idx < len(image_paths) else (image.filename or "")
        source_type = "folder" if "/" in str(relative_path).replace("\\", "/") else "batch"
        saved_path, original_name, display_name = await save_upload_file(
            image=image,
            task_id=task_id,
            upload_group=batch_id,
            relative_path=relative_path,
        )
        create_task(
            task_id=task_id,
            mode=mode,
            saved_path=saved_path,
            original_file_name=original_name,
            display_name=display_name,
            upload_group=batch_id,
            source_type=source_type,
            relative_path=str(relative_path or ""),
        )
        start_task_thread(task_id)
        tasks.append(
            {
                "taskId": task_id,
                "fileName": display_name,
                "relativePath": str(relative_path or ""),
                "status": "queued",
            }
        )

    return {
        "batchId": batch_id,
        "sourceType": "folder" if has_folder_structure else "batch",
        "status": "queued",
        "tasks": tasks,
        "message": f"批量任务已提交：{len(tasks)} 张图片",
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

    input_image_url = ""
    input_image_path_text = row["input_image_path"] or ""
    if input_image_path_text:
        input_image_url = maybe_to_media_url(Path(input_image_path_text))

    flow = parse_flow_from_task(task_id, merged_logs)

    return {
        "taskId": row["id"],
        "mode": row["mode"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "fileName": row["display_name"] or row["original_file_name"] or Path(row["input_image_path"]).name,
        "originalFileName": row["original_file_name"] or "",
        "relativePath": row["relative_path"] or "",
        "sourceType": row["source_type"] or "single",
        "uploadGroup": row["upload_group"] or "",
        "inputImageUrl": input_image_url,
        "resultImageUrl": row["result_image_url"],
        "errorMessage": row["error_message"] or "",
        "logText": "\n".join(log_lines[-200:]),
        "flow": flow,
    }


@app.post("/api/tasks/{task_id}/cancel")
def cancel_task(task_id: str):
    with get_db_conn() as conn:
        row = conn.execute("SELECT status FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="任务不存在")

    status = row["status"]
    if status in {"done", "failed", "cancelled"}:
        return {"taskId": task_id, "status": status, "message": "任务已结束，无需取消"}

    update_task(task_id, cancel_requested=1, status="cancelling")
    append_task_log(task_id, "[system] 用户发起取消任务请求")

    with ACTIVE_PROCESSES_LOCK:
        proc = ACTIVE_PROCESSES.get(task_id)

    if proc and proc.poll() is None:
        try:
            proc.terminate()
        except Exception:  # noqa: BLE001
            pass

    return {"taskId": task_id, "status": "cancelling", "message": "取消请求已提交"}


@app.get("/api/history")
def get_history():
    with get_db_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, mode, status, created_at, result_image_url,
                   input_image_path, display_name, original_file_name,
                   upload_group, source_type, relative_path
            FROM tasks
            ORDER BY created_at DESC
            LIMIT 500
            """
        ).fetchall()

    group_rows: dict[str, list[sqlite3.Row]] = defaultdict(list)
    singles: list[sqlite3.Row] = []

    for row in rows:
        source_type = row["source_type"] or "single"
        group = row["upload_group"] or ""
        if source_type in {"folder", "batch"} and group:
            group_rows[group].append(row)
        else:
            singles.append(row)

    entries: list[dict] = []

    for row in singles:
        display_name = row["display_name"] or row["original_file_name"] or Path(row["input_image_path"]).name
        entries.append(
            {
                "entryType": "single",
                "id": row["id"],
                "taskId": row["id"],
                "fileName": display_name,
                "mode": row["mode"],
                "status": row["status"],
                "createdAt": row["created_at"],
                "thumbnailUrl": row["result_image_url"] or "",
            }
        )

    for group_id, group_items in group_rows.items():
        sorted_items = sorted(group_items, key=lambda r: r["created_at"], reverse=True)
        latest = sorted_items[0]
        sample_relative = (latest["relative_path"] or "").replace("\\", "/")
        root_name = sample_relative.split("/")[0] if "/" in sample_relative else group_id
        child_items = []
        for row in sorted_items:
            display_name = row["display_name"] or row["original_file_name"] or Path(row["input_image_path"]).name
            child_items.append(
                {
                    "id": row["id"],
                    "taskId": row["id"],
                    "fileName": display_name,
                    "relativePath": row["relative_path"] or "",
                    "mode": row["mode"],
                    "status": row["status"],
                    "createdAt": row["created_at"],
                    "thumbnailUrl": row["result_image_url"] or "",
                }
            )

        entries.append(
            {
                "entryType": latest["source_type"] or "batch",
                "id": group_id,
                "groupId": group_id,
                "groupName": root_name,
                "mode": latest["mode"],
                "status": latest["status"],
                "createdAt": latest["created_at"],
                "thumbnailUrl": latest["result_image_url"] or "",
                "count": len(child_items),
                "items": child_items,
            }
        )

    entries.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    return entries