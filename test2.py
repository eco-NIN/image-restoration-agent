# @Author  :eco
# @Date    :2026/3/10 23:30
# @Function:

import pyiqa
import torch
import os

# 1. 自动检测 GPU/CPU
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"当前计算设备: {device}\n")

# 2. 召唤无参考评价模型 (NIQE 和 MUSIQ)
print("正在加载模型，请稍候...")
niqe_metric = pyiqa.create_metric('niqe', device=device)
musiq_metric = pyiqa.create_metric('musiq', device=device)

# 3. 把你的图片装进列表里
# 注意：请确保你的实际文件名与这里一致，比如是 .jpg 还是 .png
image_list = ['before.jpg', 'after1.jpg', 'after2.jpg', 'after3.jpg']

# 4. 打印漂亮的表头
print("\n" + "=" * 50)
print(f"{'图片名称':<15} | {'NIQE (↓越小越好)':<15} | {'MUSIQ (↑越大越好)':<15}")
print("-" * 50)

# 5. 循环遍历打分
for img_name in image_list:
    # 检查图片存不存在，防止报错卡死
    if not os.path.exists(img_name):
        print(f"{img_name:<15} | ❌ 找不到文件，请检查路径!")
        continue

    try:
        # 计算得分 (.item() 是为了把 tensor 转成普通的 Python 浮点数)
        score_niqe = niqe_metric(img_name).item()
        score_musiq = musiq_metric(img_name).item()

        # 格式化输出，保留 4 位小数
        print(f"{img_name:<15} | {score_niqe:<15.4f} | {score_musiq:<15.4f}")

    except Exception as e:
        print(f"{img_name:<15} | ❌ 计算出错: {e}")

print("=" * 50 + "\n")
print("✅ 测试完成！")