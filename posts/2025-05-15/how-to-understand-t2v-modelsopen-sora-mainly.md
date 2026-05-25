---
title: How to Understand T2V Models?(Open-Sora MAINLY)
date: 2025-05-15
tags: [Windows相关]
---

\n

### Open-Sora 的典型架构组成：

\n\n\n\n

\n
  1. **Text Encoder** （CLIP or T5）\n\n
     * 将文本编码为嵌入向量
\n\n\n\n
     * 通常作为 cross-attention 的 key/value 输入
\n\n
\n\n\n\n
  2. **Latent Space 编码器/解码器** \n\n
     * 使用 VAE 将视频压缩到隐空间
\n\n\n\n
     * 减少计算量，提升训练效率
\n\n
\n\n\n\n
  3. **Video Diffusion Transformer (Video DiT)** \n\n
     * 包含多个 **Transformer Block**
\n\n\n\n
     * 每个 Block 内部包含：\n\n
       * Spatio-Temporal Attention（空间+时间注意力）
\n\n\n\n
       * Cross-Attention（与文本嵌入交互）
\n\n\n\n
       * FFN（前馈网络）
\n\n
\n\n
\n\n\n\n
  4. **Noise Predictor / Denoiser Head** \n\n
     * 预测噪声残差，用于去噪过程
\n\n
\n
\n