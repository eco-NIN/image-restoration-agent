'''
Author: Yuzhe Guo
Date: 2026-03-06 17:30:45
FilePath: /image-restoration-agent/backend/app/main.py
Descripttion: 
'''
# @Author  :eco
# @Date    :2026/3/6 17:30
# @Function:
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

@app.get("/")
def read_root():
    return {"message": "Image Restoration Agent API"}