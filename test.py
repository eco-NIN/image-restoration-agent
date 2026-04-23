'''
Author: Yuzhe Guo
Date: 2026-03-10 23:13:44
FilePath: /image-restoration-agent/test.py
Descripttion: 
'''
import pyiqa
import torch

# 1. 自动检测使用 GPU 还是 CPU
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"当前使用的设备: {device}\n")

# 2. 召唤无参考评价模型 (直接调包！)
# NIQE: 基于自然图像统计特征，越低越好
niqe_metric = pyiqa.create_metric('niqe', device=device)
# MUSIQ: 基于 Transformer 的多尺度模型，越高越好
musiq_metric = pyiqa.create_metric('musiq', device=device)

# 3. 准备你要测试的图片路径 (只需单张图片输入)
img_clear = 'clear.jpg'
img_blurry = 'blurry.jpg'

print("--- 开始打分 ---")

# 4. 对清晰图片独立打分
print("【清晰网图】的得分:")
score_niqe_clear = niqe_metric(img_clear)
score_musiq_clear = musiq_metric(img_clear)
print(f"NIQE: {score_niqe_clear.item():.4f} (越小越好)")
print(f"MUSIQ: {score_musiq_clear.item():.4f} (越大越好)\n")

# 5. 对模糊图片独立打分
print("【模糊网图】的得分:")
score_niqe_blurry = niqe_metric(img_blurry)
score_musiq_blurry = musiq_metric(img_blurry)
print(f"NIQE: {score_niqe_blurry.item():.4f} (越小越好)")
print(f"MUSIQ: {score_musiq_blurry.item():.4f} (越大越好)")